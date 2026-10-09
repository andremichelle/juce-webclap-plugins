/*
    Odin 2's port frames (juce_webclap_protocol.h, firstPluginType and up). Parameters, gestures and state take the
    kit's generic path. Odin keeps the rest of a patch in child trees of its AudioProcessorValueTreeState ("osc",
    "fx", "mod", "lfo", "misc", "draw", "midi_learn"), which its editor edits directly; these frames carry that.

        readPatch  UI -> DSP   a patch the editor loaded (ValueTree::writeToStream, as the editor passed it to
                               readPatch, before migration). The DSP side loads it with readPatch itself, so a
                               patch load is one frame and runs the same code as on desktop.
        tree       UI -> DSP   one property of a child tree: child name, 0, property name, 0, value
                               (var::writeToStream). Sent for what the editor changed since the last frame.
        tuning     UI -> DSP   the editor's tuning: .scl text, 0, .kbm text (the tuning is part of the state,
                               not of the tree)
        arpStep    DSP -> UI   i32 the arpeggiator step that is playing (its LED), up to 30 times a second
        wheels     DSP -> UI   f32 pitch bend, f32 mod wheel, as MIDI moved them (the engine writes those
                               parameters without notifying anyone)
*/

#pragma once

#include <juce_webclap/juce_webclap_protocol.h>

namespace odin2_webclap
{
enum Frame : juce::webclap::protocol::uint8
{
    readPatch = juce::webclap::protocol::firstPluginType,
    tree,
    tuning,
    arpStep,
    wheels
};

/** The child trees of the APVTS state that hold non-parameter patch data. */
inline constexpr const char* trees[] = { "osc", "fx", "mod", "lfo", "misc", "draw", "midi_learn" };
}
