# open-webclap

Open-source audio plugins ported to WebCLAP.

The JUCE ports come with the kit that ports them: `modules/juce_webclap` runs a JUCE editor in a browser canvas as
the UI of a WebCLAP plugin. See [PLAN.md](PLAN.md) for the design.

JUCE ports live in `ports/`, each built as a WebCLAP bundle: `module.wasm` (the DSP as a CLAP plugin) and `ui/` (the
plugin's unmodified editor as `ui.wasm`). A test host page runs the module in an AudioWorklet and shows the editor in
its plugin window. SC Dark uses Rust/WASI and an HTML/Canvas interface instead.

| Plugin | Description | Port | License |
|---|---|---|---|
| [OB-Xf](https://github.com/surge-synthesizer/OB-Xf) | Virtual analog synth after the Oberheim OB-X, the continuation of OB-Xd | A `juce::AudioProcessor`, wrapped by the kit on both sides | GPL-3.0-or-later |
| [Six Sines](https://github.com/baconpaul/six-sines) | Small phase-modulation synth: six sine-based operators in a modulation matrix | CLAP-first, no `AudioProcessor`. The module is Six Sines' own CLAP plugin with a webview bridge, the editor runs against a stand-in engine whose message queues cross over as frames (`ports/six-sines/six_sines_wire.h`) | MIT (GPL-3.0 as built) |
| [RipplerX](https://github.com/tiagolr/ripplerx) | Physically modeled percussion synth: mallet and noise exciters into coupled resonators | An `AudioProcessor` like OB-Xf, plus a little glue for what its editor does beside parameters: keyboard notes, output meter, polyphony, factory programs (`ports/ripplerx/ui_main.cpp`) | GPL-3.0 |
| [Odin 2](https://github.com/TheWaveWarden/odin2) | Polyphonic semi-modular synth: three oscillators, two filters, modulation matrix, effects | An `AudioProcessor` whose editor edits the patch's non-parameter trees directly; those cross over as tree properties, patch loads as one frame (`ports/odin2/odin2_frames.h`) | GPL-3.0-or-later |
| [Surge XT](https://github.com/surge-synthesizer/surge) | Hybrid synth: many oscillator, filter and effect types, deep modulation | An `AudioProcessor` whose editor reaches into the whole engine, so `ui.wasm` runs a second, silent engine as its stand-in. Parameters cross over as usual, patch loads as state, modulation routings as frames (`ports/surge-xt/surge_frames.h`). Without Lua, OSC and MTS-ESP | GPL-3.0-or-later |
| [Polarity SC Dark](https://github.com/polarity/plugin.nih.polarity-sc-dark) | Spectral compressor with upward and downward compression | Rust/NIH-plug + WASI, with a separate HTML/Canvas interface, presets, draggable curve points, and help ([port guide](ports/sc-dark/README.md)) | GPL-3.0-or-later |

The license column is the plugin's and its port's (`ports/<port>/`). JUCE-built bundles link JUCE, so they ship as
AGPL-3.0. SC Dark does not link JUCE and uses GPL-3.0-or-later. See [Licenses](#licenses).

## Build and run

JUCE ports need Emscripten (emsdk, tested with 3.1.51), CMake, Python 3.

SC Dark needs Rust stable with `wasm32-wasip1` and `rust-docs`, Node 23 or later, Python 3, Git, and tar.
Run `scripts/build-sc-dark.sh --test`. The import archive is `build/sc-dark/polarity-sc-dark.wclap.tar.gz`.
Try it on its page of the site (see [The site](#the-site)) (with the microphone, an audio file or a test signal), or as an audio effect in
openDAW.

```sh
scripts/build-obxf.sh                 # fetches pinned deps into external/, patches JUCE, builds
python3 scripts/serve.py build/obxf/web
open http://127.0.0.1:8123/

scripts/build-six-sines.sh            # the same for Six Sines
python3 scripts/serve.py build/six-sines/web 8124
open http://127.0.0.1:8124/

scripts/build-ripplerx.sh             # and RipplerX
python3 scripts/serve.py build/ripplerx/web 8125
open http://127.0.0.1:8125/

scripts/build-odin2.sh                # and Odin 2
python3 scripts/serve.py build/odin2/web 8126
open http://127.0.0.1:8126/

scripts/build-surge-xt.sh             # and Surge XT
python3 scripts/serve.py build/surge-xt/web 8127
open http://127.0.0.1:8127/
```

A clean OB-Xf build takes about 12 minutes, mostly the large JUCE unity files. `-DOBXF_WEB_PNG_THEME=OFF` (passed to the build
script) drops the 9 MB bitmap theme and keeps only OB-Xf's embedded vector theme.

The bundle lands in `build/<port>/web/<port>.wclap` (`module.wasm`, `ui/`), the test host next to it, the archive
hosts import in `build/<port>/<port>.wclap.tar.gz`. Any port's bundle opens with `?bundle=<dir>`.

## The site

`site/` is the public test page for every plugin, at [webclap.opendaw.studio](https://webclap.opendaw.studio)
(Vite, the openDAW SDK). Each plugin gets a page at `/<id>` that runs it in openDAW's engine, the bundle openDAW
hosts: its own window as in the studio, notes from the keyboard and Web MIDI for instruments, and for effects the
microphone (monitored through the effect), a looped audio file, a test tone or noise. Pushes to `main` that touch
`site/` deploy it to GitHub Pages; the bundles are not part of the site.

```sh
cd site && npm install && npm run dev  # http://localhost:8130/, ?local loads build/<port>/*.wclap.tar.gz instead
npm run build                          # dist/
```

## Using the test host

- **Start audio** (browsers need a click), then play notes on the on-screen keyboard, the computer keys
  A W S E D F T G Y H U J K (Z/X change octave) or a MIDI keyboard.
- Turn knobs in the editor. The log shows the page's `gesture` begin, `param` values (at most one per parameter
  per frame) and `gesture` end, then the same as CLAP output events the host received.
- Editors larger than the space scroll in the plugin window. The wheel scrolls it over the editor's background;
  over a knob it turns the knob (the page passes on wheel events no control used, see `js/webclap-ui.js`).
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
  juce_webclap.cmake              JUCE for wasm (juce_wasm, juce_wasm_dsp, single extra modules) and link options
  juce_audio_utils_keyboard_wasm.cpp   juce_audio_utils' keyboard components, without juce_audio_devices
  juce_*_wasm.cpp                 JUCE module unity files with the wasm natives appended
  native/                         message loop, windowing + compositor, fonts, files
  js/webclap-ui.js                page glue: worker, OffscreenCanvas, input, host relay
  js/webclap-ui-worker.js         runs ui.wasm, paints dirty rectangles
  test-host/                      a WebCLAP host page for testing ports (AudioWorklet CLAP host)
patches/juce-8-wasm.patch         small JUCE changes (timer without thread, wasm gaps)
patches/six-sines-*.patch         Six Sines changes (spectrum analyzer without a thread)
patches/ripplerx-*.patch          RipplerX changes (a build without its editor, for module.wasm)
patches/odin2-*.patch             Odin 2 changes (async dialogs, bitmaps without threads, the port's hooks)
patches/surge-*.patch             Surge XT changes (patch loads without threads, the port's hooks)
ports/obxf/                       OB-Xf: CMake build of both modules, the bundle page (ui/), shims
ports/six-sines/                  Six Sines: CMake build, the CLAP plugin with webview bridge, the editor's module
ports/ripplerx/                   RipplerX: CMake build, the module's PageExtension, the editor's glue
ports/odin2/                      Odin 2: CMake build, the module's PageExtension, the editor's glue
ports/surge-xt/                   Surge XT: CMake build, the module's PageExtension, the editor's stand-in engine
ports/sc-dark/                    Rust/WASI spectral effect, source patch/overlay, HTML/Canvas UI, help and tests
ports/sst-shim/                   sst-plugininfra for the browser (paths, platform), shared by Surge-team ports
licenses/                         license texts the bundles ship (AGPL-3.0, for JUCE)
scripts/                          fetch-deps.py, build-<port>.sh, bundle-license.sh, pack-wclap.py, binary_data.py, serve.py
```

## Contributing

New ports are welcome. A good candidate is open source under a license that allows the combination with JUCE's
AGPL-3.0 (GPL-3.0, MIT, BSD, ...), draws its editor in software (no `OpenGLContext`) and can do without threads:
neither module may start a `std::thread` or use wasm threads, hosts like openDAW run plugins single-threaded. See
PLAN.md for what the kit covers and the findings of the existing ports.

The JUCE conventions below apply to JUCE ports. Non-JUCE ports can use an independent build path; SC Dark uses
`ports/sc-dark/upstream.json`, a source patch/overlay, and `scripts/build-sc-dark.sh`. It keeps dependencies pinned
and ships its own license and notices. See `ports/sc-dark/DEVELOPMENT.md` for build and host checks.

Each plugin gets its own folder, `ports/<port>/`, named in lower case with dashes, and the files around it:

- `ports/<port>/CMakeLists.txt` builds both modules, `dsp_main.cpp` the DSP (`module.wasm`), `ui_main.cpp` the
  editor (`ui.wasm`), `ui/index.html` the bundle's page. Start from the port closest to yours: `ports/obxf` for a
  plain `AudioProcessor`, `ports/ripplerx` or `ports/odin2` when the editor does more than parameters,
  `ports/six-sines` for a CLAP-first plugin.
- `ports/<port>/NOTICES.md.in` lists every component in the bundle with copyright and license, and
  `ports/<port>/LICENSE` holds the plugin's license when it is not MIT.
- The plugin's source is not checked in. Add it, pinned to a commit, with its submodules to `DEPS` in
  `scripts/fetch-deps.py`, with a filter that fetches only what the build needs.
- Changes to the plugin's source go in `patches/<port>-*.patch` (add the prefix to `PATCH_TARGETS`). Keep them
  small and describe each at the top of the file; prefer hooks the port fills in over rewrites.
- `scripts/build-<port>.sh` builds the bundle, copies the page and test host, bundles the licenses and packs the
  archive, like the existing ones.
- A row in the table above, the build commands under "Build and run" (with the next free port for `serve.py`) and
  the new files in "Layout".

Before opening a pull request, run a clean build (`rm -rf build/<port>`) and check in the test host that notes
play, the editor's controls move the sound, automation moves the controls, and state survives Save/Load state and
Reopen. Changes to `modules/juce_webclap` touch every port: build them all.

## Licenses

The kit, scripts and docs are MIT ([LICENSE](LICENSE)), except the SC Dark port and its build wrapper,
which use GPL-3.0-or-later ([ports/sc-dark/LICENSE](ports/sc-dark/LICENSE)). SC Dark does not link JUCE.
Each port keeps its plugin's license (see the table
above, and `ports/<port>/LICENSE` for the GPL ports). `patches/juce-8-wasm.patch` modifies JUCE and falls under
JUCE's license, the other patches under their plugin's license.

Each JUCE bundle ships its license (`LICENSE`, AGPL-3.0), `NOTICES.md` (components, copyrights, the repository commit
it was built from) and the longer texts in `licenses/`, see `ports/<port>/NOTICES.md.in` and
`scripts/bundle-license.sh`. Build hosted bundles from a clean, pushed commit, so the source link matches.

JUCE-built bundles link JUCE, so they are AGPLv3 (or covered by a commercial JUCE license) and also under the port's
license. JUCE is AGPLv3/commercial, OB-Xf is GPL-3.0-or-later, RipplerX GPL-3.0, Odin 2 GPL-3.0-or-later (its Aldrich font
OFL-1.1), Surge XT GPL-3.0-or-later, Six Sines MIT (GPL-3.0 as built),
the CLAP headers MIT, the DejaVu fonts under the Bitstream Vera license; none of them is checked in,
`scripts/fetch-deps.py` downloads them.
