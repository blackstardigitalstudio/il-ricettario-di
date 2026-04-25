#!/bin/bash
# eas-build-post-install.sh
# This script runs on EAS Build cloud servers AFTER `npm/yarn install` and
# AFTER any prebuild/sync that EAS may run, but BEFORE `gradlew` is executed.
#
# Purpose: Patch android/app/build.gradle to remove all dynamic node-execute
# calls that fail on the EAS cloud environment with:
#   "Cannot invoke method getAbsolutePath() on null object"
#
# This guarantees the patch is applied no matter what EAS does to the file
# during its sync/prebuild phases.

set -e

GRADLE_FILE="android/app/build.gradle"

if [ ! -f "$GRADLE_FILE" ]; then
  echo "[post-install] $GRADLE_FILE not found, skipping patch."
  exit 0
fi

echo "[post-install] Patching $GRADLE_FILE for EAS cloud compatibility..."

# Use python for reliable in-place line replacement (sed escaping is a nightmare
# on multiline gradle expressions).
python3 - <<'PYEOF'
import re

path = "android/app/build.gradle"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

STATIC = {
    "entryFile":    '    entryFile = file("$rootDir/../node_modules/expo-router/entry.js")',
    "reactNativeDir": '    reactNativeDir = file("$rootDir/../node_modules/react-native")',
    "hermesCommand": '    hermesCommand = "$rootDir/../node_modules/react-native/sdks/hermesc/%OS-BIN%/hermesc"',
    "codegenDir":   '    codegenDir = file("$rootDir/../node_modules/@react-native/codegen")',
    "cliFile":      '    cliFile = file("$rootDir/../node_modules/@expo/cli/build/bin/cli")',
}

patched = []
for i, line in enumerate(lines):
    stripped = line.strip()
    handled = False
    for key, replacement in STATIC.items():
        if stripped.startswith(key) and ".execute(" in stripped:
            lines[i] = replacement + "\n"
            patched.append(f"line {i+1}: {key} -> static")
            handled = True
            break

if patched:
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("[post-install] Patched lines:")
    for p in patched:
        print(f"  - {p}")
else:
    print("[post-install] No dynamic lines found - file already clean.")
PYEOF

echo "[post-install] Done."
