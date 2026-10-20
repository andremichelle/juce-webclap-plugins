#!/usr/bin/env bash
# Build the MiMi-d WebCLAP bundle (see build-dpf.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/build-dpf.sh" mimid \
    "$ROOT/external/audio-plugins/LICENSE" MiMi-d-GPL-2.0.txt \
    "$ROOT/external/DPF/LICENSE" DPF-ISC.txt
