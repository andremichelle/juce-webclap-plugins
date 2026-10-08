#!/usr/bin/env bash
# Build the OB-Xf WebCLAP bundle into build/obxf/web/obxf.wclap, next to the test host. Needs Emscripten (emsdk)
# and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/obxf"
WEB="$BUILD/web"
BUNDLE="$WEB/obxf.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/obxf" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The bundle's page (ui/), the test host at web/
cp "$ROOT/modules/juce_webclap/js/"*.js "$ROOT/ports/obxf/ui/"* "$BUNDLE/ui/"
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo '["obxf.wclap"]' > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md, licenses/)
source "$ROOT/scripts/bundle-license.sh"
bundle_license "$BUNDLE" "$ROOT/ports/obxf/NOTICES.md.in" \
    "$ROOT/external/OB-Xf/LICENSE" GPL-3.0.txt \
    "$ROOT/ports/obxf/OFL-Jersey20.txt" OFL-Jersey20.txt \
    "$ROOT/external/fonts/DejaVu-LICENSE" DejaVu.txt

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/obxf.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
