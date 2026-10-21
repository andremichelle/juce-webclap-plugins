#!/usr/bin/env bash
# Build the coopiano WebCLAP bundle into build/coopiano/web/coopiano.wclap, next to the test host. Needs
# Emscripten (emsdk) and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/coopiano"
WEB="$BUILD/web"
BUNDLE="$WEB/coopiano.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/coopiano" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The test host at web/ (the bundle has no ui/)
cp "$ROOT/test-host/"* "$WEB/"
echo '["coopiano.wclap"]' > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md): MIT throughout, no JUCE
source "$ROOT/scripts/bundle-license.sh"
BUNDLE_LICENSE="$ROOT/external/coopiano/LICENSE" bundle_license "$BUNDLE" "$ROOT/ports/coopiano/NOTICES.md.in"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/coopiano.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB 8129"
