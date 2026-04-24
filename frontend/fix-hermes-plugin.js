/**
 * Expo Config Plugin — Fix hermesCommand in android/app/build.gradle
 *
 * Problem: Expo SDK 54 + React Native 0.81.x generate a `hermesCommand = new File(...).execute(null, rootDir)...`
 * expression that evaluates a shell `node` command inside Gradle. This fails on EAS Build cloud
 * environment with "Cannot invoke method getAbsolutePath() on null object" at line 14.
 *
 * Fix: replace that entire line with a static relative path that works on any environment.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const STATIC_HERMES = '    hermesCommand = "$rootDir/../node_modules/react-native/sdks/hermesc/%OS-BIN%/hermesc"';

module.exports = function withHermesFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;
    const lines = contents.split('\n');
    let patched = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // Match any line that starts with "hermesCommand" assignment and contains the dynamic execute
      if (
        trimmed.startsWith('hermesCommand') &&
        trimmed.includes('execute(') &&
        trimmed.includes('rootDir') &&
        trimmed.includes('hermesc')
      ) {
        console.log(
          `[fix-hermes-plugin] Found dynamic hermesCommand at line ${i + 1}, replacing with static path`,
        );
        lines[i] = STATIC_HERMES;
        patched = true;
        break;
      }
    }

    if (!patched) {
      console.warn(
        '[fix-hermes-plugin] Could not locate dynamic hermesCommand line. Dumping first 25 lines of build.gradle for debug:',
      );
      console.warn(lines.slice(0, 25).map((l, i) => `${i + 1}: ${l}`).join('\n'));
    }

    cfg.modResults.contents = lines.join('\n');
    return cfg;
  });
};
