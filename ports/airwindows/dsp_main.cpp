/*
    Airwindows Consolidated as module.wasm: the processor, unchanged, wrapped by juce_webclap_clap.cpp. No editor
    code.

    AWConsolidatedProcessor.cpp is compiled with AWCO_HEADLESS (patches/airwindows-headless.patch), which leaves out
    the editor. The processor needs JUCE's GUI modules all the same (its headers use Colour and PluginHostType), so
    this module links them; nothing reaches the windowing code, so the linker drops it and the module still imports
    only WASI.

    The PageExtension switches the effect when the editor picks one (airwindows_frames.h).
*/

#include <juce_webclap/juce_webclap_clap.h>

#include <clap/plugin-features.h>

#include "AWConsolidatedProcessor.h"
#include "airwindows_frames.h"

namespace
{
struct AirwindowsPage final : juce::webclap::PageExtension
{
    void receive (juce::AudioProcessor& processor, std::uint8_t type, const void* payload, std::size_t size) override
    {
        auto& p = static_cast<AWConsolidatedAudioProcessor&> (processor);

        if (type != airwindows_webclap::effect)
            return;

        const auto found = AirwinRegistry::nameToIndex.find (std::string (static_cast<const char*> (payload), size));

        if (found == AirwinRegistry::nameToIndex.end() || found->second == p.curentProcessorIndex)
            return;

        p.pushResetTypeFromUI (found->second);
        p.updateHostDisplay (juce::AudioProcessor::ChangeDetails().withNonParameterStateChanged (true));
    }
};
} // namespace

std::unique_ptr<juce::webclap::PageExtension> juce::webclap::createPageExtension()
{
    return std::make_unique<AirwindowsPage>();
}

const juce::webclap::ClapPluginInfo& juce::webclap::getClapPluginInfo()
{
    static const char* const features[] = { CLAP_PLUGIN_FEATURE_AUDIO_EFFECT, CLAP_PLUGIN_FEATURE_FILTER,
                                            CLAP_PLUGIN_FEATURE_PHASER, "rotary speaker",
                                            CLAP_PLUGIN_FEATURE_EQUALIZER, CLAP_PLUGIN_FEATURE_GRANULAR,
                                            CLAP_PLUGIN_FEATURE_FREQUENCY_SHIFTER, CLAP_PLUGIN_FEATURE_DISTORTION,
                                            CLAP_PLUGIN_FEATURE_FLANGER, CLAP_PLUGIN_FEATURE_CHORUS,
                                            CLAP_PLUGIN_FEATURE_DELAY, CLAP_PLUGIN_FEATURE_REVERB,
                                            CLAP_PLUGIN_FEATURE_MULTI_EFFECTS, CLAP_PLUGIN_FEATURE_STEREO,
                                            "free and open source", nullptr };

    static const ClapPluginInfo info {
        "com.airwindows.consolidated", // upstream's CLAP id
        "Airwindows Consolidated",
        "Airwindows",
        "https://github.com/baconpaul/airwin2rack",
        JucePlugin_VersionString,
        "All the Airwindows effects in one plugin, the editor runs in the page",
        features,
        "/ui/index.html",
        600, // the editor at 100 % zoom with its documentation shown (AWConsolidatedEditor::baseWidth/baseHeight)
        600
    };

    return info;
}
