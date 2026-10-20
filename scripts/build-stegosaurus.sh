#!/usr/bin/env bash
# Build the Stegosaurus WebCLAP bundle (see build-dpf.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/build-dpf.sh" stegosaurus \
    "$ROOT/external/stegosaurus/LICENSE" Stegosaurus-GPL-2.0.txt \
    "$ROOT/external/DPF/LICENSE" DPF-ISC.txt
