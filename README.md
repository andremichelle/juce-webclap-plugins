# JUCE WebCLAP UI kit

Runs a JUCE plugin editor in a browser canvas as the UI of a WebCLAP plugin. See [PLAN.md](PLAN.md) for the design.

The first prototype is [OB-Xf](https://github.com/surge-synthesizer/OB-Xf)'s unmodified editor running as
`ui.wasm`, connected to a fake host page that plays the DSP side. There is no audio.

## Build and run

Needs Emscripten (emsdk, tested with 3.1.51), CMake, Python 3.

```sh
scripts/build-obxf.sh                 # fetches pinned deps into external/, patches JUCE, builds
python3 scripts/serve.py build/obxf/web
open http://127.0.0.1:8123/
```

A clean build takes about 12 minutes, mostly the large JUCE unity files. `-DOBXF_WEB_PNG_THEME=OFF` (passed to the build
script) drops the 9 MB bitmap theme and keeps only OB-Xf's embedded vector theme.

## What to try

- Turn knobs, flip switches, drag sliders. The message log shows `gesture` begin, `param` values (at most one
  per parameter per frame) and `gesture` end.
- **Automate** moves a parameter from the host side at 30 Hz. The editor's knob follows, nothing echoes back.
- Parameter sliders in the side panel send single values the same way.
- BROWSE, PREV/NEXT load factory patches (packaged into Emscripten's filesystem at `/factory`). The editor sends
  the changed parameters and the new state blob.
- **Reopen** closes and reloads the plugin window. The host answers `hello` with a snapshot (values + state) and
  the editor comes back on the same patch.
- **Store state / Recall state** sends a stored state blob to the editor.
- MENU → Zoom resizes the editor. It sends `resize`, the host resizes the window frame.
- MENU → Themes switches between the bitmap and the vector theme.

## Layout

```
modules/juce_webclap_ui/          the kit
  juce_webclap_ui.h               C++ API for the embedding ui.wasm (frame, input, framebuffer)
  juce_webclap_ui_bridge.h        UI side of the message protocol (ProcessorBridge)
  juce_*_wasm.cpp                 JUCE module unity files with the wasm natives appended
  native/                         message loop, windowing + compositor, fonts, files
  js/webclap-ui.js                page glue: worker, OffscreenCanvas, input, host relay
  js/webclap-ui-worker.js         runs ui.wasm, paints dirty rectangles
patches/juce-8-wasm.patch         small JUCE changes (timer without thread, wasm gaps)
prototypes/obxf/                  OB-Xf as ui.wasm: CMake build, sst-plugininfra shim, test pages
scripts/                          fetch-deps.py, build-obxf.sh, binary_data.py, serve.py
```

## Licenses

The kit is meant to be MIT. JUCE is AGPLv3/commercial, OB-Xf is GPL-3.0-or-later, DejaVu fonts are under the
Bitstream Vera license; none of them is checked in, `scripts/fetch-deps.py` downloads them.
