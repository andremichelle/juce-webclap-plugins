#!/usr/bin/env bash
# Build the Surge XT WebCLAP bundle into build/surge-xt/web/surge-xt.wclap, next to the test host. Needs Emscripten
# (emsdk) and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/surge-xt"
WEB="$BUILD/web"
BUNDLE="$WEB/surge-xt.wclap"
SURGE="$ROOT/external/surge"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/ports/surge-xt" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# The bundle's page (ui/), the test host at web/
rm -f "$BUNDLE/ui/ui.data"
cp "$ROOT/modules/juce_webclap/js/"*.js "$ROOT/ports/surge-xt/ui/"* "$BUNDLE/ui/"

# The factory data, loaded file by file when the editor reads it: ui/factory/ and its manifest (path, size)
rm -rf "$BUNDLE/ui/factory"
cp -R "$SURGE/resources/data" "$BUNDLE/ui/factory"
python3 - "$BUNDLE/ui/factory" <<'PY'
import json, os, sys
root = sys.argv[1]
files = []
for folder, dirs, names in os.walk(root):
    dirs.sort()
    for name in sorted(names):
        path = os.path.join(folder, name)
        files.append([os.path.relpath(path, root).replace(os.sep, "/"), os.path.getsize(path)])
json.dump({"files": files}, open(os.path.join(root, "manifest.json"), "w"), separators=(",", ":"))
print(f"factory: {len(files)} files, {sum(size for _, size in files) / 1e6:.1f} MB")
PY
cp "$ROOT/modules/juce_webclap/test-host/"* "$WEB/"
echo '["surge-xt.wclap"]' > "$WEB/bundles.json"

# License and notices (LICENSE, NOTICES.md, licenses/)
source "$ROOT/scripts/bundle-license.sh"
bundle_license "$BUNDLE" "$ROOT/ports/surge-xt/NOTICES.md.in" \
    "$SURGE/LICENSE" GPL-3.0.txt \
    "$SURGE/libs/airwindows/LICENSE" Airwindows.txt \
    "$SURGE/libs/tuning-library/LICENSE.md" tuning-library.md \
    "$SURGE/libs/fmt/LICENSE" fmt.txt \
    "$SURGE/libs/PEGTL/LICENSE" PEGTL.txt \
    "$SURGE/libs/r8brain-free-src/LICENSE" r8brain.txt \
    "$SURGE/libs/zstd/LICENSE" zstd.txt \
    "$SURGE/libs/binn/LICENSE" binn.txt \
    "$SURGE/resources/fonts/OFL.txt" OFL-1.1-Lato.txt \
    "$ROOT/external/fonts/DejaVu-LICENSE" DejaVu.txt \
    "${JUCE_CORE_LICENSES[@]}" "${JUCE_GRAPHICS_LICENSES[@]}" "${JUCE_FLAC_LICENSES[@]}"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/surge-xt.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
