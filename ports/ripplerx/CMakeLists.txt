# RipplerX as a WebCLAP bundle: module.wasm (DSP, CLAP entry) and ui/ui.wasm (the editor). Configure with emcmake,
# see scripts/build-ripplerx.sh. The bundle lands in web/ripplerx.wclap, next to the test host page.

cmake_minimum_required(VERSION 3.20)
project(ripplerx-webclap LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(RIPPLERX "${EXT}/ripplerx")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/ripplerx.wclap")
set(RIPPLERX_VERSION "1.5.18")

# ---------------------------------------------------------------------------------------------------------------
# JUCE with the wasm platform layer. Both modules use the GUI library: the processor needs juce_audio_processors
# (AudioProcessorValueTreeState), which depends on the GUI modules.

set(JUCE_WEBCLAP_PLUGIN_DEFINITIONS
    JucePlugin_Name="RipplerX"
    JucePlugin_Desc="RipplerX"
    JucePlugin_Manufacturer="Tilr"
    JucePlugin_VersionString="${RIPPLERX_VERSION}"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=0)
include("${KIT_ROOT}/modules/juce_webclap/juce_webclap.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Resources: what juce_add_binary_data embeds upstream (images, font, presets, mallet samples)

file(GLOB_RECURSE RIPPLERX_RESOURCES "${RIPPLERX}/resources/*.*")
list(SORT RIPPLERX_RESOURCES)
set(WEB_FONT_FILES "${EXT}/fonts/DejaVuSans.ttf" "${EXT}/fonts/DejaVuSans-Bold.ttf")
set(GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")

add_custom_command(
    OUTPUT "${GENERATED}/BinaryData.h" "${GENERATED}/BinaryData.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" BinaryData ${RIPPLERX_RESOURCES}
    DEPENDS ${RIPPLERX_RESOURCES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

add_custom_command(
    OUTPUT "${GENERATED}/WebFonts.h" "${GENERATED}/WebFonts.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" WebFonts ${WEB_FONT_FILES}
    DEPENDS ${WEB_FONT_FILES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

# ---------------------------------------------------------------------------------------------------------------
# RipplerX, unchanged sources (one patch, see below): the processor and DSP in both modules (in ui.wasm as the
# editor's stand-in), the editor only in ui.wasm

file(GLOB RIPPLERX_DSP_SOURCES "${RIPPLERX}/src/dsp/*.cpp")
file(GLOB RIPPLERX_UI_SOURCES "${RIPPLERX}/src/ui/*.cpp")

set(RIPPLERX_PROCESSOR_SOURCES
    "${RIPPLERX}/src/PluginProcessor.cpp"
    ${RIPPLERX_DSP_SOURCES}
    "${RIPPLERX}/libs/MTS-ESP/Client/libMTSClient.cpp"
    "${GENERATED}/BinaryData.cpp")

set(RIPPLERX_INCLUDE_DIRECTORIES
    "${CMAKE_CURRENT_LIST_DIR}"
    "${CMAKE_CURRENT_LIST_DIR}/shim"
    "${GENERATED}"
    "${RIPPLERX}/src"
    "${RIPPLERX}/libs/MTS-ESP/Client")

set(RIPPLERX_DEFINITIONS
    PROJECT_VERSION="${RIPPLERX_VERSION}" # as upstream's CMake defines it
    RIPPLERX_VERSION="${RIPPLERX_VERSION}"
    RIPPLERX_VERSION_NUMBER=0x10512)

set(RIPPLERX_JUCE juce_wasm_keyboard juce_wasm_audio_formats juce_wasm_gui_extra)

# ---------------------------------------------------------------------------------------------------------------
# ui.wasm: editor + stand-in processor

add_executable(ui
    ui_main.cpp
    ${RIPPLERX_PROCESSOR_SOURCES}
    ${RIPPLERX_UI_SOURCES}
    "${RIPPLERX}/src/PluginEditor.cpp"
    "${GENERATED}/WebFonts.cpp")

target_include_directories(ui PRIVATE ${RIPPLERX_INCLUDE_DIRECTORIES})
target_compile_definitions(ui PRIVATE ${RIPPLERX_DEFINITIONS})
target_compile_options(ui PRIVATE -Wno-deprecated-declarations)
target_link_libraries(ui PRIVATE ${RIPPLERX_JUCE})
target_link_options(ui PRIVATE ${JUCE_WEBCLAP_UI_LINK_OPTIONS})
set_target_properties(ui PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}/ui")

# ---------------------------------------------------------------------------------------------------------------
# module.wasm: the processor as a CLAP plugin, without its editor (patches/ripplerx-headless.patch)

add_executable(module
    dsp_main.cpp
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_clap.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp"
    ${RIPPLERX_PROCESSOR_SOURCES})

target_include_directories(module PRIVATE ${RIPPLERX_INCLUDE_DIRECTORIES} "${EXT}/clap/include")
target_compile_definitions(module PRIVATE ${RIPPLERX_DEFINITIONS} RIPPLERX_HEADLESS=1)
target_compile_options(module PRIVATE -Wno-deprecated-declarations)
target_link_libraries(module PRIVATE ${RIPPLERX_JUCE})
target_link_options(module PRIVATE ${JUCE_WEBCLAP_DSP_LINK_OPTIONS})
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
