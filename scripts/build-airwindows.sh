#!/usr/bin/env bash
# Build the Airwindows Basics WebCLAP bundle into build/airwindows/web/airwindows.wclap, next to the test
# host. Needs Emscripten (emsdk) and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/airwindows"
WEB="$BUILD/web"
BUNDLE="$WEB/airwindows.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/airwindows" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The bundle's page (ui/), the test host at web/
cp "$ROOT/modules/juce_webclap/js/"*.js "$ROOT/ports/airwindows/ui/"* "$BUNDLE/ui/"
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo '["airwindows.wclap"]' > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md, licenses/)
source "$ROOT/scripts/bundle-license.sh"
AW="$ROOT/external/airwin2rack"
bundle_license "$BUNDLE" "$ROOT/ports/airwindows/NOTICES.md.in" \
    "$AW/LICENSE.md" MIT-Airwindows-Consolidated.txt \
    "$AW/res/OFL.txt" OFL-PlusJakartaSans.txt \
    "$ROOT/ports/airwindows/OFL-FiraMono.txt" OFL-FiraMono.txt \
    "$ROOT/external/fonts/DejaVu-LICENSE" DejaVu.txt \
    "${JUCE_CORE_LICENSES[@]}" "${JUCE_GRAPHICS_LICENSES[@]}"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/airwindows.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
