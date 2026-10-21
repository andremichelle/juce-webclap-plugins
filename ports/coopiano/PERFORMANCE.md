# coopiano: making it run on one thread

Upstream coopiano (https://github.com/peterc/coopiano) is written for a native host with threads to spare: it
builds all 88 × 127 hammer strikes up front (about 10 s, 72 MiB) or solves them on its MIDI thread, and its body
(soundboard, sympathetic resonance, room) runs at full cost every block, silence included. A WebCLAP module has
one thread, the audio thread, often on an efficiency core. This port keeps upstream's sound and changes when and
how the work is done. Everything lives in two places:

- `coopiano_clap.cpp`: the plugin, which schedules the strike solves
- `patches/coopiano-webclap.patch`: the changes to upstream's engine, each described in the patch header

All engine changes are the same sound to rounding: a test render matches the previous version within -216 dB of
its peak, and sleeping parts wake up bit-identical.

## Results

Measured with the test host's worklet in Node (48 kHz, 128-sample blocks, Apple M1), percentages of real time:

| | First working port | Now |
|---|---|---|
| Silence, mean | 15 % | under 1 % |
| 60 s of random notes, median | 35 % | 9 % |
| 60 s of random notes, 99th percentile | 65 % | 27-29 % |
| Blocks over the 2.7 ms budget | a few, up to 6 ms | none |

In openDAW (with `debug.dspLoadMeasurement` on), one idle instance read 60-90 % on the DSP meter before and reads
2-26 % now; Chrome's idle block costs 0.17 ms on an efficiency core, 0.04 ms on a fast one.

## 1. Strikes: solved in slices, cached lazily

Every note starts from the hammer's nonlinear contact with the strings. One solve takes up to 3 ms natively and
over 10 ms in WebAssembly (soft bass notes are the slowest), longer than an audio block.

- **Resumable solver.** The patch splits upstream's `run_contact` loop into `step_contact`, which stops after a
  number of steps and resumes from a saved `ContactState`. `ContactJob` builds a response that way under a work
  budget in mode-steps. The integration is unchanged, so the result is identical to a solve in one go.
- **Lazy cache.** `StrikeBank` can start empty and build one response at a time; the engine exposes `has_strike`,
  `build_strike` and `building_strike` so the plugin decides what to solve.
- **Budgets in time.** The plugin measures the solver's speed (mode-steps per ms, over 50 ms windows) and turns
  each budget into steps. A solve's setup, copying the key's strings, gets a block of its own, and those blocks
  are left out of the speed estimate.
- **Notes never wait for long.** A cached note starts at its sample. A missing one starts at once with the nearest
  cached velocity of its key (up to 8 steps away) and its own response is solved next. Only a note with no
  neighbour at all waits, a quarter of each block solving for it, and starts a few blocks late, once.
- **Background fill, bounded.** Idle blocks spend a sixth of their time filling: first what stand-ins asked for,
  then every key at velocities 64, 32, 96, 16, 48, 80, 112 and 8. That leaves a neighbour within 8 for every
  velocity (about 5 s on a fast core, half a minute on an efficiency core); the rest are solved when played. The
  fill then stops and costs nothing. Filling all 127 velocities kept an idle instance busy for minutes.

## 2. The body: cheaper, and asleep in silence

The body cost 14 % of real time natively in silence, as much as the voices of quiet playing. Most of it came
once every 256 samples (the soundboard's partition), so a per-block meter, which shows the slowest block per
second, read that peak.

- **Sleeping.** `StreamingSoundboard` sleeps once its input has been exactly zero for longer than its response:
  all its state is zero then, only the block phase moves on. `SympatheticResonance` skips a string whose modes
  are all zero while nothing drives it, and the whole bank once every string is silent and the force is zero (the
  dampers still move). Both wake up bit-identical.
- **Earlier flush.** Sympathetic modes flush to zero below 1e-12 instead of 1e-30. That is -216 dB, far below the
  output's resolution, and lets the bank fall asleep about 13 s after the last note instead of never in practice.
- **Precomputed modes.** While a damper rests, each mode's radius × cosine/sine and its drive are kept instead of
  recomputed per sample.

## 3. Convolution: half the spectrum, spread over the block

The soundboard convolves a shared 1.5 s tail and four 0.2 s bridge regions, each with a direct 256-tap head.

- **Half spectrum.** Input and responses are real, so `PartitionedConvolver` multiplies only bins 0 to N/2 and
  mirrors the rest. The complex products are written out by hand, so the compiler vectorizes them.
- **One inverse FFT for two channels.** Left and right are transformed together as L + iR.
- **Spread work.** `advance()` accumulates the older partitions during the block, every 32 samples, so only the
  newest partition and the transforms are left at the block boundary. This flattens the 256-sample peak.
- **Vectorized heads.** The direct 256-tap filters sum into four partials per channel instead of one chain.
- **Non-uniform tail.** The 1.5 s tail keeps its first 4096 samples in 256-sample partitions; the rest goes to a
  `SpreadConvolver` with 2048-sample partitions, its latency hidden by the 4096-sample offset and its work spread
  over the following block. The tail costs 0.80 % instead of 1.78 % of real time. On the 0.2 s regions the large
  transforms cost more than they save (0.77 % against 0.65 %), so they stay uniform.

## 4. Voices

With the pedal down, released notes keep ringing (126 voices on average in the test), and two thirds of that time
is the voices' mode oscillators, already vectorized upstream. `Voice::render_mode_pairs` now sums its modes'
outputs as a tree of pairs instead of a chain of dependent additions per sample: about a tenth less for the
voices, the same values to rounding.

## What did not help

- A branchless resonance flush, and processing modes in groups of 16: both slower.
- `-fcx-limited-range`: no gain once the products were written out.
- The non-uniform convolution on the short regions: slower, see above.

## Measuring it

Chrome on an M-series Mac runs a lightly loaded AudioWorklet on an efficiency core, about 7 times slower than a
fast core; under load it moves to a fast core, so playing can read lower than idling. Node under `taskpolicy -b`
reproduces the slow core. openDAW's DSP meter takes its timestamps from a worker (`HRClock`), so its reading
includes that worker's wake-up and is noisy at low CPU clocks; the plugin's clock in openDAW is `Date.now()`, in
whole milliseconds.

## Left open

- Quantizing velocities to steps of 4 would let the background fill cover every velocity, so playing never
  solves.
- A voice limit, or culling voices far below the loudest, would bound the pedal-down case.
- A worker would take the strike solves off the audio thread entirely, if hosts offer one.
