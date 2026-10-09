// What juce_generate_juce_header writes for Odin 2, for the wasm build: the modules its CMake links, without
// juce_audio_devices, juce_audio_plugin_client and juce_opengl (none has a wasm backend, Odin draws without OpenGL).
// Odin includes it as "../JuceLibraryCode/JuceHeader.h"; shim/include is on the include path for that.

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
#include <juce_dsp/juce_dsp.h>

#include "BinaryData.h"

#if ! DONT_SET_USING_JUCE_NAMESPACE
using namespace juce;
#endif

#if ! JUCE_DONT_DECLARE_PROJECTINFO
namespace ProjectInfo
{
    const char* const projectName    = "Odin2";
    const char* const companyName    = "TheWaveWarden";
    const char* const versionString  = "2.4.1";
    const int         versionNumber  = 0x20401;
}
#endif
