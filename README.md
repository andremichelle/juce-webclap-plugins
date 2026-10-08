# JUCE WebCLAP plugins

Open-source JUCE plugins ported to WebCLAP, and the kit that ports them: `modules/juce_webclap` runs a JUCE editor
in a browser canvas as the UI of a WebCLAP plugin. See [PLAN.md](PLAN.md) for the design.

Ports live in `ports/`, each built as a WebCLAP bundle: `module.wasm` (the DSP as a CLAP plugin) and `ui/` (the
plugin's unmodified editor as `ui.wasm`). A test host page runs the module in an AudioWorklet and shows the editor in
its plugin window.

- [OB-Xf](https://github.com/surge-synthesizer/OB-Xf): a `juce::AudioProcessor`, wrapped by the kit on both sides.
- [Six Sines](https://github.com/baconpaul/six-sines): CLAP-first, no `AudioProcessor`. The module is Six Sines'
  own CLAP plugin with a webview bridge, the editor runs against a stand-in engine whose message queues cross over
  as frames (`ports/six-sines/six_sines_wire.h`).

## Build and run

Needs Emscripten (emsdk, tested with 3.1.51), CMake, Python 3.

```sh
scripts/build-obxf.sh                 # fetches pinned deps into external/, patches JUCE, builds
python3 scripts/serve.py build/obxf/web
open http://127.0.0.1:8123/

scripts/build-six-sines.sh            # the same for Six Sines
python3 scripts/serve.py build/six-sines/web 8124
open http://127.0.0.1:8124/
```

A clean OB-Xf build takes about 12 minutes, mostly the large JUCE unity files. `-DOBXF_WEB_PNG_THEME=OFF` (passed to the build
script) drops the 9 MB bitmap theme and keeps only OB-Xf's embedded vector theme.

The bundle lands in `build/<port>/web/<port>.wclap` (`module.wasm`, `ui/`), the test host next to it, the archive
hosts import in `build/<port>/<port>.wclap.tar.gz`. Any port's bundle opens with `?bundle=<dir>`.

## What to try

- **Start audio** (browsers need a click), then play notes on the on-screen keyboard, the computer keys
  A W S E D F T G Y H U J K (Z/X change octave) or a MIDI keyboard.
- Turn knobs in the editor. The log shows the page's `gesture` begin, `param` values (at most one per parameter
  per frame) and `gesture` end, then the same as CLAP output events the host received.
- **Automate** moves a parameter from the host side at 30 Hz. The editor's knob follows, nothing echoes back.
  The parameter sliders in the side panel send single values the same way.
- BROWSE, PREV/NEXT load factory patches (packaged with the page at `/factory`). The editor sends the changed
  parameters and the new state blob, the sound changes.
- **Reopen** destroys and recreates the plugin window. The page says `hello`, the DSP answers with a snapshot
  (values + state) and the editor comes back on the same patch.
- **Save state / Load state** is `clap.state`. Load sends the editor a snapshot.
- **Host calls on_main_thread** off behaves like a host that ignores `request_callback`: the plugin then sends
  page updates from `process()`.
- MENU → Zoom resizes the editor. It sends `resize`, the plugin asks the host with `request_resize`.

## Layout

```
modules/juce_webclap/             the kit
  juce_webclap.h                  C++ API for the embedding ui.wasm (frame, input, framebuffer)
  juce_webclap_protocol.h         the split-UI message frames, shared by both sides
  juce_webclap_bridge.h           UI side of the protocol (ProcessorBridge)
  juce_webclap_clap.h/.cpp        DSP side: any juce::AudioProcessor as a WebCLAP plugin (module.wasm)
  juce_webclap_standalone.cpp     keeps module.wasm free of Emscripten "env" imports
  juce_webclap.cmake              JUCE for wasm (juce_wasm, juce_wasm_gui_extra, juce_wasm_dsp) and link options
  juce_*_wasm.cpp                 JUCE module unity files with the wasm natives appended
  native/                         message loop, windowing + compositor, fonts, files
  js/webclap-ui.js                page glue: worker, OffscreenCanvas, input, host relay
  js/webclap-ui-worker.js         runs ui.wasm, paints dirty rectangles
  test-host/                      a WebCLAP host page for testing ports (AudioWorklet CLAP host)
patches/juce-8-wasm.patch         small JUCE changes (timer without thread, wasm gaps)
patches/six-sines-*.patch         Six Sines changes (spectrum analyzer without a thread)
ports/obxf/                       OB-Xf: CMake build of both modules, the bundle page (ui/), shims
ports/six-sines/                  Six Sines: CMake build, the CLAP plugin with webview bridge, the editor's module
ports/sst-shim/                   sst-plugininfra for the browser (paths, platform), shared by Surge-team ports
licenses/                         license texts the bundles ship (AGPL-3.0, for JUCE)
scripts/                          fetch-deps.py, build-<port>.sh, bundle-license.sh, pack-wclap.py, binary_data.py, serve.py
```

## Licenses

The kit, scripts and docs are MIT ([LICENSE](LICENSE)). Each port keeps its plugin's license: `ports/obxf` is
GPL-3.0-or-later ([ports/obxf/LICENSE](ports/obxf/LICENSE)), `ports/six-sines` is MIT like Six Sines' source (whose
combined work is GPL-3.0). `patches/juce-8-wasm.patch` modifies JUCE and falls under JUCE's license, the Six Sines
patch under Six Sines' MIT license.

Each bundle ships its license (`LICENSE`, AGPL-3.0), `NOTICES.md` (components, copyrights, the repository commit
it was built from) and the longer texts in `licenses/`, see `ports/<port>/NOTICES.md.in` and
`scripts/bundle-license.sh`. Build hosted bundles from a clean, pushed commit, so the source link matches.

Built bundles link JUCE, so they are AGPLv3 (or covered by a commercial JUCE license) and also under the port's
license. JUCE is AGPLv3/commercial, OB-Xf is GPL-3.0-or-later, Six Sines is MIT (GPL-3.0 as built), the CLAP headers are MIT, DejaVu fonts are under the
Bitstream Vera license; none of them is checked in, `scripts/fetch-deps.py` downloads them.
