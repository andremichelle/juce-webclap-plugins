/*
    Surge XT as module.wasm: SurgeSynthProcessor, wrapped by juce_webclap_clap.cpp. No editor code
    (SURGE_HEADLESS, patches/surge-webclap.patch).
*/

#include <juce_webclap/juce_webclap_clap.h>

#include <clap/plugin-features.h>

#include <memory>

#include "gui/UndoManager.h"

// SurgeSynthProcessor owns the editor's undo manager, which the editor creates: never here. Its destructor is
// still referenced; the GUI's implementation is not part of this module.
namespace Surge::GUI
{
struct UndoManagerImpl
{
};

UndoManager::~UndoManager() = default;
} // namespace Surge::GUI

const juce::webclap::ClapPluginInfo& juce::webclap::getClapPluginInfo()
{
    static const char* const features[] = { CLAP_PLUGIN_FEATURE_INSTRUMENT, CLAP_PLUGIN_FEATURE_SYNTHESIZER,
                                            CLAP_PLUGIN_FEATURE_STEREO, nullptr };

    // The CLAP id of Surge XT's own CLAP build, so hosts see the same plugin
    static const ClapPluginInfo info {
        "org.surge-synth-team.surge-xt",
        "Surge XT",
        "Surge Synth Team",
        "https://surge-synthesizer.github.io/",
        "1.4.0",
        "Hybrid synthesizer",
        features,
        "/ui/index.html",
        904, // the editor at 100 %
        569
    };

    return info;
}
