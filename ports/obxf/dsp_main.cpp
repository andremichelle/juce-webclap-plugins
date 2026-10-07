/*
    OB-Xf as module.wasm: the processor, unchanged, wrapped by juce_webclap_clap.cpp. No GUI code.

    ObxfProcessor.cpp is compiled with OBXF_HEADLESS, which leaves out hasEditor() and createEditor(). They are
    defined here: the editor runs in the page (ui.wasm), not in this module.
*/

#include <juce_webclap/juce_webclap_clap.h>

#include <clap/plugin-features.h>

#include "ObxfProcessor.h"

bool ObxfAudioProcessor::hasEditor() const { return false; }
juce::AudioProcessorEditor* ObxfAudioProcessor::createEditor() { return nullptr; }

const juce::webclap::ClapPluginInfo& juce::webclap::getClapPluginInfo()
{
    static const char* const features[] = { CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER,
                                            "virtual analog", "analog", nullptr };

    static const ClapPluginInfo info {
        "org.surge-synth-team.OB-Xf",
        "OB-Xf",
        "Surge Synth Team",
        "https://github.com/surge-synthesizer/OB-Xf",
        OBXF_VERSION_STR,
        "Virtual analog synthesizer, the editor runs in the page",
        features,
        "/ui/index.html",
        1150, // the Default theme's background at 100 % zoom, the size a new editor opens with
        576
    };

    return info;
}
