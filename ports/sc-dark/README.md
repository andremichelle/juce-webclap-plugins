# SC Dark browser version

SC Dark is a spectral compressor. It measures audio in small frequency ranges. It can decrease loud detail and increase quiet detail.

This is an experimental browser version of [Polarity SC Dark](https://github.com/polarity/plugin.nih.polarity-sc-dark). It is not an official Polarity release.

## Start safely

CAUTION: Upward compression can increase noise and make the output very loud. This plugin does not include an automatic limiter.

1. Set your listening level low.
2. Use the host output meter to check the output level.
3. Decrease Output Gain if the output is too loud.

## Open the plugin in openDAW

1. Open your running openDAW Studio.
2. Add an instrument or an audio source.
3. Add **WebCLAP** from **Audio Effects** after that source.
4. Select **Load Plugin → Import WebCLAP…**.
5. Select `build/sc-dark/polarity-sc-dark.wclap.tar.gz`.
6. Select **Open UI**.

Build the archive first with `scripts/build-sc-dark.sh`. See [Development](DEVELOPMENT.md) for build and test instructions.

## Read the help

- Select a **?** button beside a processing setting for its purpose, instructions, and important limits.
- Select **About / Help** for the beginner guide.
- Select **Open guide in a tab** for a separate guide page.

The help covers all 47 parameters. It also explains the graph, listening controls, and preset commands. Help does not change control values.
Preset management, utility actions, Bypass, Mix, and Output Gain have no inline help buttons. Their explanations remain in **About / Help**.
The graph stays visible while you scroll through processing controls.
The footer link opens the bundled license and credits page.

The guide works without an internet connection after the browser has loaded the plugin files. It does not require an account.

The text follows selected ASD-STE100 writing principles. It has not had a complete vocabulary or conformance review. See [Writing guidance](WRITING.md).

## Make a first adjustment

1. Save your DAW project.
2. Play a familiar section.
3. Select **Init** from **Preset**.
4. Set **Downward Ratio** to **2:1**.
5. Decrease **Threshold** slowly until you hear a small change.
6. Set **Bypass** on to hear the original signal.
7. Set **Bypass** off to hear the processed signal.
8. Adjust **Output Gain** for a comparison at a similar listening level.
9. Decrease **Mix** if the effect is too strong.
10. Save the project.

Init sets both Ratio controls to 1:1. At 1:1, that compression direction does not change signal levels.

## Adjust a curve point

1. Open **Threshold curve points** below the graph.
2. Set **Enabled** on for a point.
3. Drag its number left or right to change Frequency.
4. Drag its number up or down to change Offset.
5. Release the pointer to keep the values.

Press **Escape** during a drag to restore the starting values. You can also enter values in the controls.

The points change the compression thresholds. They do not directly set the output levels of separate frequency ranges.

The graph grows when you increase the window size. Small windows have a scroll area for the controls.

## Use presets

A preset contains control values. It does not contain audio or a DAW project.

| Preset | Purpose |
| --- | --- |
| Init | Restores the original default control values. |
| Gentle Glue | Provides a starting point for gentle downward compression. |
| Detail Lift | Uses both compression directions. Mix is 60%. Output Gain is -6 dB. |

Gentle Glue and Detail Lift are examples for this browser version. They are not official Polarity presets. Their output levels are not automatically matched.

- **Save preset…** saves all 47 control values in this browser.
- **Export** downloads the current values as a `.scdark.json` file.
- **Import** checks a file and adds it to **My presets**. Select that preset to apply its values.
- **Delete** asks for confirmation before it removes a user preset. The current control values do not change.

Factory presets cannot be deleted. A duplicate user name does not replace an existing preset.

A preset can contain the Freeze switch value. It does not contain the captured gain pattern.

## Keep backups

The browser preset library is separate from the DAW project. Another browser, profile, or local server port has a separate library.

Browser data deletion can remove the preset library.

1. Export important presets as JSON files.
2. Save the DAW project separately.
3. Reopen the saved project to check its control values.

A saved `.odb` project bundle includes the imported plugin. It does not include the separate browser preset library.

## Install an updated bundle

1. Save the current project.
2. Reload Studio if the update includes host changes.
3. Import the new plugin archive with **Load Plugin → Import WebCLAP…**.

A Studio reload does not update a plugin archive in browser storage. Import the rebuilt archive to get new help and interface files.

To keep an earlier instance, import the update into a new WebCLAP effect. Use Bypass on one instance during comparison.

## Important limits

- The default FFT window contains 2048 samples. At 48 kHz, it adds approximately 42.7 ms of delay.
- The original and processed signals have aligned timing inside this plugin. This does not prove delay compensation between separate host tracks.
- Match level measures five seconds of audio. It adjusts Output Gain, but it does not prevent clipping.
- The browser version does not include native curve-file tools, automatic Match Curve, or impulse-response export.
- Graph animation changes only the display. The **Smoothing** control changes audio processing.

## Source and license

The source is based on version 0.5.4, commit `cc990a190545c515b590b05d5e0f4cdcae175b5b`.

The original authors are Robbert van der Helm and Robert Polarity Agthe. The license is GPL-3.0-or-later. See LICENSE.

The original compression and FFT algorithms remain unchanged. The browser version adds an interface and browser integration.

See [Development](DEVELOPMENT.md) for implementation details and test commands.
