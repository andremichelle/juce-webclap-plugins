# JUCE for WebAssembly with the juce_webclap platform layer, shared by the ports. Include it after setting
#
#   KIT_ROOT                          the repository root
#   JUCE_WEBCLAP_PLUGIN_DEFINITIONS   the port's JucePlugin_* values (name, version, synth or effect)
#
# It defines three static libraries:
#
#   juce_wasm             JUCE with GUI (core to gui_basics, audio_processors, dsp) for an editor's ui.wasm
#   juce_wasm_gui_extra   juce_gui_extra on top of juce_wasm, for editors that need it
#   juce_wasm_dsp         GUI-free JUCE (core, events, data_structures, audio_basics, audio_processors_headless)
#                         for a module.wasm built around a juce::AudioProcessor

set(JUCE_MODULES "${KIT_ROOT}/external/JUCE/modules")
set(JUCE_WEBCLAP_FLAGS -msimd128 -fwasm-exceptions)

set(JUCE_DEFINITIONS
    JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1
    JUCE_STANDALONE_APPLICATION=0
    JUCE_MODULE_AVAILABLE_juce_core=1
    JUCE_MODULE_AVAILABLE_juce_events=1
    JUCE_MODULE_AVAILABLE_juce_data_structures=1
    JUCE_MODULE_AVAILABLE_juce_audio_basics=1
    JUCE_MODULE_AVAILABLE_juce_audio_processors_headless=1
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_USE_FREETYPE=0
    JUCE_USE_FONTCONFIG=0
    JUCE_MODAL_LOOPS_PERMITTED=0
    JUCE_PLUGINHOST_VST=0
    JUCE_PLUGINHOST_VST3=0
    JUCE_PLUGINHOST_AU=0
    JUCE_PLUGINHOST_LADSPA=0
    JUCE_PLUGINHOST_LV2=0
    JUCE_PLUGINHOST_ARA=0
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_USE_DARK_SPLASH_SCREEN=0
    JUCE_ASIO=0
    JucePlugin_Build_VST=0
    JucePlugin_Build_VST3=0
    JucePlugin_Build_AU=0
    JucePlugin_Build_AUv3=0
    JucePlugin_Build_AAX=0
    JucePlugin_Build_Standalone=0
    JucePlugin_Build_Unity=0
    JucePlugin_Build_LV2=0
    ${JUCE_WEBCLAP_PLUGIN_DEFINITIONS}
    NDEBUG=1)

set(JUCE_GUI_DEFINITIONS
    JUCE_MODULE_AVAILABLE_juce_graphics=1
    JUCE_MODULE_AVAILABLE_juce_gui_basics=1
    JUCE_MODULE_AVAILABLE_juce_audio_processors=1
    JUCE_MODULE_AVAILABLE_juce_dsp=1)

add_library(juce_wasm STATIC
    "${KIT_ROOT}/modules/juce_webclap/juce_core_wasm.cpp"
    "${JUCE_MODULES}/juce_core/juce_core_CompilationTime.cpp"
    "${JUCE_MODULES}/juce_data_structures/juce_data_structures.cpp"
    "${JUCE_MODULES}/juce_graphics/juce_graphics_Harfbuzz.cpp"
    "${JUCE_MODULES}/juce_graphics/juce_graphics_Sheenbidi.c"
    "${JUCE_MODULES}/juce_audio_basics/juce_audio_basics.cpp"
    "${JUCE_MODULES}/juce_audio_processors_headless/juce_audio_processors_headless.cpp"
    "${JUCE_MODULES}/juce_audio_processors/juce_audio_processors.cpp"
    "${JUCE_MODULES}/juce_dsp/juce_dsp.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_events_wasm.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_graphics_wasm.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_gui_basics_wasm.cpp")
target_include_directories(juce_wasm PUBLIC "${JUCE_MODULES}" "${KIT_ROOT}/modules")
target_compile_definitions(juce_wasm PUBLIC ${JUCE_DEFINITIONS} ${JUCE_GUI_DEFINITIONS})
target_compile_options(juce_wasm PUBLIC ${JUCE_WEBCLAP_FLAGS})
target_compile_options(juce_wasm PRIVATE -w)

# juce_gui_extra (ColourSelector, CodeEditor, ...) for editors that need it, without its platform parts
add_library(juce_wasm_gui_extra STATIC "${JUCE_MODULES}/juce_gui_extra/juce_gui_extra.cpp")
target_compile_definitions(juce_wasm_gui_extra PUBLIC JUCE_MODULE_AVAILABLE_juce_gui_extra=1)
target_link_libraries(juce_wasm_gui_extra PUBLIC juce_wasm)
target_compile_options(juce_wasm_gui_extra PRIVATE -w)

add_library(juce_wasm_dsp STATIC
    "${KIT_ROOT}/modules/juce_webclap/juce_core_wasm.cpp"
    "${JUCE_MODULES}/juce_core/juce_core_CompilationTime.cpp"
    "${JUCE_MODULES}/juce_data_structures/juce_data_structures.cpp"
    "${JUCE_MODULES}/juce_audio_basics/juce_audio_basics.cpp"
    "${JUCE_MODULES}/juce_audio_processors_headless/juce_audio_processors_headless.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_events_wasm.cpp")
target_include_directories(juce_wasm_dsp PUBLIC "${JUCE_MODULES}" "${KIT_ROOT}/modules")
target_compile_definitions(juce_wasm_dsp PUBLIC ${JUCE_DEFINITIONS})
target_compile_options(juce_wasm_dsp PUBLIC ${JUCE_WEBCLAP_FLAGS})
target_compile_options(juce_wasm_dsp PRIVATE -w)

# Link options every editor (ui.wasm) needs: a modularized Emscripten module the page's worker instantiates
set(JUCE_WEBCLAP_UI_LINK_OPTIONS
    ${JUCE_WEBCLAP_FLAGS}
    -sMODULARIZE=1
    -sEXPORT_NAME=createWebclapUI
    -sENVIRONMENT=web,worker
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=128MB
    -sSTACK_SIZE=2MB
    -sFILESYSTEM=1
    -sEXPORTED_FUNCTIONS=_malloc,_free
    -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,UTF8ToString,stringToNewUTF8)

# ... and every DSP module (module.wasm): a standalone wasm module (no Emscripten JS), exporting clap_entry, malloc
# and the function table, importing only WASI. Link juce_webclap_standalone.cpp into it.
set(JUCE_WEBCLAP_DSP_LINK_OPTIONS
    ${JUCE_WEBCLAP_FLAGS}
    -sSTANDALONE_WASM=1
    --no-entry
    -sEXPORTED_FUNCTIONS=_malloc,_free
    -Wl,--export=clap_entry
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=32MB
    -sSTACK_SIZE=1MB
    -sALLOW_TABLE_GROWTH=1
    -sERROR_ON_UNDEFINED_SYMBOLS=1)
