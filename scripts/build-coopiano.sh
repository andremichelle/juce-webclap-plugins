#!/usr/bin/env bash
# Build the coopiano WebCLAP bundle into build/coopiano/web/coopiano.wclap. Needs
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

# The bundle's page (ui/)
mkdir -p "$BUNDLE/ui"
cp "$ROOT/ports/coopiano/ui/"* "$BUNDLE/ui/"

# License and notices (LICENSE, NOTICES.md): MIT throughout, no JUCE
source "$ROOT/scripts/bundle-license.sh"
BUNDLE_LICENSE="$ROOT/external/coopiano/LICENSE" bundle_license "$BUNDLE" "$ROOT/ports/coopiano/NOTICES.md.in"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/coopiano.wclap.tar.gz"
echo "Built $BUNDLE — try it in the test host: python3 $ROOT/scripts/serve.py $ROOT, then"
echo "http://127.0.0.1:8123/test-host/?bundle=/build/coopiano/web/coopiano.wclap"
