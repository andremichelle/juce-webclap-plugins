# MiMi-d as a WebCLAP bundle (module.wasm only, see ports/dpf/dpf.cmake). Configure with emcmake, see
# scripts/build-mimid.sh.

cmake_minimum_required(VERSION 3.20)
project(mimid-webclap LANGUAGES C CXX)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(PORT_ID mimid)
set(PLUGIN_DIR "${KIT_ROOT}/external/audio-plugins/plugins/mimid")
set(PLUGIN_SOURCES
    "${PLUGIN_DIR}/MiMi-d.cpp")

include("${KIT_ROOT}/ports/dpf/dpf.cmake")
