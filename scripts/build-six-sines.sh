#!/usr/bin/env bash
# Build the Six Sines WebCLAP bundle into build/six-sines/web/six-sines.wclap, next to the test host. Needs
# Emscripten (emsdk) and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/six-sines"
WEB="$BUILD/web"
BUNDLE="$WEB/six-sines.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/six-sines" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The bundle's page (ui/), the test host at web/
cp "$ROOT/modules/juce_webclap/js/"*.js "$ROOT/ports/six-sines/ui/"* "$BUNDLE/ui/"
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo '["six-sines.wclap"]' > "$WEB/bundles.json"

# License and notices. NOTICES.md names the commit this bundle was built from, the source the GPL/AGPL asks for.
SIX="$ROOT/external/six-sines"
REMOTE="$(git -C "$ROOT" remote get-url origin | sed -e 's|^git@github.com:|https://github.com/|' -e 's|\.git$||')"
SOURCE_URL="$REMOTE/tree/$(git -C "$ROOT" rev-parse HEAD)"
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    SOURCE_URL="$SOURCE_URL (plus uncommitted changes: not a release build)"
fi
mkdir -p "$BUNDLE/licenses"
cp "$ROOT/licenses/AGPL-3.0.txt" "$BUNDLE/LICENSE"
cp "$SIX/resources/LICENSE_GPL3" "$BUNDLE/licenses/GPL-3.0.txt"
cp "$SIX/resources/fonts/Manrope/OFL.txt" "$BUNDLE/licenses/OFL-Manrope.txt"
cp "$SIX/resources/fonts/Anonymous_Pro/OFL.txt" "$BUNDLE/licenses/OFL-AnonymousPro.txt"
cp "$ROOT/external/fonts/DejaVu-LICENSE" "$BUNDLE/licenses/DejaVu.txt"
sed "s|@SOURCE_URL@|$SOURCE_URL|" "$ROOT/ports/six-sines/NOTICES.md.in" > "$BUNDLE/NOTICES.md"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/six-sines.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
