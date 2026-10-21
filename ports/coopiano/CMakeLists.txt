# coopiano as a WebCLAP bundle: module.wasm (the piano as a CLAP instrument) and ui/index.html (its editor, copied by
# the build script). Plain CLAP, no JUCE.
# Configure with emcmake, see scripts/build-coopiano.sh. The bundle lands in web/coopiano.wclap, next to the test
# host page.

cmake_minimum_required(VERSION 3.20)
project(coopiano-webclap LANGUAGES CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/coopiano.wclap")

# Upstream has no releases yet: the date of the pinned commit
set(COOPIANO_VERSION "0.2026.1014")

# The flags and link options of the kit's DSP modules (modules/juce_webclap/juce_webclap.cmake), without JUCE: a
# standalone wasm module exporting clap_entry, malloc and the function table, importing only WASI
set(WEBCLAP_FLAGS -msimd128 -fwasm-exceptions)

add_executable(module
    coopiano_clap.cpp
    "${KIT_ROOT}/modules/webclap/wasi_shim.cpp")

target_include_directories(module PRIVATE "${EXT}/coopiano" "${EXT}/clap/include")
target_compile_definitions(module PRIVATE COOPIANO_VERSION="${COOPIANO_VERSION}")
target_compile_options(module PRIVATE ${WEBCLAP_FLAGS} -O3)
target_link_options(module PRIVATE
    ${WEBCLAP_FLAGS}
    -O3
    -sSTANDALONE_WASM=1
    --no-entry
    -sEXPORTED_FUNCTIONS=_malloc,_free
    -Wl,--export=clap_entry
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=32MB
    -sSTACK_SIZE=1MB
    -sALLOW_TABLE_GROWTH=1
    -sERROR_ON_UNDEFINED_SYMBOLS=1)
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
