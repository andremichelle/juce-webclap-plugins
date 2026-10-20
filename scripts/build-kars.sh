#!/usr/bin/env bash
# Build the Kars WebCLAP bundle (see build-dpf.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/build-dpf.sh" kars \
    "$ROOT/external/Kars/LICENSE" Kars-ISC.txt \
    "$ROOT/external/DPF/LICENSE" DPF-ISC.txt
