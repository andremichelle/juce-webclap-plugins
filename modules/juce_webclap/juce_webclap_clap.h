/*
    juce_webclap: the DSP side. Wraps a juce::AudioProcessor as a WebCLAP plugin (module.wasm).

    juce_webclap_clap.cpp exports `clap_entry` with one plugin. It creates the processor through JUCE's usual
    createPluginFilter() and implements clap.params, clap.state, clap.audio-ports, clap.note-ports, clap.tail,
    clap.gui (webview API only) and clap.webview/3. The webview page runs the editor as ui.wasm and talks to
    this side with the frames of juce_webclap_protocol.h.

    The module has no threads, so every CLAP call arrives on the same thread. JUCE's message queue and timers
    are pumped from the plugin's calls (process, flush, receive, on_main_thread), which keeps code that defers
    work with callAsync or Timer::callAfterDelay working without a message thread.

    The port defines getClapPluginInfo() and createPluginFilter(), and compiles juce_webclap_clap.cpp with the
    JUCE modules juce_core (juce_core_wasm.cpp), juce_events (juce_events_wasm.cpp), juce_data_structures,
    juce_audio_basics and juce_audio_processors_headless. No GUI module is needed.
*/

#pragma once

namespace juce::webclap
{
    struct ClapPluginInfo
    {
        const char* id;
        const char* name;
        const char* vendor;
        const char* url;
        const char* version;
        const char* description;
        const char* const* features; // null-terminated, e.g. { CLAP_PLUGIN_FEATURE_INSTRUMENT, ..., nullptr }

        const char* webviewUri = "/ui/index.html"; // page in the bundle, see clap.webview get_uri
        int editorWidth = 800;                     // window size until the page reports the editor's own
        int editorHeight = 600;
    };

    /** Defined by the port. */
    const ClapPluginInfo& getClapPluginInfo();
}
