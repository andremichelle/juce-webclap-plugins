#!/usr/bin/env bash
# Build the AyMidi WebCLAP bundle (see build-dpf.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/build-dpf.sh" aymidi \
    "$ROOT/external/aymidi/LICENSE" AyMidi-GPL-2.0.txt \
    "$ROOT/external/DPF/LICENSE" DPF-ISC.txt
