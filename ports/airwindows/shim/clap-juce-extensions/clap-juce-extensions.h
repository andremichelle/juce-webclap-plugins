/*
    Stand-in for clap-juce-extensions, which upstream's processor derives from. The kit wraps the processor as a
    CLAP plugin itself; the processor only reads is_clap (prepare both precisions, see prepareToPlay).
*/

#pragma once

namespace clap_juce_extensions
{
struct clap_properties
{
    virtual ~clap_properties() = default;

    bool is_clap = true;
};
} // namespace clap_juce_extensions
