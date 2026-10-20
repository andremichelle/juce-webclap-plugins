// STE-guided help. See ../WRITING.md for terminology and review limits.
export const topics = {
    "tresh_global": {
        "title": "Threshold",
        "meaning": "A threshold is the level at which compression starts. This control moves both threshold lines up or down.",
        "tryIt": "Set Downward Ratio above 1:1. Decrease Threshold slowly to decrease more loud detail.",
        "caution": "An increase also raises the upward threshold. This can increase more quiet detail. Threshold does not directly set the output level."
    },
    "thresh_center_freq": {
        "title": "Center",
        "meaning": "Center sets the center frequency of the threshold shape. Slope and Curve change the shape around this frequency.",
        "tryIt": "Adjust Center while you watch the threshold lines.",
        "caution": "Center does not divide the signal into separate frequency bands."
    },
    "thresh_curve_slope": {
        "title": "Slope",
        "meaning": "Slope changes the tilt of the threshold shape between low and high frequencies. The tilt changes where compression starts.",
        "tryIt": "Adjust Slope in small steps. Monitor the yellow and blue lines.",
        "caution": "The lines show compression thresholds. They do not show direct changes to the output level."
    },
    "thresh_curve_curve": {
        "title": "Curve",
        "meaning": "Curve changes the bend of the threshold shape around Center. Positive values raise the outer parts. Negative values lower the outer parts.",
        "tryIt": "Start near zero. Adjust Curve in small steps.",
        "caution": "Curve changes the compression thresholds. It does not directly increase or decrease the signal level."
    },
    "thresh_mode": {
        "title": "Mode",
        "meaning": "Mode selects the signal that controls compression. Pink Noise uses the main input and a tilted threshold shape. It does not add noise. Sidechain Matching uses a second signal to set the target shape. Sidechain Compression uses a second signal to control compression of the main input.",
        "tryIt": "Start with Pink Noise. Connect a signal to the sidechain input before you select a sidechain mode.",
        "caution": "The plugin does not mix the sidechain signal into the output. Sidechain Matching and Match level do different tasks."
    },
    "thresh_sc_link": {
        "title": "SC link",
        "meaning": "SC means sidechain. In sidechain modes, this control sets how much information the left and right detectors share.",
        "tryIt": "Increase SC link to make the left and right detectors respond more similarly.",
        "caution": "At 100%, both detectors use the average of the sidechain channels. This control does not change stereo width."
    },
    "gain_smoothing": {
        "title": "Smoothing",
        "meaning": "Smoothing makes gain changes more similar across adjacent frequency ranges. Higher values make these changes less narrow.",
        "tryIt": "Increase Smoothing slowly if narrow frequency ranges change level too much.",
        "caution": "Smoothing changes the audio signal. It does not control graph animation, Attack, or Release."
    },
    "output": {
        "title": "Output Gain",
        "meaning": "Output Gain changes the level of the processed signal before Mix combines it with the original signal.",
        "tryIt": "Decrease Output Gain if the processed signal is too loud.",
        "caution": "Output Gain is not a limiter. At 0% Mix, Output Gain has no effect on the output."
    },
    "bypass": {
        "title": "Bypass",
        "meaning": "Bypass lets you compare the original signal with the compressed signal. With Bypass on, you hear the original signal.",
        "tryIt": "Set Bypass on to hear the original signal. Set Bypass off to hear the effect again.",
        "caution": "The signal can still have a delay while Bypass is on. A louder signal does not always sound better."
    },
    "dry_wet": {
        "title": "Mix",
        "meaning": "Mix combines the original signal with the processed signal. At 0%, you hear only the original signal. At 100%, you hear only the processed signal.",
        "tryIt": "Decrease Mix if the effect is too strong.",
        "caution": "Mix and Ratio do different tasks. A Mix value of 50% does not halve the compression ratio."
    },
    "stft_window": {
        "title": "Window Size",
        "meaning": "Window Size sets how many audio samples the plugin analyzes at one time. Larger values separate nearby frequencies more accurately. They also increase delay.",
        "tryIt": "Keep the default value while you learn the controls.",
        "caution": "Larger values can increase CPU use. A change can interrupt the signal briefly. Window Size does not switch spectral processing off."
    },
    "stft_overlap": {
        "title": "Window Overlap",
        "meaning": "Window Overlap sets how much each analysis window overlaps the previous window. Higher values make the plugin analyze the signal more frequently.",
        "tryIt": "Keep the default value unless you need to compare processing quality and CPU use.",
        "caution": "Higher values increase CPU use. This control does not change the graph animation rate."
    },
    "attack": {
        "title": "Attack",
        "meaning": "Attack sets how quickly the detector follows an increase in signal level. Shorter times make the detector respond faster.",
        "tryIt": "Increase Attack if compression decreases the start of a drum hit too much.",
        "caution": "Attack affects both compression directions. It is not an additional start delay."
    },
    "release": {
        "title": "Release",
        "meaning": "Release sets how quickly the detector follows a decrease in signal level. Longer times make the response more gradual.",
        "tryIt": "Increase Release if the signal level changes too quickly.",
        "caution": "Short times can make level changes more noticeable. The result also depends on the rhythm of the input."
    },
    "compressor_freeze": {
        "title": "Freeze",
        "meaning": "Freeze keeps the current gain changes instead of calculating new gain changes. The input signal continues to play.",
        "tryIt": "Set Freeze on to keep a gain pattern. Set Freeze off to follow changes in the input again.",
        "caution": "Freeze does not record audio. A preset saves the switch value, not the captured gain pattern."
    },
    "delta": {
        "title": "Listen to delta",
        "meaning": "Listen to delta plays the difference between the input signal and the processed signal. This helps you hear what the effect changes.",
        "tryIt": "Listen briefly. Switch Listen to delta off before you evaluate the complete signal.",
        "caution": "The difference signal can be quiet or unusual. Do not increase your listening level to compensate."
    },
    "match": {
        "title": "Match level",
        "meaning": "Match level measures five seconds of audio. Then it adjusts Output Gain to make the processed level closer to the input level.",
        "tryIt": "Play a section that has typical levels for your track. Select Match level.",
        "caution": "Match level changes Output Gain. It switches Bypass and Listen to delta off. It is not a limiter. Insufficient input can cause failure."
    },
    "graph": {
        "title": "Read the graph",
        "meaning": "Low frequencies are on the left. High frequencies are on the right. The pale line shows the detected level. Yellow shows the downward threshold. Blue shows the upward threshold. Purple shows gain change.",
        "tryIt": "Monitor the purple line. Below its 0 dB line means a level decrease. Above means a level increase.",
        "caution": "The graph does not show the final output peak. The dotted curve and numbered points set thresholds, not direct output levels."
    },
    "presets": {
        "title": "Presets",
        "meaning": "A preset contains saved control values. A preset selection changes the current values. Init restores the defaults. Both Ratio controls then have a value of 1:1.",
        "tryIt": "Select a preset as a starting point. Change one control at a time.",
        "caution": "Gentle Glue and Detail Lift are example presets for this browser version. They are not official Polarity presets. Use a low listening level."
    },
    "preset-save": {
        "title": "Save preset",
        "meaning": "Save preset saves the current control values in this browser. Each user preset has a name.",
        "tryIt": "Enter a name that identifies the preset. Export the preset file to keep a backup.",
        "caution": "Other browsers and browser profiles have separate preset libraries. Site data deletion can remove presets. Save the DAW project separately."
    },
    "preset-export": {
        "title": "Export preset",
        "meaning": "Export downloads the current control values as a .scdark.json file. You can use the file as a backup.",
        "tryIt": "Export important presets before you delete browser data.",
        "caution": "The file does not contain audio, a DAW project, or a captured Freeze gain pattern."
    },
    "preset-import": {
        "title": "Import preset",
        "meaning": "Import checks a .scdark.json file and adds it to the preset menu. Import does not change the current control values.",
        "tryIt": "Select the imported preset from My presets to apply its control values.",
        "caution": "This browser version accepts only its own preset format. It does not accept native desktop Polarity curve files."
    },
    "preset-delete": {
        "title": "Delete preset",
        "meaning": "Delete removes the selected user preset after confirmation. The current control values do not change.",
        "tryIt": "Export a backup before you delete a preset that you might need again.",
        "caution": "Factory presets cannot be deleted. Preset deletion does not reset the effect."
    },
    "downwards_threshold_offset": {
        "title": "Downward Offset",
        "meaning": "Downward Offset moves only the yellow threshold relative to the main threshold shape. The blue threshold does not move.",
        "tryIt": "Decrease Downward Offset to compress at lower signal levels.",
        "caution": "Offset moves a compression threshold. It does not directly change the output level. This direction requires a Ratio above 1:1."
    },
    "downwards_ratio": {
        "title": "Downward Ratio",
        "meaning": "Downward Ratio sets the strength of downward compression. A value of 1:1 switches this direction off. Higher values make it stronger.",
        "tryIt": "Start at 2:1. Adjust Threshold until you hear a small change.",
        "caution": "Strong downward compression can decrease drum hits and other loud detail too much."
    },
    "downwards_high_freq_rolloff": {
        "title": "Downward HF rolloff",
        "meaning": "HF means high frequency. Higher values move the high-frequency ratio closer to 1:1. This decreases compression at high frequencies.",
        "tryIt": "Increase Downward HF rolloff to decrease this compression direction at high frequencies.",
        "caution": "This is not a filter that directly decreases high-frequency levels. Less downward compression can leave high-frequency levels higher."
    },
    "downwards_knee": {
        "title": "Downward Knee",
        "meaning": "Downward Knee sets how gradually compression starts near the threshold. A larger value makes the transition more gradual.",
        "tryIt": "Increase Downward Knee for a more gradual transition.",
        "caution": "Knee changes the level range around the threshold. Attack and Release control the detector response time."
    },
    "upwards_threshold_offset": {
        "title": "Upward Offset",
        "meaning": "Upward Offset moves only the blue threshold relative to the main threshold shape. The yellow threshold does not move.",
        "tryIt": "Increase Upward Offset to increase more quiet detail.",
        "caution": "Offset moves a compression threshold. It does not directly change the output level. This direction requires a Ratio above 1:1."
    },
    "upwards_ratio": {
        "title": "Upward Ratio",
        "meaning": "Upward Ratio sets the strength of upward compression. A value of 1:1 switches this direction off. Higher values make it stronger.",
        "tryIt": "Increase Upward Ratio slowly from 1:1.",
        "caution": "Upward compression can increase noise and reverb tails. Reverb tails are the sound that continues after the source stops. Use a low listening level."
    },
    "upwards_high_freq_rolloff": {
        "title": "Upward HF rolloff",
        "meaning": "HF means high frequency. Higher values move the high-frequency ratio closer to 1:1. This decreases compression at high frequencies.",
        "tryIt": "Increase Upward HF rolloff to decrease this compression direction at high frequencies.",
        "caution": "This is not a filter that directly decreases high-frequency levels. Less downward compression can leave high-frequency levels higher."
    },
    "upwards_knee": {
        "title": "Upward Knee",
        "meaning": "Upward Knee sets how gradually compression starts near the threshold. A larger value makes the transition more gradual.",
        "tryIt": "Increase Upward Knee for a more gradual transition.",
        "caution": "Knee changes the level range around the threshold. Attack and Release control the detector response time."
    }
};

const pointTopics = {
    "enabled": {
        "title": "Enabled",
        "meaning": "The Enabled switch adds this point to the threshold shape. With Enabled off, the plugin keeps its values but ignores the point.",
        "tryIt": "Set Enabled on. Drag the numbered point or use its controls.",
        "caution": "Points set compression thresholds. They are not separate compressor bands or direct level controls."
    },
    "frequency": {
        "title": "Frequency",
        "meaning": "Frequency sets the position of this point. Lower values move it left. Higher values move it right.",
        "tryIt": "Drag the numbered point left or right. Alternatively, enter a frequency value.",
        "caution": "The point must have Enabled on to change the curve. Frequency does not create a boundary between separate bands."
    },
    "offset": {
        "title": "Offset",
        "meaning": "Offset raises or lowers the threshold shape near this point. The plugin makes a smooth curve between enabled points.",
        "tryIt": "Drag the numbered point up or down. Press Escape during a drag to restore the starting values.",
        "caution": "A higher threshold can permit less downward compression and more upward compression. Other control values also affect the result."
    }
};

const inlineParameters = new Set([
    'tresh_global', 'thresh_center_freq', 'thresh_curve_slope', 'thresh_curve_curve', 'thresh_mode', 'thresh_sc_link', 'gain_smoothing',
    'downwards_threshold_offset', 'downwards_ratio', 'downwards_high_freq_rolloff', 'downwards_knee',
    'upwards_threshold_offset', 'upwards_ratio', 'upwards_high_freq_rolloff', 'upwards_knee',
    'stft_window', 'stft_overlap', 'attack', 'release', 'compressor_freeze',
]);

// Utilities remain explained in the guide, without inline buttons on the processing surface.
export function hasInlineHelp(id) {
    return inlineParameters.has(id) || /^curve_point_(enabled|frequency|offset)_[1-8]$/.test(id);
}

export function helpFor(id) {
    if (Object.hasOwn(topics, id)) return topics[id];
    const point = /^curve_point_(enabled|frequency|offset)_([1-8])$/.exec(id);
    if (!point) return undefined;
    const [, field, number] = point;
    const data = pointTopics[field];
    return {...data, title: 'Point ' + number + ': ' + data.title};
}

export const referenceGroups = [
    ['Threshold & character', ['tresh_global', 'thresh_center_freq', 'thresh_curve_slope', 'thresh_curve_curve', 'thresh_mode', 'thresh_sc_link', 'gain_smoothing']],
    ['Downward compression', ['downwards_threshold_offset', 'downwards_ratio', 'downwards_high_freq_rolloff', 'downwards_knee']],
    ['Upward compression', ['upwards_threshold_offset', 'upwards_ratio', 'upwards_high_freq_rolloff', 'upwards_knee']],
    ['Output & timing', ['output', 'bypass', 'dry_wet', 'stft_window', 'stft_overlap', 'attack', 'release', 'compressor_freeze']],
    ['Curve points 1–8', ['curve_point_enabled_1', 'curve_point_frequency_1', 'curve_point_offset_1']],
    ['Listening, graph & presets', ['delta', 'match', 'graph', 'presets', 'preset-save', 'preset-export', 'preset-import', 'preset-delete']],
];

export const guideSections = [
    {
        "id": "basics",
        "title": "What is SC Dark?",
        "paragraphs": [
            "SC Dark is a spectral compressor. It measures the level in many small frequency ranges. It can change the level of each range.",
            "Downward compression decreases loud detail. Upward compression increases quiet detail. The plugin combines these changes into one output signal.",
            "FFT means fast Fourier transform. It is the analysis method that separates the signal into frequency ranges. The plugin then reconstructs the signal.",
            "Strong compression can decrease drum hits too much. Upward compression can also increase background noise. Use a low listening level."
        ]
    },
    {
        "id": "start",
        "title": "A simple first try",
        "steps": [
            "Save your DAW project.",
            "Set your listening level low.",
            "Play a familiar section of your track.",
            "Select Init from Preset. This restores the default control values.",
            "Set Downward Ratio to 2:1. Upward Ratio stays at its default value of 1:1.",
            "Decrease Threshold slowly until you hear a small change.",
            "Set Bypass on to hear the original signal.",
            "Set Bypass off to hear the compressed signal.",
            "Adjust Output Gain to compare the signals at a similar listening level.",
            "Decrease Mix if the effect is too strong.",
            "Save the DAW project when you are satisfied with the result."
        ]
    },
    {
        "id": "reading",
        "title": "What am I seeing?",
        "paragraphs": [
            "The graph shows low frequencies on the left and high frequencies on the right. The pale line follows the detected level.",
            "The yellow line shows the downward threshold. The blue line shows the upward threshold. These lines set where each compression direction starts.",
            "The purple line shows gain change. Below its 0 dB line means a level decrease. Above means a level increase.",
            "Numbered points change the dotted threshold curve. The curve sets thresholds, not direct changes to the output level.",
            "The graph shows levels in frequency ranges. Use the host output meter to check the final output peak."
        ]
    },
    {
        "id": "points",
        "title": "Adjust a curve point",
        "steps": [
            "Open Threshold curve points below the graph.",
            "Set Enabled on for a point.",
            "Drag its number left or right to change Frequency.",
            "Drag its number up or down to change Offset.",
            "Release the pointer to keep the values.",
            "Press Escape during a drag if you need to restore the starting values."
        ]
    },
    {
        "id": "words",
        "title": "The words, in plain language",
        "terms": [
            [
                "Audio signal",
                "The audio data that the plugin receives or produces. Input is the received signal. Output is the produced signal."
            ],
            [
                "Frequency / Hz",
                "Frequency identifies a range from low bass to high treble. Hz means hertz. kHz means thousands of hertz."
            ],
            [
                "Level / gain / dB",
                "Level describes the strength of a signal. Gain changes that strength. dB means decibel, a unit for level comparison. Positive gain increases level. Negative gain decreases level. A gain change of 0 dB makes no change."
            ],
            [
                "Threshold",
                "The level at which compression starts. SC Dark uses separate thresholds for upward and downward compression."
            ],
            [
                "Ratio",
                "The strength of compression. A value of 1:1 switches that compression direction off."
            ],
            [
                "Detector",
                "The part of the plugin that measures signal level. Its response controls compression."
            ],
            [
                "Attack / Release / ms",
                "Attack controls the response to increasing levels. Release controls the response to decreasing levels. ms means millisecond, or one thousandth of a second."
            ],
            [
                "Dry / wet",
                "Dry means the original signal. Wet means the processed signal. Mix combines these signals."
            ],
            [
                "Sidechain",
                "A second input signal that controls the effect. The plugin does not automatically add this signal to the output."
            ],
            [
                "Latency",
                "The delay between input and output. Spectral analysis causes some delay. Larger FFT windows increase this delay."
            ],
            [
                "CPU",
                "The processor that runs the audio calculations. Higher CPU use leaves less processing capacity for other tasks."
            ],
            [
                "Preset",
                "A file or browser entry that contains saved control values. It does not contain the track audio."
            ],
            [
                "DAW",
                "Digital audio workstation. This is the application in which you record, arrange, and process audio."
            ],
            [
                "Host",
                "The application that loads the plugin. For this browser version, openDAW is the host."
            ]
        ]
    },
    {
        "id": "questions",
        "title": "If something seems wrong",
        "terms": [
            [
                "I cannot hear a change.",
                "Check Bypass and Mix. Check both Ratio values. A Ratio of 1:1 makes no compression in that direction. Use Pink Noise mode if no sidechain signal is connected."
            ],
            [
                "The effect changes the signal too much.",
                "Decrease Ratio or Mix. Decrease Output Gain if the output is too loud. Upward compression can increase noise as well as useful detail."
            ],
            [
                "The output has a delay.",
                "Spectral analysis requires time. Keep the default FFT settings while you learn. A smaller Window Size decreases delay but changes frequency detail."
            ],
            [
                "Does smooth graph movement change the signal?",
                "No. Graph animation changes only the display. The Smoothing control changes the audio signal across adjacent frequency ranges."
            ],
            [
                "Does Match level prevent clipping?",
                "No. Match level estimates an output adjustment over five seconds. There is no automatic limiter. Use the host output meter to check peaks."
            ],
            [
                "What is clipping?",
                "Clipping occurs when a signal exceeds a level limit. It can cause unwanted distortion. Decrease the output level if the host meter shows overload."
            ]
        ]
    }
];
