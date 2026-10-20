# Shared by the DPF ports (ports/kars, ports/nekobi, ...): a DISTRHO Plugin Framework plugin as a WebCLAP module.
#
# DPF already wraps a plugin as a CLAP plugin (distrho/src/DistrhoPluginCLAP.cpp); compiled with Emscripten into a
# standalone wasm module that wrapper is all a WCLAP needs, so these ports have no kit code of their own. The
# plugin's editor is not built (DPF's UI needs DGL and a window system): the module is the DSP only, which hosts
# show with their generic parameter UI.
#
# Set before including this file:
#   PORT_ID           bundle name, e.g. kars  (the bundle lands in web/<PORT_ID>.wclap, next to the test host page)
#   PLUGIN_DIR        the plugin's directory with its DistrhoPluginInfo.h
#   PLUGIN_SOURCES    the plugin's DSP sources (the Makefile's FILES_DSP)
# and optionally:
#   PLUGIN_INCLUDES   extra include directories
#   PLUGIN_DEFINITIONS extra compile definitions
#   PLUGIN_CXX_FLAGS  extra C++ flags
#   PLUGIN_CLAP_ID    for plugins whose DistrhoPluginInfo.h predates DPF's CLAP support (no DISTRHO_PLUGIN_CLAP_ID)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(DPF "${KIT_ROOT}/external/DPF")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/${PORT_ID}.wclap")

# DPF reads DISTRHO_PLUGIN_HAS_UI from the plugin's DistrhoPluginInfo.h. A copy with the UI switched off goes first
# on the include path, the plugin's own header stays untouched.
file(READ "${PLUGIN_DIR}/DistrhoPluginInfo.h" DPF_INFO_HEADER)
string(REGEX REPLACE "(#define DISTRHO_PLUGIN_HAS_UI[ \t]+)1" "\\10" DPF_INFO_HEADER "${DPF_INFO_HEADER}")
if(NOT DPF_INFO_HEADER MATCHES "DISTRHO_PLUGIN_CLAP_ID")
    if(NOT PLUGIN_CLAP_ID)
        message(FATAL_ERROR "${PLUGIN_DIR}/DistrhoPluginInfo.h has no DISTRHO_PLUGIN_CLAP_ID: set PLUGIN_CLAP_ID")
    endif()
    string(APPEND DPF_INFO_HEADER "\n#define DISTRHO_PLUGIN_CLAP_ID \"${PLUGIN_CLAP_ID}\"\n")
endif()
file(WRITE "${CMAKE_BINARY_DIR}/dpf-shim/DistrhoPluginInfo.h" "${DPF_INFO_HEADER}")

add_executable(module
    "${DPF}/distrho/DistrhoPluginMain.cpp"
    ${PLUGIN_SOURCES}
    # keeps module.wasm free of Emscripten "env" imports: WebCLAP hosts give a module WASI and nothing else
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp")

target_include_directories(module PRIVATE
    "${CMAKE_BINARY_DIR}/dpf-shim"
    "${PLUGIN_DIR}"
    ${PLUGIN_INCLUDES}
    "${DPF}/distrho"
    "${DPF}/distrho/src"
    "${DPF}")
target_compile_definitions(module PRIVATE
    DISTRHO_PLUGIN_TARGET_CLAP
    DISTRHO_NO_WARNINGS
    ${PLUGIN_DEFINITIONS}
    NDEBUG)
target_compile_options(module PRIVATE -fPIC -w $<$<COMPILE_LANGUAGE:CXX>:${PLUGIN_CXX_FLAGS}>)

# A standalone wasm module (no Emscripten JS) exporting clap_entry, malloc and the function table, importing only
# WASI. The same options as JUCE_WEBCLAP_DSP_LINK_OPTIONS in modules/juce_webclap/juce_webclap.cmake, without the
# JUCE-only flags.
target_link_options(module PRIVATE
    -sSTANDALONE_WASM=1
    --no-entry
    -sEXPORTED_FUNCTIONS=_malloc,_free
    -Wl,--export=clap_entry
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=32MB
    -sSTACK_SIZE=1MB
    -sALLOW_TABLE_GROWTH=1
    -sERROR_ON_UNDEFINED_SYMBOLS=1)
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
