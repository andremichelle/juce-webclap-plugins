# RaffoSynth as a WebCLAP bundle (module.wasm only, see ports/dpf/dpf.cmake). Configure with emcmake, see
# scripts/build-raffosynth.sh.

cmake_minimum_required(VERSION 3.20)
project(raffosynth-webclap LANGUAGES C CXX)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(PORT_ID raffosynth)
set(PLUGIN_DIR "${KIT_ROOT}/external/RaffoSynth-XT/plugin")
set(PLUGIN_SOURCES
    "${PLUGIN_DIR}/raffo_plugin.cpp"
    "${PLUGIN_DIR}/raffo.cpp"
    "${PLUGIN_DIR}/params.cpp"
    "${PLUGIN_DIR}/equalizer_v2.c"
    "${KIT_ROOT}/external/RaffoSynth-XT/src/oscillators.c")
set(PLUGIN_INCLUDES "${KIT_ROOT}/external/RaffoSynth-XT/src")

include("${KIT_ROOT}/ports/dpf/dpf.cmake")
