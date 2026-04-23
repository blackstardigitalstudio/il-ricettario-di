/**
 * Local Expo Config Plugin for Google AdMob.
 *
 * Replaces the bundled `react-native-google-mobile-ads` config plugin when it
 * fails to resolve on some Windows setups (missing app.plugin.js, blocked by AV, etc).
 *
 * Usage in app.json:
 *   "plugins": [
 *     ["./admob-plugin", { "androidAppId": "ca-app-pub-XXXX~YYYY", "iosAppId": "ca-app-pub-XXXX~ZZZZ" }]
 *   ]
 */
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const ANDROID_META_NAME = 'com.google.android.gms.ads.APPLICATION_ID';

function withAdMobAndroid(config, { androidAppId }) {
  if (!androidAppId) return config;
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application && cfg.modResults.manifest.application[0];
    if (!app) return cfg;
    app['meta-data'] = app['meta-data'] || [];
    const existing = app['meta-data'].find(
      (m) => m.$ && m.$['android:name'] === ANDROID_META_NAME,
    );
    if (existing) {
      existing.$['android:value'] = androidAppId;
    } else {
      app['meta-data'].push({
        $: { 'android:name': ANDROID_META_NAME, 'android:value': androidAppId },
      });
    }
    return cfg;
  });
}

function withAdMobIos(config, { iosAppId }) {
  if (!iosAppId) return config;
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.GADApplicationIdentifier = iosAppId;
    return cfg;
  });
}

module.exports = function withAdMob(config, props = {}) {
  config = withAdMobAndroid(config, props);
  config = withAdMobIos(config, props);
  return config;
};
