#!/usr/bin/env bash
# Build the OB-Xf UI prototype into build/obxf/web. Needs Emscripten (emsdk) and the deps from fetch-deps.py.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build/obxf"

if ! command -v emcmake >/dev/null 2>&1; then
    for env in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" "$HOME/Development/emsdk/emsdk_env.sh"; do
        if [ -f "$env" ]; then source "$env" >/dev/null 2>&1; break; fi
    done
fi

python3 "$ROOT/scripts/fetch-deps.py"

emcmake cmake -S "$ROOT/prototypes/obxf" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release "$@"
cmake --build "$BUILD" -j "$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

# Pages: the fake host at web/, the plugin's page at web/plugin/
cp "$ROOT/prototypes/obxf/web/"*.html "$ROOT/prototypes/obxf/web/"*.js "$ROOT/prototypes/obxf/web/"*.css "$BUILD/web/"
cp "$ROOT/modules/juce_webclap_ui/js/"*.js "$BUILD/web/plugin/"
cp "$ROOT/prototypes/obxf/web/plugin/"* "$BUILD/web/plugin/"
echo "Built $BUILD/web — serve it with: python3 $ROOT/scripts/serve.py $BUILD/web"
