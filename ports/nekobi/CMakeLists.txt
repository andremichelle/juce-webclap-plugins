# Nekobi as a WebCLAP bundle (module.wasm only, see ports/dpf/dpf.cmake). Configure with emcmake, see
# scripts/build-nekobi.sh.

cmake_minimum_required(VERSION 3.20)
project(nekobi-webclap LANGUAGES C CXX)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(PORT_ID nekobi)
set(PLUGIN_DIR "${KIT_ROOT}/external/Nekobi/plugins/Nekobi")
set(PLUGIN_SOURCES "${PLUGIN_DIR}/DistrhoPluginNekobi.cpp")

include("${KIT_ROOT}/ports/dpf/dpf.cmake")
