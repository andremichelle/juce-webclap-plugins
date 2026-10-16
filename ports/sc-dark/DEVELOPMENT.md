# SC Dark browser development

This port uses Rust/NIH-plug, not JUCE. The original spectral compression and FFT algorithms remain unchanged.

The browser interface replaces the native VIZIA interface. HTML provides the controls. Canvas provides the graph.

See [the user guide](README.md) for operating instructions. See [writing guidance](WRITING.md) for terms and review limits.

## Build

Requirements: Rust stable, the `wasm32-wasip1` target, Node 23 or later, Python 3, Git, and tar.

1. Install the Rust target:

   ```sh
   rustup target add wasm32-wasip1
   rustup component add rust-docs
   ```

2. Build the port and run its tests:

   ```sh
   scripts/build-sc-dark.sh --test
   ```

The script fetches the source revision in `upstream.json` into `external/sc-dark`.
It applies `patches/sc-dark-webclap.patch` and copies `overlay/` into a separate build source tree.
It does not change an existing development checkout.

The build uses the upstream Cargo.lock and `--locked`. It does not require Emscripten, CMake, or JUCE.
The bundle includes dependency license texts and Rust library notices.
Its dependency inventory includes build and test dependencies, not only runtime code.
RealFFT 3.5.0 declares MIT but supplies no license text. Its original manifest and README are included.
Review that omission before public binary distribution. The inventory is not a legal conformance assessment.

Build files are in `build/sc-dark/`:

| Path | Purpose |
| --- | --- |
| `polarity-sc-dark.wclap.tar.gz` | Import archive for openDAW. |
| `polarity-sc-dark-webclap-source.tar.gz` | Upstream source and the complete port recipe. |
| `web/polarity-sc-dark.wclap/` | Unpacked bundle. |
| `source-<hash>/` | Prepared Rust workspace. |
| `cargo-target/` | Cargo output. |

`--prepare-only` prepares the Rust workspace without building the module.
With `--test`, it also runs the native Rust tests and JavaScript tests.
Build sources have a content manifest. The script rejects unexpected source changes instead of overwriting them.

A dirty repository is marked as a development build in the bundle notices.
Build hosted releases from a clean, pushed commit.

## Test in openDAW

1. Start your local openDAW Studio.
2. Save the current DAW project.
3. Add WebCLAP after an audio source.
4. Import the archive with **Load Plugin → Import WebCLAP…**.
5. Select **Open UI**.
6. Set your listening level low.
7. Play the source.
8. Adjust one control.
9. Save the project.
10. Reopen it to check the values.

The shared test host in this repository supplies no audio input. It is intended for instruments.
This effect needs an audio source in a host such as openDAW.

Re-import the archive after a build. Reloading Studio does not update its stored plugin files.

## Optional host checks

The bridge checks require a built openDAW checkout with its npm dependencies:

```sh
OPENDAW_ROOT=/path/to/openDaw \
node --import /path/to/openDaw/node_modules/tsx/dist/loader.mjs ports/sc-dark/verify.mts
```

The browser checks require Playwright and a separate Chrome test profile.
Create a saved project named `SC Dark browser test` in that profile.
The project must contain Cubed followed by WebCLAP.
These tests change and save that test project.

```sh
SC_DARK_TEST_PROFILE=/private/tmp/sc-dark-browser.example \
OPENDAW_URL=http://localhost:8084/ \
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
node ports/sc-dark/browser-check.mjs
```

The browser test checks help, presets, point movement, window size, saved values, and live signal data.
It checks the separate guide at phone width and without an internet connection.
It writes results to `build/sc-dark/browser-check/`.

Full window resizing requires the host to use the plugin's `clap.gui` resize information.
The tested local openDAW host also excludes native controls and open dialogs from keyboard forwarding.
Those host changes are not part of this PR.
Older hosts can limit resizing or intercept keys.

## Audio and display

NIH-plug sends control edits through its CLAP parameter-event queue.
The host uses these events for automation and saved parameter state.
The browser port does not start native background threads.

The interface requests state 10 times per second while visible.
Animation frames update the display between those readings.
Display response times are 35 ms for increasing input, 100 ms for decreasing input, and 60 ms for gain change.
These times do not change the compressor response.
Hidden pages stop animation. Reduced-motion preferences disable animation between readings.

Point movement uses pointer capture, a fixed graph scale, and a local preview.
The Rust curve evaluator checks the preview.
Writes occur no more than once per animation frame.
Frequency limits are 30–22000 Hz. Offset limits are -60 to +60 dB, in 0.1 dB steps.
Escape, cancellation, capture loss, blur, resize, or page hiding restores the starting pair.

## Presets and state

The preset format stores all 47 normalized values.
Validation rejects missing or unknown parameters, nonfinite values, and values outside 0–1.
Names have a limit of 80 characters.
Files have a limit of 32 KiB.
The library has a limit of 128 user presets.
Its localStorage key is `polarity.sc-dark.presets.v1`.

The factory presets are Init, Gentle Glue, and Detail Lift.
These are browser examples, not official Polarity presets.
Preset loading switches delta listening off and cancels an unfinished Match level operation.

The host state bridge receives base64 text. CLAP state streams contain raw bytes.
The WASM loader rejects declared sizes above 16 MiB before allocation.
Native desktop state loading remains unchanged.

## Scope and limits

The default FFT window adds approximately 42.7 ms of delay at 48 kHz.
Internal dry/wet timing is aligned. Cross-track host delay compensation is not established by these tests.
There is no automatic limiter.
Native curve-file tools, automatic Match Curve, and impulse-response export are not exposed.

Help covers all 47 parameters and action controls.
It does not require a remote service or account.
Help must not change parameter values.
Small question marks retain invisible click targets of at least 24 pixels.

Automated checks do not establish audible approval.
This is an experimental port, not an official Polarity release.

## AI-assisted work

This port, interface, help text, integration, and automated tests were developed with AI assistance.
The original authors retain credit for SC Dark and NIH-plug.
Maintainers must review this new non-JUCE port before including it in their distribution.
