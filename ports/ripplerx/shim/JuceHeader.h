// What juce_generate_juce_header writes for RipplerX (its CMake links juce_audio_utils), for the wasm build.
// The DSP module includes the same headers: the processor's header is shared with the editor.

#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include "BinaryData.h"

#if ! DONT_SET_USING_JUCE_NAMESPACE
using namespace juce;
#endif

#if ! JUCE_DONT_DECLARE_PROJECTINFO
namespace ProjectInfo
{
    const char* const projectName    = "RipplerX";
    const char* const companyName    = "Tilr";
    const char* const versionString  = RIPPLERX_VERSION;
    const int         versionNumber  = RIPPLERX_VERSION_NUMBER;
}
#endif
