# Dexed as a WebCLAP bundle: module.wasm (DSP, CLAP entry) and ui/ui.wasm (the editor). Configure with emcmake,
# see scripts/build-dexed.sh. The bundle lands in web/dexed.wclap, next to the test host page.

cmake_minimum_required(VERSION 3.20)
project(dexed-webclap LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(DEXED "${EXT}/dexed")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/dexed.wclap")
set(DEXED_VERSION_STRING "1.1.0")

# ---------------------------------------------------------------------------------------------------------------
# JUCE with the wasm platform layer. Both modules use the GUI library: the processor needs juce_audio_processors
# (AudioProcessorValueTreeState), which depends on the GUI modules.

set(JUCE_WEBCLAP_PLUGIN_DEFINITIONS
    JucePlugin_Name="Dexed"
    JucePlugin_Desc="Dexed FM Synth"
    JucePlugin_Manufacturer="Digital Suburban"
    JucePlugin_VersionString="${DEXED_VERSION_STRING}"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=1
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=1)
include("${KIT_ROOT}/modules/juce_webclap/juce_webclap.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Resources: what juce_add_binary_data embeds upstream (assets/CMakeLists.txt: the skin images, fonts, factory
# cartridge zip)

set(DEXED_ASSETS "${DEXED}/assets")
set(DEXED_BINARY_FILES
    ${DEXED_ASSETS}/ui/ButtonUnlabeled_50x30.png
    ${DEXED_ASSETS}/ui/dexedIcon.png
    ${DEXED_ASSETS}/ui/dexed-logo.png
    ${DEXED_ASSETS}/ui/GlobalEditor_1728x288.png
    ${DEXED_ASSETS}/ui/HelpButton.png
    ${DEXED_ASSETS}/ui/HelpButton.svg
    ${DEXED_ASSETS}/ui/Knob_68x68.png
    ${DEXED_ASSETS}/ui/LFO_36_26.png
    ${DEXED_ASSETS}/ui/Light_28x28.png
    ${DEXED_ASSETS}/ui/Meter_140x8.png
    ${DEXED_ASSETS}/ui/NotoSans-Bold.ttf
    ${DEXED_ASSETS}/ui/NotoSans-Regular.ttf
    ${DEXED_ASSETS}/ui/OperatorEditor_574x436.png
    ${DEXED_ASSETS}/ui/Scaling_36_26.png
    ${DEXED_ASSETS}/ui/Slider_52x52.png
    ${DEXED_ASSETS}/ui/Switch_64x64.png
    ${DEXED_ASSETS}/ui/Switch_96x52.png
    ${DEXED_ASSETS}/ui/SwitchLighted_48x26.png
    ${DEXED_ASSETS}/builtin_pgm.zip)
set(WEB_FONT_FILES "${EXT}/fonts/DejaVuSans.ttf" "${EXT}/fonts/DejaVuSans-Bold.ttf")
set(GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")

add_custom_command(
    OUTPUT "${GENERATED}/BinaryData.h" "${GENERATED}/BinaryData.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" BinaryData ${DEXED_BINARY_FILES}
    DEPENDS ${DEXED_BINARY_FILES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

add_custom_command(
    OUTPUT "${GENERATED}/WebFonts.h" "${GENERATED}/WebFonts.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" WebFonts ${WEB_FONT_FILES}
    DEPENDS ${WEB_FONT_FILES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

# ---------------------------------------------------------------------------------------------------------------
# Dexed (source/CMakeLists.txt's list), one patch (patches/dexed-webclap.patch): the processor and DSP in both
# modules (in ui.wasm as the editor's stand-in), the editor only in ui.wasm

set(DEXED_SRC "${DEXED}/source")

set(DEXED_PROCESSOR_SOURCES
    ${DEXED_SRC}/msfa/dx7note.cc
    ${DEXED_SRC}/msfa/env.cc
    ${DEXED_SRC}/msfa/exp2.cc
    ${DEXED_SRC}/msfa/fm_core.cc
    ${DEXED_SRC}/msfa/fm_op_kernel.cc
    ${DEXED_SRC}/msfa/freqlut.cc
    ${DEXED_SRC}/msfa/lfo.cc
    ${DEXED_SRC}/msfa/pitchenv.cc
    ${DEXED_SRC}/msfa/sin.cc
    ${DEXED_SRC}/msfa/tuning.cc
    ${DEXED_SRC}/msfa/porta.cpp
    ${DEXED_SRC}/PluginProcessor.cpp
    ${DEXED_SRC}/PluginData.cpp
    ${DEXED_SRC}/PluginFx.cpp
    ${DEXED_SRC}/Tuning.cpp
    ${DEXED_SRC}/core/Cartridge.cpp
    ${DEXED_SRC}/core/Program.cpp
    ${DEXED_SRC}/engine/EngineMkI.cpp
    ${DEXED_SRC}/engine/EngineOpl.cpp
    ${DEXED_SRC}/midi/SysexComm.cpp
    ${DEXED_SRC}/midi/PluginMidi.cpp
    ${DEXED_SRC}/parameter/DexedApvts.cpp
    ${DEXED_SRC}/parameter/ParametersMapper.cpp
    ${DEXED_SRC}/parameter/State.cpp
    ${DEXED_SRC}/parameter/Preference.cpp
    "${DEXED}/libs/MTS-ESP/Client/libMTSClient.cpp"
    "${GENERATED}/BinaryData.cpp")

set(DEXED_EDITOR_SOURCES
    ${DEXED_SRC}/ui/PluginEditor.cpp
    ${DEXED_SRC}/ui/window/CartManager.cpp
    ${DEXED_SRC}/ui/DXLookNFeel.cpp
    ${DEXED_SRC}/ui/GlobalEditor.cpp
    ${DEXED_SRC}/ui/OperatorEditor.cpp
    ${DEXED_SRC}/ui/window/ParamDialog.cpp
    ${DEXED_SRC}/ui/window/TuningShow.cpp
    ${DEXED_SRC}/ui/component/AlgoDisplay.cpp
    ${DEXED_SRC}/ui/component/DXComponents.cpp
    ${DEXED_SRC}/ui/component/EnvDisplay.cpp
    ${DEXED_SRC}/ui/component/ProgramListBox.cpp
    ${DEXED_SRC}/ui/component/VUMeter.cpp
    ${DEXED_SRC}/debugger/ValueTreeDebugger.cpp
    "${DEXED}/libs/surgesynthteam_tuningui/surgesynthteam_tuningui.cpp")

set(DEXED_INCLUDE_DIRECTORIES
    "${CMAKE_CURRENT_LIST_DIR}"
    "${CMAKE_CURRENT_LIST_DIR}/shim/inc"
    "${CMAKE_CURRENT_LIST_DIR}/shim/JuceLibraryCode" # for the headers that include "JuceHeader.h" without a path
    "${GENERATED}"
    "${DEXED_SRC}"
    "${DEXED}/libs"
    "${DEXED}/libs/MTS-ESP/Client"
    "${DEXED}/libs/tuning-library/include")

set(DEXED_DEFINITIONS
    DEXED_WEBCLAP=1
    DEXED_VERSION="${DEXED_VERSION_STRING}"
    JUCE_REPORT_APP_USAGE=0)

set(DEXED_JUCE juce_wasm_keyboard juce_wasm_audio_formats juce_wasm_gui_extra)

# ---------------------------------------------------------------------------------------------------------------
# ui.wasm: editor + stand-in processor

add_executable(ui
    ui_main.cpp
    ${DEXED_PROCESSOR_SOURCES}
    ${DEXED_EDITOR_SOURCES}
    "${GENERATED}/WebFonts.cpp")

target_include_directories(ui PRIVATE ${DEXED_INCLUDE_DIRECTORIES})
target_compile_definitions(ui PRIVATE ${DEXED_DEFINITIONS})
target_compile_options(ui PRIVATE -Wno-deprecated-declarations -Wno-macro-redefined)
target_link_libraries(ui PRIVATE ${DEXED_JUCE})
target_link_options(ui PRIVATE ${JUCE_WEBCLAP_UI_LINK_OPTIONS})
set_target_properties(ui PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}/ui")

# ---------------------------------------------------------------------------------------------------------------
# module.wasm: the processor as a CLAP plugin, without its editor, dialogs or file choosers (DEXED_HEADLESS,
# patches/dexed-webclap.patch)

add_executable(module
    dsp_main.cpp
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_clap.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp"
    ${DEXED_PROCESSOR_SOURCES})

target_include_directories(module PRIVATE ${DEXED_INCLUDE_DIRECTORIES} "${EXT}/clap/include")
target_compile_definitions(module PRIVATE ${DEXED_DEFINITIONS} DEXED_HEADLESS=1)
target_compile_options(module PRIVATE -Wno-deprecated-declarations -Wno-macro-redefined)
target_link_libraries(module PRIVATE ${DEXED_JUCE})
target_link_options(module PRIVATE ${JUCE_WEBCLAP_DSP_LINK_OPTIONS})
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
