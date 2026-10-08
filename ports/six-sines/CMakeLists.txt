# Six Sines as a WebCLAP bundle: module.wasm (the engine as a CLAP plugin) and ui/ui.wasm (the editor). Configure
# with emcmake, see scripts/build-six-sines.sh. The bundle lands in web/six-sines.wclap, next to the test host page.

cmake_minimum_required(VERSION 3.20)
project(six-sines-webclap LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(SIX "${EXT}/six-sines")
set(LIBS "${SIX}/libs")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/six-sines.wclap")

# ---------------------------------------------------------------------------------------------------------------
# JUCE with the wasm platform layer (the editor only, the engine has no JUCE)

set(JUCE_WEBCLAP_PLUGIN_DEFINITIONS
    JucePlugin_Name="Six Sines"
    JucePlugin_Desc="Six Sines"
    JucePlugin_Manufacturer="BaconPaul"
    JucePlugin_VersionString="1.2.0"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=0
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=1)
include("${KIT_ROOT}/modules/juce_webclap/juce_webclap.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Resources: Six Sines embeds its factory patches, themes and fonts with CMakeRC, as upstream does

include("${SIX}/cmake/CmakeRC.cmake")
file(GLOB_RECURSE SIX_PATCHES "${SIX}/resources/factory_patches/*.sxsnp")
cmrc_add_resource_library(six-sines-patches NAMESPACE sixsines_patches WHENCE "${SIX}" ${SIX_PATCHES})
file(GLOB SIX_THEMES "${SIX}/resources/factory_themes/*.sixtheme")
cmrc_add_resource_library(six-sines-themes NAMESPACE sixsines_themes WHENCE "${SIX}" ${SIX_THEMES})
file(GLOB SIX_FONTS "${SIX}/resources/fonts/Manrope/static/*.ttf" "${SIX}/resources/fonts/Anonymous_Pro/*.ttf")
cmrc_add_resource_library(six-sines-fonts NAMESPACE sixsines_fonts WHENCE "${SIX}"
    ${SIX_FONTS} "${SIX}/resources/icon/SixSinesIcon.png" "${SIX}/doc/ack.md")
# sst-jucegui's glyphs, as its own CMake embeds them
file(GLOB JUCEGUI_GLYPHS "${LIBS}/sst/sst-jucegui/res/glyphs/*.svg")
cmrc_add_resource_library(sst-jucegui-resources NAMESPACE sst::jucegui::resources
    WHENCE "${LIBS}/sst/sst-jucegui" ${JUCEGUI_GLYPHS})
foreach(target six-sines-patches six-sines-themes six-sines-fonts sst-jucegui-resources)
    target_compile_options(${target} PRIVATE ${JUCE_WEBCLAP_FLAGS})
endforeach()

# DejaVu Sans for JUCE's own widgets (menus, alerts), as in the other ports
set(WEB_FONT_FILES "${EXT}/fonts/DejaVuSans.ttf" "${EXT}/fonts/DejaVuSans-Bold.ttf")
set(GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")
add_custom_command(
    OUTPUT "${GENERATED}/WebFonts.h" "${GENERATED}/WebFonts.cpp"
    COMMAND python3 "${KIT_ROOT}/scripts/binary_data.py" "${GENERATED}" WebFonts ${WEB_FONT_FILES}
    DEPENDS ${WEB_FONT_FILES} "${KIT_ROOT}/scripts/binary_data.py"
    VERBATIM)

# ---------------------------------------------------------------------------------------------------------------
# The engine and what it needs, shared by both modules: Six Sines' synth and dsp sources (unchanged) and the
# libraries upstream builds from its submodules

set(SIX_INCLUDE_DIRECTORIES
    "${CMAKE_CURRENT_LIST_DIR}"
    "${CMAKE_CURRENT_LIST_DIR}/shim"
    "${KIT_ROOT}/ports/sst-shim"
    "${KIT_ROOT}/modules"
    "${SIX}/src"
    "${LIBS}/sst/sst-basic-blocks/include"
    "${LIBS}/sst/sst-cpputils/include"
    "${LIBS}/sst/sst-filters/include"
    "${LIBS}/sst/sst-voicemanager/include"
    "${LIBS}/sst/sst-plugininfra/include"
    "${LIBS}/sst/sst-plugininfra/libs/tinyxml/include"
    "${LIBS}/sst/sst-plugininfra/libs/tinyxml/include/tinyxml"
    "${LIBS}/sst/sst-plugininfra/libs/strnatcmp"
    "${LIBS}/sst/sst-plugininfra/libs/miniz"
    "${LIBS}/clap-libs/clap/include"
    "${LIBS}/clap-libs/clap-helpers/include"
    "${LIBS}/fmt/include"
    "${LIBS}/simde"
    "${LIBS}/libsamplerate/include"
    "${LIBS}/pffft"
    "${LIBS}/MTS-ESP/Client"
    "${EXT}/ghc-filesystem/include")

# What upstream's library targets define for their users
set(SIX_DEFINITIONS
    PRODUCT_NAME="Six Sines"
    FMT_HEADER_ONLY=1
    SIMDE_ENABLE_NATIVE_ALIASES=1
    SST_PLUGININFRA_HAS_VERSION_INFORMATION=1
    SST_PLUGININFRA_PATCHBASE=1
    TIXML_USE_STL=1
    SST_COMMAND_CTRL_SAME_KEY=1)

set(SIX_FLAGS ${JUCE_WEBCLAP_FLAGS} $<$<COMPILE_LANGUAGE:CXX>:-fno-char8_t>)

add_library(six-sines-engine STATIC
    "${SIX}/src/dsp/sintable.cpp"
    "${SIX}/src/dsp/wavetable_build.cpp"
    "${SIX}/src/dsp/wavetable_io.cpp"
    "${SIX}/src/synth/synth.cpp"
    "${SIX}/src/synth/voice.cpp"
    "${SIX}/src/synth/patch.cpp"
    "${SIX}/src/synth/mod_matrix.cpp"
    "${SIX}/src/synth/macro_usage.cpp"
    shim/version_information.cpp
    "${KIT_ROOT}/ports/sst-shim/sst_plugininfra_wasm.cpp"
    "${LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinystr.cpp"
    "${LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinyxml.cpp"
    "${LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinyxmlerror.cpp"
    "${LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinyxmlparser.cpp"
    "${LIBS}/sst/sst-plugininfra/libs/strnatcmp/strnatcmp.cpp"
    "${LIBS}/sst/sst-plugininfra/libs/miniz/miniz.c"
    "${LIBS}/sst/sst-plugininfra/libs/miniz/miniz_tdef.c"
    "${LIBS}/sst/sst-plugininfra/libs/miniz/miniz_tinfl.c"
    "${LIBS}/sst/sst-plugininfra/libs/miniz/miniz_zip.c"
    "${LIBS}/libsamplerate/src/samplerate.c"
    "${LIBS}/libsamplerate/src/src_linear.c"
    "${LIBS}/libsamplerate/src/src_sinc.c"
    "${LIBS}/libsamplerate/src/src_zoh.c"
    "${LIBS}/pffft/pffft.c"
    "${LIBS}/MTS-ESP/Client/libMTSClient.cpp")
target_include_directories(six-sines-engine PUBLIC ${SIX_INCLUDE_DIRECTORIES})
target_compile_definitions(six-sines-engine PUBLIC ${SIX_DEFINITIONS})
target_compile_options(six-sines-engine PUBLIC ${SIX_FLAGS})
target_compile_options(six-sines-engine PRIVATE -Wno-deprecated-declarations)

# libsamplerate's CMake generates a config.h with these
file(GLOB SAMPLERATE_SOURCES "${LIBS}/libsamplerate/src/*.c")
set_source_files_properties(${SAMPLERATE_SOURCES} PROPERTIES COMPILE_DEFINITIONS
    "HAVE_STDBOOL_H=1;PACKAGE=\"libsamplerate\";VERSION=\"0.2.2\";ENABLE_SINC_BEST_CONVERTER=1;ENABLE_SINC_MEDIUM_CONVERTER=1;ENABLE_SINC_FAST_CONVERTER=1")

# ---------------------------------------------------------------------------------------------------------------
# ui.wasm: the editor (unchanged) against a stand-in engine

file(GLOB SIX_UI_SOURCES "${SIX}/src/ui/*.cpp" "${SIX}/src/presets/*.cpp")
file(GLOB_RECURSE JUCEGUI_SOURCES "${LIBS}/sst/sst-jucegui/src/*.cpp")

add_executable(ui
    ui_main.cpp
    ${SIX_UI_SOURCES}
    ${JUCEGUI_SOURCES}
    "${LIBS}/sst/sst-jucegui/src/sst/jucegui/markdown/md4c/md4c.c"
    "${LIBS}/sst/sst-clap-helpers/src/sst/clap_juce_shim/menu_helper.cpp"
    "${GENERATED}/WebFonts.cpp")

target_include_directories(ui PRIVATE
    "${GENERATED}"
    "${LIBS}/sst/sst-jucegui/include"
    "${LIBS}/sst/sst-jucegui/src"
    "${LIBS}/sst/sst-clap-helpers/include")
target_compile_definitions(ui PRIVATE SIXSINES_NO_THREADS=1)
target_compile_options(ui PRIVATE -Wno-deprecated-declarations)
target_link_libraries(ui PRIVATE six-sines-engine juce_wasm_gui_extra six-sines-patches six-sines-themes
    six-sines-fonts sst-jucegui-resources)
target_link_options(ui PRIVATE ${JUCE_WEBCLAP_UI_LINK_OPTIONS})
set_target_properties(ui PROPERTIES
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}/ui")

# ---------------------------------------------------------------------------------------------------------------
# module.wasm: the engine as a CLAP plugin with the webview bridge

add_executable(module
    dsp_main.cpp
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp")
target_link_libraries(module PRIVATE six-sines-engine)
target_link_options(module PRIVATE ${JUCE_WEBCLAP_DSP_LINK_OPTIONS})
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
