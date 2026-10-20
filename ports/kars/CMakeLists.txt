# Kars as a WebCLAP bundle (module.wasm only, see ports/dpf/dpf.cmake). Configure with emcmake, see
# scripts/build-kars.sh.

cmake_minimum_required(VERSION 3.20)
project(kars-webclap LANGUAGES C CXX)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(PORT_ID kars)
set(PLUGIN_DIR "${KIT_ROOT}/external/Kars/plugins/Kars")
set(PLUGIN_SOURCES "${PLUGIN_DIR}/DistrhoPluginKars.cpp")

include("${KIT_ROOT}/ports/dpf/dpf.cmake")
