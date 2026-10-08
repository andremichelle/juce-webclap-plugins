/*
    RipplerX's port frames (juce_webclap_protocol.h, firstPluginType and up). Everything else is the kit's
    generic path: parameters, state, keyboard notes as midi frames.

        polyphony  UI -> DSP   i32 voices. A setting RipplerX keeps outside its state (in its settings file), so
                               neither state nor parameters carry it. Sent on change and after hello.
        meter      DSP -> UI   f32 output RMS (RipplerXAudioProcessor::rmsValue), up to 30 times a second
        program    UI -> DSP   i32 factory program the editor picked. Sent before the program's values: the DSP
                               side loads the program itself (setCurrentProgram), as a native host would. Applied
                               as single value changes instead, a model change would reset its resonator's ratio
                               (onSlider) and override the program's own ratio.
*/

#pragma once

#include <juce_webclap/juce_webclap_protocol.h>

namespace ripplerx_webclap
{
enum Frame : juce::webclap::protocol::uint8
{
    polyphony = juce::webclap::protocol::firstPluginType,
    meter,
    program
};
}
