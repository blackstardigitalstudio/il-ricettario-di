/**
 * AdMob service — Rewarded Interstitial ads for Il Ricettario.
 *
 * Requirements (confirmed with user):
 *   1. Show ad every 5 recipes saved
 *   2. Show ad every 5 ingredient analyses
 *   3. Show ad every 5 shopping list generations
 *   4. Show ad ALWAYS before backup export (mandatory)
 *
 * Safety notes:
 *   - Native module is ONLY available in EAS builds (not Expo Go / web).
 *     All entry points are wrapped in try/catch so the app degrades
 *     gracefully when the module is missing — the user action still proceeds.
 *   - In __DEV__ we use Google's test ad unit IDs (safe to show without
 *     violating AdMob policies). In production we use the real IDs provided
 *     by the user.
 *   - EU consent (UMP) is requested on first launch when required.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ----------------- CONFIG -----------------
// Real ad unit for production, Google test unit for development/Expo Go.
const TEST_REWARDED_INTERSTITIAL = 'ca-app-pub-3940256099942544/5354046379';
const PROD_REWARDED_INTERSTITIAL = 'ca-app-pub-8637618891395008/5115573419';

const AD_UNIT_ID = __DEV__ ? TEST_REWARDED_INTERSTITIAL : PROD_REWARDED_INTERSTITIAL;

// Counters stored in AsyncStorage so they survive app restarts.
type CounterKey = 'save_recipe' | 'analyze_ingredients' | 'generate_shopping';
const COUNTER_KEYS: Record<CounterKey, string> = {
  save_recipe: 'ad_counter_save_recipe',
  analyze_ingredients: 'ad_counter_analyze',
  generate_shopping: 'ad_counter_shopping',
};
const TRIGGER_EVERY = 5;

let _sdkReady = false;
let _initPromise: Promise<void> | null = null;

// ----------------- SDK LOADER (lazy) -----------------
// We lazily require() the native module so that web / Expo Go do not crash
// at import time.
let _mobileAds: any = null;
let _RewardedInterstitialAd: any = null;
let _AdEventType: any = null;
let _RewardedInterstitialAdEventType: any = null;

function _loadSdk(): boolean {
  if (Platform.OS === 'web') return false;
  if (_RewardedInterstitialAd) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admob = require('react-native-google-mobile-ads');
    _mobileAds = admob.default;
    _RewardedInterstitialAd = admob.RewardedInterstitialAd;
    _AdEventType = admob.AdEventType;
    _RewardedInterstitialAdEventType = admob.RewardedAdEventType;
    return true;
  } catch (e) {
    return false;
  }
}

// ----------------- INIT (idempotent) -----------------
export async function initAdMob(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!_loadSdk()) return;
    try {
      // Request consent (UMP) for EU users
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AdsConsent, AdsConsentStatus } = require('react-native-google-mobile-ads');
        const info = await AdsConsent.requestInfoUpdate();
        if (
          info?.isConsentFormAvailable &&
          info?.status === AdsConsentStatus.REQUIRED
        ) {
          await AdsConsent.showForm();
        }
      } catch (e) {
        // Consent form failure is not blocking — continue with non-personalized.
      }

      await _mobileAds().initialize();
      _sdkReady = true;
    } catch (e) {
      _sdkReady = false;
    }
  })();
  return _initPromise;
}

// ----------------- COUNTER HELPERS -----------------
async function _bumpCounter(key: CounterKey): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(COUNTER_KEYS[key]);
    const current = parseInt(raw || '0', 10) || 0;
    const next = current + 1;
    await AsyncStorage.setItem(COUNTER_KEYS[key], String(next));
    return next;
  } catch {
    return 0;
  }
}

// ----------------- SHOW AD -----------------
/**
 * Loads and displays a rewarded interstitial ad.
 * Resolves to `true` once the ad lifecycle completes (regardless of whether
 * the user earned the reward or skipped), `false` if the SDK is unavailable
 * or the ad failed to load within a reasonable timeout.
 */
function _showAdOnce(timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!_loadSdk() || !_sdkReady || !_RewardedInterstitialAd) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    try {
      const ad = _RewardedInterstitialAd.createForAdRequest(AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: false,
      });

      const unsubLoaded = ad.addAdEventListener(
        _RewardedInterstitialAdEventType.LOADED,
        () => {
          try {
            ad.show();
          } catch (e) {
            finish(false);
          }
        },
      );
      const unsubClosed = ad.addAdEventListener(_AdEventType.CLOSED, () => {
        try { unsubLoaded && unsubLoaded(); } catch {}
        try { unsubClosed && unsubClosed(); } catch {}
        finish(true);
      });
      const unsubError = ad.addAdEventListener(_AdEventType.ERROR, () => {
        try { unsubLoaded && unsubLoaded(); } catch {}
        try { unsubError && unsubError(); } catch {}
        finish(false);
      });

      ad.load();

      // Hard timeout — never keep the user waiting.
      setTimeout(() => finish(false), timeoutMs);
    } catch (e) {
      finish(false);
    }
  });
}

/**
 * Trigger point #1-3: counter-based. Call every time the user performs the
 * target action. The ad is only shown when the counter hits a multiple of
 * TRIGGER_EVERY (default: 5). Returns `true` once the user action is free
 * to proceed. The returned Promise always resolves so callers never block
 * indefinitely.
 */
export async function triggerCountedAd(key: CounterKey): Promise<boolean> {
  try {
    // Fire and forget init (fast after first call).
    await initAdMob();
    const n = await _bumpCounter(key);
    if (n % TRIGGER_EVERY !== 0) return true; // no ad this time
    await _showAdOnce();
    return true;
  } catch {
    return true; // degrade gracefully
  }
}

/**
 * Trigger point #4: mandatory ad before a specific action (e.g. backup export).
 * Unlike counter-based triggers, this ALWAYS attempts to show the ad first.
 * Returns true so the caller can always proceed (policy-safe: if the ad
 * can't load we don't block the user — this also keeps us compliant with
 * AdMob which forbids blocking app features when ad loading fails).
 */
export async function mandatoryAd(): Promise<boolean> {
  try {
    await initAdMob();
    await _showAdOnce();
    return true;
  } catch {
    return true;
  }
}
