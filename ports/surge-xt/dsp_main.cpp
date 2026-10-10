/*
    Surge XT as module.wasm: SurgeSynthProcessor, wrapped by juce_webclap_clap.cpp. No editor code
    (SURGE_HEADLESS, patches/surge-webclap.patch).

    The PageExtension applies the editor's modulation routings (surge_frames.h) to this engine, through the same
    modulation API the editor called on its own, and marks the host's state dirty. It keeps the editor's zoom for
    pages that reconnect.
*/

#include <juce_webclap/juce_webclap_clap.h>

#include <clap/plugin-features.h>

#include <algorithm>
#include <cstring>
#include <memory>
#include <utility>

#include "SurgeSynthProcessor.h"
#include "gui/UndoManager.h"
#include "surge_frames.h"

// SurgeSynthProcessor owns the editor's undo manager, which the editor creates: never here. Its destructor is
// still referenced; the GUI's implementation is not part of this module.
namespace Surge::GUI
{
struct UndoManagerImpl
{
};

UndoManager::~UndoManager() = default;
} // namespace Surge::GUI

namespace
{
using namespace surge_webclap;

struct SurgePage final : juce::webclap::PageExtension
{
    void receive (juce::AudioProcessor& processor, std::uint8_t type, const void* payload, std::size_t size) override
    {
        auto& p = static_cast<SurgeSynthProcessor&> (processor);

        if (type == zoom)
        {
            int32_t percent = 0;

            if (size == sizeof (percent))
                std::memcpy (&percent, payload, sizeof (percent));

            if (percent == 0)
                zoomRequested = true;
            else if (percent > 0)
                keptZoom = percent;

            return; // a view setting, not state
        }

        if (p.surge == nullptr || size < routingSize || (type != modClear && size < sizeof (ModulationFrame)))
            return;

        ModulationFrame f {};
        std::memcpy (&f, payload, std::min (size, sizeof (f)));

        auto& synth = *p.surge;
        const auto source = (modsources) f.modsource;

        if (f.modsource < 0 || f.modsource >= n_modsources)
            return;

        if (type == modSet)
            synth.setModDepth01 (f.ptag, source, f.modsourceScene, f.index, f.depth01);
        else if (type == modMute)
            synth.muteModulation (f.ptag, source, f.modsourceScene, f.index, f.mute != 0);
        else if (type == modClear)
            synth.clearModulation (f.ptag, source, f.modsourceScene, f.index, false);
        else
            return;

        p.updateHostDisplay (juce::AudioProcessor::ChangeDetails().withNonParameterStateChanged (true));
    }

    void update (juce::AudioProcessor&, const Sender& send) override
    {
        if (std::exchange (zoomRequested, false))
            send (zoom, &keptZoom, sizeof (keptZoom));
    }

private:
    int32_t keptZoom = -1;
    bool zoomRequested = false;
};
} // namespace

std::unique_ptr<juce::webclap::PageExtension> juce::webclap::createPageExtension()
{
    return std::make_unique<SurgePage>();
}

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
