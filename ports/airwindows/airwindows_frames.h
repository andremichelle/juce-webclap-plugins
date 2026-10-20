/*
    Airwindows Basics' port frames (juce_webclap_protocol.h, firstPluginType and up). Everything else is the
    kit's generic path: parameters and state.

        effect  UI -> DSP   UTF-8 name of the effect the editor picked (AirwinRegistry::nameToIndex). The effect is
                            part of the state, not a parameter. Sent before the effect's values: the DSP side
                            switches the same way (pushResetTypeFromUI), which renames the ten effect parameters
                            and resets them to the effect's defaults, as on the UI side.
*/

#pragma once

#include <juce_webclap/juce_webclap_protocol.h>

namespace airwindows_webclap
{
enum Frame : juce::webclap::protocol::uint8
{
    effect = juce::webclap::protocol::firstPluginType
};
}
