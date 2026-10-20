#!/usr/bin/env bash
# Build the Dexed WebCLAP bundle into build/dexed/web/dexed.wclap, next to the test host. Needs Emscripten (emsdk) and
# the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/dexed"
WEB="$BUILD/web"
BUNDLE="$WEB/dexed.wclap"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/dexed" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The bundle's page (ui/), the test host at web/
cp "$ROOT/modules/juce_webclap/js/"*.js "$ROOT/ports/dexed/ui/"* "$BUNDLE/ui/"
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo '["dexed.wclap"]' > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md, licenses/)
source "$ROOT/scripts/bundle-license.sh"
bundle_license "$BUNDLE" "$ROOT/ports/dexed/NOTICES.md.in" \
    "$ROOT/external/dexed/LICENSE" GPL-3.0.txt \
    "$ROOT/licenses/Apache-2.0.txt" Apache-2.0.txt \
    "$ROOT/licenses/OFL-1.1-NotoSans.txt" OFL-1.1-NotoSans.txt \
    "$ROOT/external/dexed/libs/tuning-library/LICENSE.md" tuning-library-MIT.txt \
    "$ROOT/external/fonts/DejaVu-LICENSE" DejaVu.txt \
    "${JUCE_CORE_LICENSES[@]}" "${JUCE_GRAPHICS_LICENSES[@]}" "${JUCE_FLAC_LICENSES[@]}"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/dexed.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
