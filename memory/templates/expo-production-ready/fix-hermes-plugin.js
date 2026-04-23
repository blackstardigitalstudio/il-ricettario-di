/**
 * Expo Config Plugin — Fix hermesCommand path in android/app/build.gradle
 *
 * Replaces the dynamic node-execute based hermesCommand (which fails on EAS Build
 * cloud environment with "Cannot invoke method getAbsolutePath() on null object")
 * with a static relative path that works reliably in both local and cloud environments.
 *
 * Issue: https://github.com/expo/expo/issues/ (Gradle config phase null pointer)
 * Applies to: Expo SDK 54 + React Native 0.81.x + EAS Build
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const STATIC_HERMES_COMMAND =
  'hermesCommand = "$rootDir/../node_modules/react-native/sdks/hermesc/%OS-BIN%/hermesc"';

module.exports = function withHermesFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    // Match the dynamic hermesCommand line (whole line) and replace it.
    const replaced = contents.replace(
      /hermesCommand\s*=\s*new File\(\[.*?\]\.execute\(null,\s*rootDir\)\.text\.trim\(\)\)\.getParentFile\(\)\.getAbsolutePath\(\)\s*\+\s*"\/sdks\/hermesc\/%OS-BIN%\/hermesc"/,
      STATIC_HERMES_COMMAND,
    );
    if (replaced === contents) {
      console.warn(
        '[fix-hermes-plugin] hermesCommand line not found — did the build.gradle template change?',
      );
    } else {
      console.log('[fix-hermes-plugin] Patched hermesCommand to static path');
    }
    cfg.modResults.contents = replaced;
    return cfg;
  });
};
