#!/usr/bin/env bash
# Build the RaffoSynth WebCLAP bundle (see build-dpf.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/build-dpf.sh" raffosynth \
    "$ROOT/external/RaffoSynth-XT/LICENSE" RaffoSynth-XT-GPL-3.0.txt \
    "$ROOT/external/RaffoSynth-XT/src/LICENSE.md" RaffoSynth-MIT.txt \
    "$ROOT/external/DPF/LICENSE" DPF-ISC.txt
