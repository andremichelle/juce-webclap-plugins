#!/usr/bin/env bash
# Build the RipplerX WebCLAP bundle into build/ripplerx/web/ripplerx.wclap, next to the test host. Needs Emscripten
# (emsdk) and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/ripplerx"
WEB="$BUILD/web"
BUNDLE="$WEB/ripplerx.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/ripplerx" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The bundle's page (ui/), the test host at web/
cp "$ROOT/modules/juce_webclap/js/"*.js "$ROOT/ports/ripplerx/ui/"* "$BUNDLE/ui/"
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo '["ripplerx.wclap"]' > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md, licenses/)
source "$ROOT/scripts/bundle-license.sh"
bundle_license "$BUNDLE" "$ROOT/ports/ripplerx/NOTICES.md.in" \
    "$ROOT/external/ripplerx/LICENSE" GPL-3.0.txt \
    "$ROOT/licenses/UFL-1.0.txt" UFL-1.0-Ubuntu.txt \
    "$ROOT/external/fonts/DejaVu-LICENSE" DejaVu.txt \
    "${JUCE_CORE_LICENSES[@]}" "${JUCE_GRAPHICS_LICENSES[@]}" "${JUCE_FLAC_LICENSES[@]}"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/ripplerx.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
