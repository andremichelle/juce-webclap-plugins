// juce_graphics with in-memory fonts and software images. Compile this instead of juce_graphics/juce_graphics.cpp.

#include <juce_graphics/juce_graphics.cpp>

#if JUCE_WASM
 #include "juce_webclap_ui.h"
 #include "native/juce_wasm_Fonts.cpp"
#endif
