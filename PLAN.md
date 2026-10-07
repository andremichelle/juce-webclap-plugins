# JUCE WebCLAP plugins

Run the editor of an existing JUCE plugin as the UI of a WebCLAP plugin, drawn into a canvas, while the
plugin's audio code runs as an ordinary WebCLAP somewhere else. The UI never runs on the audio thread.

Status: UI-side prototype with OB-Xf works (phases 0 and 1 without a DSP module), see "Prototype findings" and
README.md. Written 2026-10-07.

## Goal

A JUCE plugin author (or someone porting an open-source JUCE plugin) builds two WebAssembly modules from the
same source tree and ships them in one WebCLAP bundle:

- `module.wasm`, the DSP: the plugin as a CLAP, no UI code at all. The host runs it wherever it runs audio
  (in openDAW: an AudioWorklet).
- `ui.wasm`, the editor: the plugin's JUCE editor plus JUCE's software renderer. The bundle's web page loads it
  and draws it into a `<canvas>`.

The two never share memory. They talk only through the WebCLAP webview message channel, which every WebCLAP
host already relays. To the host the result is a normal webview UI, so no host has to change.

## Non-goals

- No change to the WebCLAP spec and no host-specific extension. Anything that only works in openDAW is out.
- No OpenGL. Editors built on `OpenGLContext` (Vital and friends) are not supported by the software path.
- No threads. Neither module may rely on `std::thread` or wasm threads (shared memory). Hosts like openDAW run
  plugins single-threaded.
- Not a generic "any JUCE plugin compiles unchanged" promise. Editors that reach into the engine need glue,
  see "Remote processor".

## Why separate builds

A WebCLAP is one CLAP plugin instance that lives with the audio. A CLAP GUI call such as `clap.webview`
`receive()` reaches that instance between process calls, on the same thread as the audio in single-threaded
hosts. Running a JUCE editor there (layout, repaints, timers) would steal time from audio and cause dropouts.
So the editor gets its own module and its own thread, the page's, and the DSP instance only answers small
messages.

```
 plugin window (iframe, plugin origin)           host                         audio thread
 ┌──────────────────────────────────┐   postMessage   ┌──────────┐   receive()   ┌──────────────────┐
 │ page.js                          │ ──────────────▶ │  WebCLAP │ ────────────▶ │ module.wasm      │
 │  ├─ Worker: ui.wasm              │                 │   host   │               │ (CLAP, DSP only) │
 │  │   JUCE editor + RemoteProc.   │ ◀────────────── │          │ ◀──────────── │  + UI bridge     │
 │  │   software renderer           │   postMessage   └──────────┘  host.send()  └──────────────────┘
 │  └─ OffscreenCanvas              │
 └──────────────────────────────────┘
```

## Components

### 1. `juce_webclap` (JUCE module, UI side)

- **Message loop.** No `MessageManager` thread exists. The page drives it: every animation frame calls an
  exported `tick(timestamp)` that runs pending async updates, fires due `juce::Timer`s and repaints.
- **Software rendering.** The top-level component paints through `LowLevelGraphicsSoftwareRenderer` into a
  `juce::Image` (ARGB). After each tick the dirty rectangles are converted to RGBA and handed to the page, which
  writes them with `putImageData` (or into an `OffscreenCanvas` in the worker). Device pixel ratio is applied by
  rendering at `scale = devicePixelRatio`.
- **Input.** Pointer, wheel and key events from the canvas arrive as small structs and are injected into the
  component tree through a custom `ComponentPeer`. Focus, mouse cursor changes and text input (for the few text
  fields editors have) are mapped back to the page.
- **Fonts.** Bundled TTFs registered with `Typeface::createSystemTypefaceFor` at start, so text renders exactly
  as on desktop. No system fonts exist.
- **Remote processor.** See below.

### 2. Remote processor (UI side)

JUCE editors hold an `AudioProcessor&`. In the UI build the editor gets a stand-in processor that owns the same
parameter layout (`AudioProcessorValueTreeState` or plain `AudioProcessorParameter`s):

- A parameter changed by the editor (including `beginChangeGesture`/`endChangeGesture`) leaves as a message.
- A parameter message from the DSP side sets the stand-in's value with notification, so attachments and
  listeners update the controls.
- Non-parameter state (`getStateInformation`: patch names, wavetables, user content) arrives as a state message
  and is applied with `setStateInformation` on the stand-in. Editor actions that change such state send it back.
- Editors built purely on parameters need nothing else. Editors that call engine methods directly (Surge, Vital)
  need per-plugin sync glue for that data. Measuring this per plugin decides what a port costs.

### 3. UI bridge (DSP side)

A small piece compiled into `module.wasm`, implementing `clap.webview`:

- `get_uri()` names the page in the bundle, `get_resource()` streams bundle files if the host asks for them.
- `receive()` decodes UI messages: parameter value and gesture become CLAP parameter changes the plugin applies
  in its next process/flush, state messages are applied between process calls.
- Parameter changes coming from automation or the host, and state changes (preset load), are sent back with
  `host.send()`. Rate-limited: at most one value per parameter per UI frame.
- Streams for meters, scopes and waveforms: the DSP writes into a ring buffer during process, the bridge drains
  it at UI rate (when the page asks, never from process).

### 4. Page (`ui/index.html`, `ui/page.js`)

- Starts a Worker, loads `ui.wasm` into it, transfers an `OffscreenCanvas`. Falls back to main-thread rendering
  where `OffscreenCanvas` is missing.
- Relays canvas input to the worker and messages between worker and host (`window.parent.postMessage` out,
  `message` events in), the WebCLAP webview convention.
- Sends the "ready" handshake so the DSP side pushes all current parameter values and the state once.

## Message protocol

Binary frames, little endian: `u8 type`, `u8 flags`, `u16 reserved`, payload.

| type | direction | payload |
|---|---|---|
| `hello` | UI → DSP | protocol version |
| `snapshot` | DSP → UI | all parameter values, then a state blob |
| `param` | both | `u32 clapId`, `f64 value` |
| `gesture` | UI → DSP | `u32 clapId`, `u8 begin/end` |
| `state` | both | opaque blob (JUCE `MemoryBlock`) |
| `stream` | DSP → UI | `u16 streamId`, samples (meters, scope data) |
| `resize` | UI → DSP | width, height (the DSP answers through `clap.gui` size requests) |

Parameter ids are the CLAP ids, so a host that maps automation and modulation to CLAP parameters (openDAW does)
stays consistent with what the editor shows.

## Build

- Emscripten for both modules. `module.wasm` through clap-wrapper's wasm target or a direct CLAP entry,
  exporting `clap_entry` and `malloc` like every WebCLAP. `ui.wasm` as a plain Emscripten module exporting
  `init`, `tick`, `input`, `message`.
- JUCE with the platform layer replaced by this module (no X11/Cocoa/Win32), SIMD through wasm SIMD.
- Bundle layout:

```
plugin.wclap/
  module.wasm          DSP, CLAP entry
  memory.json          optional, recommendedInitialBytes
  ui/index.html        page, named by get_uri()
  ui/page.js
  ui/ui.wasm           editor
  ui/fonts/*.ttf
```

## Phases

0. **Spike.** A JUCE `Component` with a slider and some text, compiled to `ui.wasm`, rendered into a canvas in a
   plain web page, mouse working. Answers: does JUCE's software renderer build and run under Emscripten, frame
   cost at 600x400 and 1200x800, binary size, font handling. Starting point: the work behind Surge PR #8597
   (JUCE WebAssembly app).
1. **Remote processor.** A minimal APVTS plugin (gain, filter cutoff) as both modules, connected through a fake
   host page that plays the host's role (relays messages, runs the DSP module). Parameters round-trip both ways,
   gestures arrive, state survives reopening.
2. **Real host.** The same bundle in openDAW: automation and modulation move the editor's controls, editor drags
   record automation, the window survives close and reopen.
3. **Streams.** Meters and a scope at UI rate without touching process time.
4. **First real plugin.** Six Sines (MIT, CLAP-first, Surge team), if its editor turns out parameter-driven, else
   the next candidate. Measure the glue its editor needs.
5. **Polish.** DPR changes, resizable editors, keyboard focus, text fields, accessibility basics.

## Risks

- JUCE has no official WebAssembly platform layer. The custom `ComponentPeer` and message loop are the bulk of
  the work and must track JUCE releases.
- Editors that are not parameter-driven need per-plugin glue. That may make some well-known plugins expensive.
- Software rendering of large editors at high DPR can be heavy. Dirty rectangles keep the steady state cheap,
  full redraws (resize, theme change) are the worst case. A drawing command buffer replayed on Canvas2D is the
  fallback if pixels prove too slow, at the cost of reimplementing a large part of the graphics interface.
- Binary size: JUCE plus fonts in `ui.wasm` may reach several MB. Bundles are cached by the host, but the first
  open is slower.
- Licenses: JUCE is AGPLv3 or commercial. Open-source ports under GPL/AGPL are fine, closed-source use needs a
  JUCE license. The kit itself should be MIT so it can be used either way.

## Prototype findings (OB-Xf, 2026-10-07)

OB-Xf's editor and processor, unmodified, run as `ui.wasm` in a worker against a fake host page (no DSP module,
no audio). Measured in Chrome on an Apple Silicon Mac:

- **JUCE builds under Emscripten** with the platform layer in `modules/juce_webclap` plus a 130-line JUCE patch
  (`patches/juce-8-wasm.patch`). The patch covers the Timer (no thread, advanced by the frame callback) and gaps in
  JUCE's own wasm target: no `JUCE_LITTLE_ENDIAN` (broke every binary format, including fxp patches and JUCE's
  binary XML), missing `<emscripten.h>`, no thread-priority table, `PluginHostType`, `PropertiesFile`.
- **Software renderer cost.** Steady state 0.1–0.3 ms per frame, knob drags repaint small rectangles. Full redraw of
  the 1438×720 editor: about 25 ms at 1x, 53 ms at 2x (4.1 Mpx). Only resize, zoom and theme changes pay that.
  The pixel fallback (Canvas2D command buffer) is not needed for OB-Xf.
- **Size.** `ui.wasm` 10.8 MB (3.7 MB gzipped) at -O3, not yet tuned. Factory patches and the bitmap theme add
  8.8 MB of data, the embedded vector theme needs none. Startup 180–700 ms including patch scan.
- **Fonts.** HarfBuzz-only typefaces from memory work; DejaVu Sans is the default for JUCE's own widgets.
- **Remote processor.** The stand-in is OB-Xf's own `ObxfAudioProcessor`, never processing audio. The only glue
  needed so far: drain OB-Xf's parameter FIFO every frame (normally done in `processBlock`). Voice LEDs need
  streams (phase 3). A generic parameter-only stand-in would not work for OB-Xf: the editor reaches into the patch
  browser, MIDI learn, voice matrix and theme utils.
- **Protocol.** Plugins re-apply values they were just given (OB-Xf defers patch application by a timer), so the
  bridge remembers what the DSP side has and drops echoes. Parameter ids use `paramID.hashCode()`, which needs
  checking against clap-juce-extensions before phase 2.
- **Display model.** JUCE's display must be the screen space the window may grow into (`screen.availWidth`), not
  the canvas, or editors hide zoom levels. Popups larger than the canvas are clipped.
- **Worker from the start** works (answers the first open question): ui.wasm runs in a worker, paints into a
  transferred OffscreenCanvas with `putImageData` per dirty rectangle (under 1 ms even for full frames).
- **Hidden pages** get no animation frames; the page falls back to a slow timer so protocol traffic continues.

Not done yet: a real DSP module and host (phases 1–2), streams, IME/text input beyond key events, persistent
`/user` storage (settings and saved patches live in memory), keyboard focus polish, size tuning.

## Open questions

- Worker with `OffscreenCanvas` from the start, or main thread first and the worker later?
- How a host that has no webview (or no `clap.webview`) should behave: the DSP module must work headless, the
  UI is optional by design.
- Whether to offer the protocol to the WebCLAP community as a convention for split UIs, independent of JUCE.

## References

- WebCLAP: https://github.com/free-audio/web-clap, example plugins https://github.com/WebCLAP/examples
- CLAP webview extension `clap.webview/3`, `clap.gui`, `clap.params`, `clap.state`
- openDAW WebCLAP host notes: `openDAW/plans/webclap.md` (worklet instance, webview relay through a host frame on
  its own origin, parameter and state handling)
- Surge WebAssembly exploration: https://github.com/surge-synthesizer/surge/issues/8581 and PR #8597
- Six Sines: https://github.com/baconpaul/six-sines
