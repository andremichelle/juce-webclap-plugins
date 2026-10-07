// juce_events with the wasm message loop. Compile this instead of juce_events/juce_events.cpp.

#include <juce_events/juce_events.cpp>

#if JUCE_WASM
 #include "native/juce_wasm_Messaging.cpp"
#endif
