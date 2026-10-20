#!/usr/bin/env bash
# Build the Nekobi WebCLAP bundle (see build-dpf.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/build-dpf.sh" nekobi \
    "$ROOT/external/Nekobi/LICENSE" Nekobi-GPL-2.0.txt \
    "$ROOT/external/DPF/LICENSE" DPF-ISC.txt
