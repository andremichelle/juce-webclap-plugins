/*
    Surge XT's port frames (juce_webclap_protocol.h, firstPluginType and up). Parameters, macros, gestures and
    whole patches (state) take the kit's generic path. Modulation routings are neither: the editor edits them on
    its own engine, through SurgeSynthesizer's modulation API, whose listener sends them here.

        modSet    UI -> DSP   i32 ptag, i32 modsource, i32 modsourceScene, i32 index, f32 depth01
                              (SurgeSynthesizer::setModDepth01)
        modMute   UI -> DSP   i32 ptag, i32 modsource, i32 modsourceScene, i32 index, i32 mute
                              (SurgeSynthesizer::muteModulation)
        modClear  UI -> DSP   i32 ptag, i32 modsource, i32 modsourceScene, i32 index
                              (SurgeSynthesizer::clearModulation)
        zoom      both        i32 the editor's zoom in percent. UI -> DSP when it changes, and 0 at start to ask
                              for the one the DSP side kept; DSP -> UI the answer (-1: none kept). A page that
                              reconnects (a host moving the window into a popout reloads it) keeps the zoom. A view
                              setting, not state: Surge writes it into the patch but does not read it back.
        meters    DSP -> UI   f32 vu_peak[8], f32 cpu_level: the engine's output and effect meters and its load,
                              30 times a second while the page is open. The editor's engine never plays, so these
                              drive its meters, and their arrival tells it audio runs (else Surge's VU meter says
                              "Audio Output Unavailable").
*/

#pragma once

#include <juce_webclap/juce_webclap_protocol.h>

#include <cstdint>

namespace surge_webclap
{
enum Frame : juce::webclap::protocol::uint8
{
    modSet = juce::webclap::protocol::firstPluginType,
    modMute,
    modClear,
    zoom,
    meters
};

/** What the meters frame carries. */
struct MetersFrame
{
    float vuPeak[8];
    float cpuLevel;
};

/** The routing a modulation frame addresses, and its value (depth or mute). */
struct ModulationFrame
{
    int32_t ptag, modsource, modsourceScene, index;
    union
    {
        float depth01;
        int32_t mute;
    };
};

/** modClear carries no value. */
constexpr std::size_t routingSize = 4 * sizeof (int32_t);
} // namespace surge_webclap
