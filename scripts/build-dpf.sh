#!/usr/bin/env bash
# Build a DPF port's WebCLAP bundle into build/<port>/web/<port>.wclap, next to the test host. Used by
# build-kars.sh, build-nekobi.sh, ...
#
#   scripts/build-dpf.sh <port> <plugin license file> <licenses/ name> [<more license file> <licenses/ name>]...
#
# Needs Emscripten (emsdk) and the deps from fetch-deps.py. There is no JUCE in these bundles, so unlike
# bundle-license.sh the bundle's LICENSE is the plugin's own (ports/<port>/LICENSE), not the AGPL-3.0.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="$1"; shift
BUILD="$ROOT/build/$PORT"
WEB="$BUILD/web"
BUNDLE="$WEB/$PORT.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/$PORT" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The test host at web/ (a bundle without an editor page gets its parameters as sliders)
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo "[\"$PORT.wclap\"]" > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md, licenses/)
remote="$(git -C "$ROOT" remote get-url origin | sed -e 's|^git@github.com:|https://github.com/|' -e 's|\.git$||')"
source_url="$remote/tree/$(git -C "$ROOT" rev-parse HEAD)"
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    source_url="$source_url (plus uncommitted changes: not a release build)"
fi
rm -rf "$BUNDLE/licenses"; mkdir -p "$BUNDLE/licenses"
cp "$ROOT/ports/$PORT/LICENSE" "$BUNDLE/LICENSE"
while [ $# -ge 2 ]; do
    cp "$1" "$BUNDLE/licenses/$2"
    shift 2
done
sed -e "s|@SOURCE_URL@|$source_url|" "$ROOT/ports/$PORT/NOTICES.md.in" > "$BUNDLE/NOTICES.md"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/$PORT.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
