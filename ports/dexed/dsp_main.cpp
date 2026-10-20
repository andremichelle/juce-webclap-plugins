/*
    Dexed as module.wasm: the processor, wrapped by juce_webclap_clap.cpp. No GUI code.

    PluginProcessor.cpp is compiled with DEXED_HEADLESS (patches/dexed-webclap.patch), which leaves out its
    createEditor() and hasEditor(), and the dialogs and file choosers the editor-less processor never shows. They
    are defined here: the editor runs in the page (ui.wasm), not in this module.
*/

#include <juce_webclap/juce_webclap_clap.h>

#include <clap/plugin-features.h>

#include "PluginProcessor.h"

bool DexedAudioProcessor::hasEditor() const { return false; }
juce::AudioProcessorEditor* DexedAudioProcessor::createEditor() { return nullptr; }

const juce::webclap::ClapPluginInfo& juce::webclap::getClapPluginInfo()
{
    static const char* const features[] = { CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER,
                                            "FM", "DX7", nullptr };

    static const ClapPluginInfo info {
        "com.digital-suburban.dexed",
        "Dexed",
        "Digital Suburban",
        "https://asb2m10.github.io/dexed/",
        DEXED_VERSION,
        "DX7 FM synthesizer, the editor runs in the page",
        features,
        "/ui/index.html",
        866, // the editor at 100 % scale
        674
    };

    return info;
}
