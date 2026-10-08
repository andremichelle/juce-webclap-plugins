// The keyboard components of juce_audio_utils (MidiKeyboardComponent, MPEKeyboardComponent). Compile this instead
// of juce_audio_utils/juce_audio_utils.cpp: the rest of that module (device selector, players, CD reader) needs
// juce_audio_devices, which has no WebAssembly backend.

#include <juce_audio_utils/juce_audio_utils.h>

#include <juce_audio_utils/gui/juce_KeyboardComponentBase.cpp>
#include <juce_audio_utils/gui/juce_MidiKeyboardComponent.cpp>
#include <juce_audio_utils/gui/juce_MPEKeyboardComponent.cpp>
