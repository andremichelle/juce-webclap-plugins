# AyMidi as a WebCLAP bundle (module.wasm only, see ports/dpf/dpf.cmake). Configure with emcmake, see
# scripts/build-aymidi.sh.

cmake_minimum_required(VERSION 3.20)
project(aymidi-webclap LANGUAGES C CXX)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(PORT_ID aymidi)
set(PLUGIN_DIR "${KIT_ROOT}/external/aymidi/src")
set(PLUGIN_SOURCES
    "${PLUGIN_DIR}/AyMidiPlugin.cpp"
    "${PLUGIN_DIR}/SynthEngine.cpp"
    "${PLUGIN_DIR}/Channel.cpp"
    "${PLUGIN_DIR}/Note.cpp"
    "${PLUGIN_DIR}/VoiceProcessor.cpp"
    "${PLUGIN_DIR}/SoundGenerator.cpp"
    "${PLUGIN_DIR}/Voice.cpp"
    "${PLUGIN_DIR}/ayumi.c")
set(PLUGIN_CXX_FLAGS "SHELL:-include algorithm")

include("${KIT_ROOT}/ports/dpf/dpf.cmake")
