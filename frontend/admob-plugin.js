/**
 * Custom Expo Config Plugin for Google AdMob.
 *
 * This is a local replacement for the `react-native-google-mobile-ads` config plugin.
 * It injects the Android AdMob APPLICATION_ID meta-data into AndroidManifest.xml
 * and the iOS GADApplicationIdentifier into Info.plist.
 *
 * Use it in app.json like:
 *   "plugins": [
 *     ["./admob-plugin", { "androidAppId": "ca-app-pub-...", "iosAppId": "ca-app-pub-..." }]
 *   ]
 */
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const ANDROID_META_NAME = 'com.google.android.gms.ads.APPLICATION_ID';

function withAdMobAndroid(config, { androidAppId }) {
  if (!androidAppId) return config;
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application && manifest.manifest.application[0];
    if (!app) return cfg;
    app['meta-data'] = app['meta-data'] || [];
    const existing = app['meta-data'].find(
      (m) => m.$ && m.$['android:name'] === ANDROID_META_NAME,
    );
    if (existing) {
      existing.$['android:value'] = androidAppId;
    } else {
      app['meta-data'].push({
        $: {
          'android:name': ANDROID_META_NAME,
          'android:value': androidAppId,
        },
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
