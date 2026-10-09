# Odin 2 as a WebCLAP bundle: module.wasm (DSP, CLAP entry) and ui/ui.wasm (the editor). Configure with emcmake,
# see scripts/build-odin2.sh. The bundle lands in web/odin2.wclap, next to the test host page.

cmake_minimum_required(VERSION 3.20)
project(odin2-webclap LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(ODIN "${EXT}/odin2")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/odin2.wclap")
set(ODIN_VERSION "2.4.1")

# ---------------------------------------------------------------------------------------------------------------
# JUCE with the wasm platform layer. Both modules use the GUI library: the processor needs juce_audio_processors
# (AudioProcessorValueTreeState) and includes some of Odin's GUI headers.

set(JUCE_WEBCLAP_PLUGIN_DEFINITIONS
    JucePlugin_Name="Odin2"
    JucePlugin_Desc="Odin2"
    JucePlugin_Manufacturer="TheWaveWarden"
    JucePlugin_VersionString="${ODIN_VERSION}"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=0)
include("${KIT_ROOT}/modules/juce_webclap/juce_webclap.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Resources: what Odin's assets/CMakeLists.txt embeds (GUI data, init patch, font, bitmaps, factory presets), in its
# order, so identifiers that collide get the same numbers as with juceaide

file(STRINGS "${ODIN}/assets/CMakeLists.txt" ODIN_ASSET_LINES REGEX "^[ \t]*\"")
set(ODIN_RESOURCES)
foreach(line IN LISTS ODIN_ASSET_LINES)
    string(REGEX REPLACE "^[ \t]*\"(\\./)?([^\"]+)\".*$" "\\2" asset "${line}")
    list(APPEND ODIN_RESOURCES "${ODIN}/assets/${asset}")
endforeach()

set(WEB_FONT_FILES "${EXT}/fonts/DejaVuSans.ttf" "${EXT}/fonts/DejaVuSans-Bold.ttf")
set(GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")

# The response file keeps the command line short (about 1,500 files)
list(JOIN ODIN_RESOURCES "\n" ODIN_RESOURCE_LIST)
file(WRITE "${GENERATED}/resources.txt" "${ODIN_RESOURCE_LIST}\n")

add_custom_command(
    OUTPUT "${GENERATED}/BinaryData.h" "${GENERATED}/BinaryData.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" BinaryData "@${GENERATED}/resources.txt"
    DEPENDS ${ODIN_RESOURCES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

add_custom_command(
    OUTPUT "${GENERATED}/WebFonts.h" "${GENERATED}/WebFonts.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" WebFonts ${WEB_FONT_FILES}
    DEPENDS ${WEB_FONT_FILES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

# ---------------------------------------------------------------------------------------------------------------
# Odin 2, its sources as upstream builds them (patches/odin2-*.patch): the processor and DSP in both modules (in
# ui.wasm as the editor's stand-in), the editor only in ui.wasm

# The source list of upstream's target_sources (Source/ has files it does not build)
file(STRINGS "${ODIN}/CMakeLists.txt" ODIN_SOURCE_LINES REGEX "^[ \t]*\"Source/.*\\.cpp\"")
set(ODIN_GUI_SOURCES)
set(ODIN_PROCESSOR_SOURCES "${GENERATED}/BinaryData.cpp")
foreach(line IN LISTS ODIN_SOURCE_LINES)
    string(REGEX REPLACE "^[ \t]*\"([^\"]+)\".*$" "${ODIN}/\\1" source "${line}")
    if(source MATCHES "/Source/gui/")
        list(APPEND ODIN_GUI_SOURCES "${source}")
    elseif(NOT source MATCHES "/PluginEditor\\.cpp$")
        list(APPEND ODIN_PROCESSOR_SOURCES "${source}")
    endif()
endforeach()

set(ODIN_INCLUDE_DIRECTORIES
    "${CMAKE_CURRENT_LIST_DIR}"
    "${CMAKE_CURRENT_LIST_DIR}/shim/include" # its ../JuceLibraryCode is the JuceHeader.h Odin includes
    "${GENERATED}"
    "${ODIN}/Source"
    "${ODIN}/libs/tuning-library"
    "${ODIN}/libs/json/include")

set(ODIN_DEFINITIONS
    ODIN_LINUX=1 # paths: ODIN_STORAGE_PATH under the home directory, /user in the browser
    ODIN_WEBCLAP=1
    JUCE_STRICT_REFCOUNTEDPOINTER=1)

# -fbracket-depth: AudioProcessorValueTreeState's constructor is a fold expression over all 258 parameters
set(ODIN_COMPILE_OPTIONS -Wno-deprecated-declarations -Wno-c++11-narrowing -fbracket-depth=1024)

set(ODIN_JUCE juce_wasm_gui_extra juce_wasm_audio_formats)

# ---------------------------------------------------------------------------------------------------------------
# ui.wasm: editor + stand-in processor

add_executable(ui
    ui_main.cpp
    ${ODIN_PROCESSOR_SOURCES}
    ${ODIN_GUI_SOURCES}
    "${ODIN}/Source/PluginEditor.cpp"
    "${GENERATED}/WebFonts.cpp")

target_include_directories(ui PRIVATE ${ODIN_INCLUDE_DIRECTORIES})
target_compile_definitions(ui PRIVATE ${ODIN_DEFINITIONS})
target_compile_options(ui PRIVATE ${ODIN_COMPILE_OPTIONS})
target_link_libraries(ui PRIVATE ${ODIN_JUCE})
target_link_options(ui PRIVATE ${JUCE_WEBCLAP_UI_LINK_OPTIONS})
set_target_properties(ui PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}/ui")

# ---------------------------------------------------------------------------------------------------------------
# module.wasm: the processor as a CLAP plugin, without its editor (ODIN_HEADLESS, patches/odin2-webclap.patch).
# The processor uses a few classes from Source/gui (the arpeggiator, the mod matrix): the GUI sources are a library
# here, so the linker takes only those and leaves the editor's.

add_library(odin_gui_headless STATIC ${ODIN_GUI_SOURCES})
target_include_directories(odin_gui_headless PRIVATE ${ODIN_INCLUDE_DIRECTORIES})
target_compile_definitions(odin_gui_headless PRIVATE ${ODIN_DEFINITIONS} ODIN_HEADLESS=1)
target_compile_options(odin_gui_headless PRIVATE ${ODIN_COMPILE_OPTIONS})
target_link_libraries(odin_gui_headless PRIVATE ${ODIN_JUCE})

add_executable(module
    dsp_main.cpp
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_clap.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp"
    ${ODIN_PROCESSOR_SOURCES})

target_include_directories(module PRIVATE ${ODIN_INCLUDE_DIRECTORIES} "${EXT}/clap/include")
target_compile_definitions(module PRIVATE ${ODIN_DEFINITIONS} ODIN_HEADLESS=1)
target_compile_options(module PRIVATE ${ODIN_COMPILE_OPTIONS})
target_link_libraries(module PRIVATE odin_gui_headless ${ODIN_JUCE})
target_link_options(module PRIVATE ${JUCE_WEBCLAP_DSP_LINK_OPTIONS})
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
