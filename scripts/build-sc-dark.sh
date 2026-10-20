#!/usr/bin/env bash
# SC Dark uses Rust/WASI, not the JUCE/Emscripten kit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/ports/sc-dark/build.mjs" "$@"
