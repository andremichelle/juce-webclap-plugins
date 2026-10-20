# Airwindows Consolidated as a WebCLAP bundle: module.wasm (DSP, CLAP entry) and ui/ui.wasm (the editor). Configure
# with emcmake, see scripts/build-airwindows.sh. The bundle lands in web/airwindows.wclap, next to the test host page.

cmake_minimum_required(VERSION 3.20)
project(airwindows-webclap LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(AW "${EXT}/airwin2rack")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/airwindows.wclap")

# Upstream numbers its builds 1.<year>.<day of year + 1> of the build; this is the day of the pinned commit
set(AW_VERSION "1.2026.291")
set(AW_COMMIT "d8fe301")

# ---------------------------------------------------------------------------------------------------------------
# JUCE with the wasm platform layer. Both modules use the GUI library: the processor's headers use Colour and
# PluginHostType, the linker keeps what is used (as in the RipplerX and Surge XT ports).

set(JUCE_WEBCLAP_PLUGIN_DEFINITIONS
    JucePlugin_Name="Airwindows Consolidated"
    JucePlugin_Desc="Airwindows Consolidated"
    JucePlugin_Manufacturer="Airwindows"
    JucePlugin_VersionString="${AW_VERSION}"
    JucePlugin_IsSynth=0
    JucePlugin_WantsMidiInput=0
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=0)
include("${KIT_ROOT}/modules/juce_webclap/juce_webclap.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Resources, as upstream embeds them with CMakeRC: the effects' documentation (shown by the editor) and the
# editor's fonts and icons. The DSP module gets an empty documentation library, nothing there reads it.

include("${AW}/cmake/CmakeRC.cmake")

file(GLOB AW_DOCS "${AW}/res/awpdoc/*.txt")
cmrc_add_resource_library(awdoc_resources WHENCE "${AW}" ${AW_DOCS})
cmrc_add_resource_library(awdoc_resources_empty NAMESPACE awdoc_resources)

file(GLOB AW_EDITOR_RESOURCES "${AW}/res/*.ttf" "${AW}/res/clipper.svg" "${AW}/res/mono.svg" "${AW}/res/stereo.svg")
cmrc_add_resource_library(awconsolidated_resources WHENCE "${AW}" ${AW_EDITOR_RESOURCES})

foreach(target awdoc_resources awdoc_resources_empty awconsolidated_resources)
    target_compile_options(${target} PRIVATE ${JUCE_WEBCLAP_FLAGS})
endforeach()

set(WEB_FONT_FILES "${EXT}/fonts/DejaVuSans.ttf" "${EXT}/fonts/DejaVuSans-Bold.ttf")
set(GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")

add_custom_command(
    OUTPUT "${GENERATED}/WebFonts.h" "${GENERATED}/WebFonts.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" WebFonts ${WEB_FONT_FILES}
    DEPENDS ${WEB_FONT_FILES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

# ---------------------------------------------------------------------------------------------------------------
# The effects, upstream's airwin-registry from its generated source list (one patch, see below), compiled once for
# both modules

include("${AW}/src/autogen_airwin/CMakeLists.txt")
list(TRANSFORM AIRWIN_SOURCES PREPEND "${AW}/")

add_library(airwin-registry STATIC
    "${AW}/src/AirwinRegistry.cpp"
    "${AW}/src/airwin_consolidated_base.cpp"
    ${AIRWIN_SOURCES})

target_include_directories(airwin-registry PUBLIC "${AW}/src")
target_compile_definitions(airwin-registry PRIVATE _USE_MATH_DEFINES)
target_compile_options(airwin-registry PRIVATE ${JUCE_WEBCLAP_FLAGS}
    -Wno-unused-function -Wno-unused-value -Wno-unused-but-set-variable -Wno-multichar)
target_link_libraries(airwin-registry PUBLIC cmrc::base)

# ---------------------------------------------------------------------------------------------------------------
# The processor in both modules (in ui.wasm as the editor's stand-in), the editor only in ui.wasm

set(AW_INCLUDE_DIRECTORIES
    "${CMAKE_CURRENT_LIST_DIR}"
    "${CMAKE_CURRENT_LIST_DIR}/shim"
    "${AW}/src-juce")

set(AW_DEFINITIONS
    BUILD_HASH="${AW_COMMIT}"
    _USE_MATH_DEFINES=1)

# ---------------------------------------------------------------------------------------------------------------
# ui.wasm: editor + stand-in processor

add_executable(ui
    ui_main.cpp
    "${AW}/src-juce/AWConsolidatedProcessor.cpp"
    "${AW}/src-juce/AWConsolidatedEditor.cpp"
    "${GENERATED}/WebFonts.cpp")

target_include_directories(ui PRIVATE "${GENERATED}" ${AW_INCLUDE_DIRECTORIES})
target_compile_definitions(ui PRIVATE ${AW_DEFINITIONS})
target_compile_options(ui PRIVATE -Wno-deprecated-declarations)
target_link_libraries(ui PRIVATE airwin-registry awdoc_resources awconsolidated_resources juce_wasm)
target_link_options(ui PRIVATE ${JUCE_WEBCLAP_UI_LINK_OPTIONS})
set_target_properties(ui PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}/ui")

# ---------------------------------------------------------------------------------------------------------------
# module.wasm: the processor as a CLAP plugin, without its editor (patches/airwindows-headless.patch)

add_executable(module
    dsp_main.cpp
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_clap.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp"
    "${AW}/src-juce/AWConsolidatedProcessor.cpp")

target_include_directories(module PRIVATE ${AW_INCLUDE_DIRECTORIES} "${EXT}/clap/include")
target_compile_definitions(module PRIVATE ${AW_DEFINITIONS} AWCO_HEADLESS=1)
target_compile_options(module PRIVATE -Wno-deprecated-declarations)
target_link_libraries(module PRIVATE airwin-registry awdoc_resources_empty juce_wasm)
target_link_options(module PRIVATE ${JUCE_WEBCLAP_DSP_LINK_OPTIONS})
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
