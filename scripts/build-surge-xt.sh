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

# The bundle's page (ui/) with the factory patches it browses, the test host at web/
rm -rf "$BUNDLE/ui"
mkdir -p "$BUNDLE/ui"
cp "$ROOT/ports/surge-xt/ui/"* "$BUNDLE/ui/"
cp -R "$SURGE/resources/data/patches_factory" "$BUNDLE/ui/patches"
python3 - "$BUNDLE/ui/patches" <<'PY'
import json, os, sys
root = sys.argv[1]
patches = []
for category in sorted(os.listdir(root), key=str.lower):
    folder = os.path.join(root, category)
    if not os.path.isdir(folder):
        continue
    for dirpath, _, files in sorted(os.walk(folder)):
        for f in sorted(files, key=str.lower):
            if f.endswith(".fxp"):
                path = os.path.relpath(os.path.join(dirpath, f), root)
                patches.append({"category": category, "name": f[:-4], "path": path})
json.dump(patches, open(os.path.join(root, "index.json"), "w"), indent=0)
print(f"{len(patches)} factory patches")
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
    "${JUCE_CORE_LICENSES[@]}" "${JUCE_FLAC_LICENSES[@]}"

# The archive hosts import (openDAW: Import WebCLAP...)
python3 "$ROOT/scripts/pack-wclap.py" "$BUNDLE" "$BUILD/surge-xt.wclap.tar.gz"
echo "Built $BUNDLE — serve the test host with: python3 $ROOT/scripts/serve.py $WEB"
