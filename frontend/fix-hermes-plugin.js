/**
 * Expo Config Plugin — Fix ALL dynamic node-execute calls in android/app/build.gradle
 *
 * Problem (Expo SDK 54 + React Native 0.81.x on EAS Build):
 *   The generated android/app/build.gradle runs multiple `["node", "--print", ...].execute(null, rootDir)`
 *   commands during Gradle configuration to resolve package paths. These commands fail on the EAS cloud
 *   build environment, returning empty strings. Then `new File("").getParentFile()` returns null and any
 *   subsequent `.getAbsolutePath()` / `.getAbsoluteFile()` call throws
 *   "Cannot invoke method getAbsolutePath() on null object" at whatever line happens to be the first one evaluated.
 *
 * Fix: replace every dynamic `node --print ... execute()` call with a static relative path
 *      rooted on `$rootDir/..` (the project root). This works identically on local & EAS environments.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

// Static replacements for the `react { ... }` block
const STATIC_LINES = {
  // entryFile: resolved app entry js (require expo/scripts/resolveAppEntry).
  // We pass the resolve logic via a small gradle expression using relative node_modules path.
  entryFile:
    '    entryFile = file(["node", "-e", "require(\'expo/scripts/resolveAppEntry\')", "$rootDir/..", "android", "absolute"].execute(null, rootDir).text.trim())',
  reactNativeDir: '    reactNativeDir = file("$rootDir/../node_modules/react-native")',
  hermesCommand:
    '    hermesCommand = "$rootDir/../node_modules/react-native/sdks/hermesc/%OS-BIN%/hermesc"',
  codegenDir: '    codegenDir = file("$rootDir/../node_modules/@react-native/codegen")',
  cliFile: '    cliFile = file("$rootDir/../node_modules/@expo/cli/build/bin/cli")',
};

module.exports = function withGradleFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    const lines = cfg.modResults.contents.split('\n');
    const patches = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      // Only touch lines that contain a dynamic `.execute(null, rootDir)` call.
      if (!trimmed.includes('.execute(null, rootDir)')) continue;

      if (trimmed.startsWith('hermesCommand')) {
        lines[i] = STATIC_LINES.hermesCommand;
        patches.push(`line ${i + 1}: hermesCommand -> static`);
      } else if (trimmed.startsWith('reactNativeDir')) {
        lines[i] = STATIC_LINES.reactNativeDir;
        patches.push(`line ${i + 1}: reactNativeDir -> static`);
      } else if (trimmed.startsWith('codegenDir')) {
        lines[i] = STATIC_LINES.codegenDir;
        patches.push(`line ${i + 1}: codegenDir -> static`);
      } else if (trimmed.startsWith('cliFile')) {
        lines[i] = STATIC_LINES.cliFile;
        patches.push(`line ${i + 1}: cliFile -> static`);
      }
      // entryFile is left as-is because it still needs to execute the JS resolver,
      // but we pass a static project root so the node command doesn't rely on require.resolve().
      else if (trimmed.startsWith('entryFile')) {
        lines[i] = STATIC_LINES.entryFile;
        patches.push(`line ${i + 1}: entryFile -> static root`);
      }
    }

    if (patches.length === 0) {
      console.warn(
        '[fix-gradle-plugin] No dynamic lines found. build.gradle may have been updated.',
      );
    } else {
      console.log('[fix-gradle-plugin] Patched ' + patches.length + ' line(s):');
      patches.forEach((p) => console.log('  • ' + p));
    }

    cfg.modResults.contents = lines.join('\n');
    return cfg;
  });
};
