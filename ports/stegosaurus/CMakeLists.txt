# Stegosaurus as a WebCLAP bundle (module.wasm only, see ports/dpf/dpf.cmake). Configure with emcmake, see
# scripts/build-stegosaurus.sh.

cmake_minimum_required(VERSION 3.20)
project(stegosaurus-webclap LANGUAGES C CXX)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(PORT_ID stegosaurus)
set(PLUGIN_DIR "${KIT_ROOT}/external/stegosaurus/plugins/stegosaurus")
set(PLUGIN_SOURCES
    "${PLUGIN_DIR}/stegosaurus.cpp"
    "${PLUGIN_DIR}/nix-echo.cpp"
    "${PLUGIN_DIR}/voice.cpp"
    "${PLUGIN_DIR}/oscillator.cpp"
    "${PLUGIN_DIR}/fastmaths.cpp"
    "${PLUGIN_DIR}/eq.cpp")

# Stegosaurus predates DPF's CLAP support: its DistrhoPluginInfo.h has no DISTRHO_PLUGIN_CLAP_ID
set(PLUGIN_CLAP_ID "com.github.thunderox.stegosaurus")

include("${KIT_ROOT}/ports/dpf/dpf.cmake")
