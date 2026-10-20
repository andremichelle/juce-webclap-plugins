# Writing guidance for SC Dark

## Basis and limits

The reference is [ASD-STE100, Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf), published in January 2025.

This revision applies selected writing rules to the browser help, beginner guide, and current browser documentation.

It is not a complete conformance assessment. The automated checks do not validate the full STE dictionary, grammar, or approved technical vocabulary.

The original source license, copyright notices, and upstream change history remain unchanged.

## Rules for this project

1. Write one main idea in each sentence.
2. Use the active voice when the actor is known.
3. Use command verbs for instructions.
4. Give one instruction in each sentence.
5. Keep procedural sentences within 20 words.
6. Keep descriptive sentences within 25 words.
7. Use the same term for the same item.
8. Define necessary audio terms before detailed instructions require them.
9. Keep each paragraph about one topic.
10. Keep paragraphs within six sentences.
11. Keep UI control names and code identifiers exact.
12. State warnings and limitations directly.

These are project instructions based on the reference. They do not reproduce the standard or its dictionary.

## Technical terms

| Term | Intended meaning |
| --- | --- |
| Audio signal | Audio data that the plugin receives or produces. |
| Input signal | The signal before this plugin processes it. |
| Processed signal | The signal after the effect processes it. |
| Output signal | The signal that the plugin sends to the host. |
| Frequency range | A part of the analyzed spectrum. |
| Level | The strength of a signal. |
| Gain | A change in signal level. |
| Threshold | The level at which compression starts. |
| Ratio | The strength of one compression direction. |
| Detector | The part that measures signal level for compression. |
| Sidechain | A second input signal that controls the effect. |
| Preset | Saved control values, not audio. |
| FFT | Fast Fourier transform, the frequency-analysis method. |
| Latency | The delay between input and output. |
| Host | The application that loads the plugin. |

Product names, control names, file names, and protocol names are technical terms. Keep their spelling consistent with the interface or source.

Avoid metaphors and comparisons with other products. Describe the effect that this plugin actually produces.

## Review procedure

1. Read the source for the control behaviour.
2. Check the proposed text against that behaviour.
3. Check sentence length and term consistency.
4. Run the help coverage tests.
5. Check the rendered guide and dialogs.
6. Check that help does not change control values.

Sentence-length checks are conservative project checks. They are not an official STE word-count tool or a conformance certificate.
