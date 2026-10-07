// The DSP module compiles OB-Xf sources that include GUI headers (ObxfProcessor.cpp includes the editor's), whose
// static Colour constants need this constructor. It is the only juce_graphics symbol they reference, so it is
// defined here instead of linking juce_graphics into module.wasm. Copied from juce_Colour.cpp.

#include <juce_graphics/juce_graphics.h>

namespace juce
{
Colour::Colour (uint32 col) noexcept
    : argb (static_cast<uint8> ((col >> 24) & 0xff),
            static_cast<uint8> ((col >> 16) & 0xff),
            static_cast<uint8> ((col >> 8) & 0xff),
            static_cast<uint8> (col & 0xff))
{
}
} // namespace juce
