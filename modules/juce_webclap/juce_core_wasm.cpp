// juce_core with the file and thread natives JUCE's own wasm target leaves out. Compile this instead of
// juce_core/juce_core.cpp.

#include <juce_core/juce_core.cpp>

#if JUCE_WASM
 #include "native/juce_wasm_Files.cpp"
#endif
