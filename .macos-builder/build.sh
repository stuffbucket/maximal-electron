#!/usr/bin/env bash
set -euo pipefail

# PRODUCER for the stuffbucket/macos-builder pipeline.
#
# Its only job is to build the unsigned .app and leave it at the `app_path`
# declared in .macos-builder/config:
#
#   out/Stuffbucket-darwin-arm64/Stuffbucket.app
#
# It does NOT top-level sign, build a dmg or pkg, notarize, staple, or write
# OUTPUT_DIR. The builder owns that entire tail through lib/package-macos.sh,
# and this script is never handed APPLE_* or KEYCHAIN_PASSWORD.
#
# Builder-supplied environment consumed here: TAG, ARCH. Also available but
# unused, because an Electron app with no sidecar needs no inner signing:
# SIGN_IDENTITY, ENTITLEMENTS_DIR, BUN_INSTALL, CARGO_HOME, OUTPUT_DIR.
#
# The version stamp, the clean, and the bundle assertion below are lifted from
# maximal's producer. They exist because a stale Info.plist once shipped
# version 0.4.14 inside a 0.4.20 dmg. Keep all three.

# Self-hosted runners use non-login shells that do not read ~/.zshrc.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

VERSION="${TAG#v}"
ARCH="${ARCH:-arm64}"
APP="out/Stuffbucket-darwin-${ARCH}/Stuffbucket.app"

echo "Producing Stuffbucket.app for ${TAG} (version ${VERSION}, ${ARCH})"

command -v node >/dev/null 2>&1 || { echo "::error::node not on PATH" >&2; exit 1; }
node --version
npm --version

# 1. Stamp the version. Electron Forge reads it from package.json, not from git.
#    Match whatever value is there, not only the "0.0.0" placeholder, so a
#    stray committed version cannot slip through unstamped.
node -e '
  const fs = require("node:fs");
  const version = process.argv[1];
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = version;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "${VERSION}"

# 2. Assert the stamp took. A silent no-op would ship the wrong
#    CFBundleShortVersionString.
STAMPED="$(node -p "require('./package.json').version")"
echo "package.json version: ${STAMPED}"
if [ "${STAMPED}" != "${VERSION}" ]; then
  echo "::error::Failed to stamp version ${VERSION} into package.json" >&2
  exit 1
fi

# 3. Install exactly what the lockfile says.
npm ci

# 4. The self-hosted runner keeps out/ and .vite/ between builds, and neither
#    is fully regenerated. A stale bundle from a prior tag can otherwise
#    survive with the wrong version. Remove both.
rm -rf out .vite

# 5. Build the .app only. No maker runs: the builder produces the dmg.
npx electron-forge package --arch="${ARCH}" --platform=darwin

if [ ! -d "${APP}" ]; then
  echo "::error::Expected bundle not found at ${APP}" >&2
  ls -la out/ || true
  exit 1
fi

# 6. Proactive guard: the built bundle's version MUST match the tag. This
#    catches a stale or cached Info.plist at build time rather than in a user's
#    About box.
BUILT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "${APP}/Contents/Info.plist" 2>/dev/null || echo '')"
echo "Built bundle version: ${BUILT_VERSION} (expected ${VERSION})"
if [ "${BUILT_VERSION}" != "${VERSION}" ]; then
  echo "::error::Bundle version '${BUILT_VERSION}' != release version '${VERSION}'. Stale build artifact?" >&2
  exit 1
fi

echo "Produced ${APP}. The builder signs, packages, notarizes, and staples from here."
