# Surge XT as a WebCLAP bundle: module.wasm (DSP, CLAP entry). Configure with emcmake, see
# scripts/build-surge-xt.sh. The bundle lands in web/surge-xt.wclap, next to the test host page.
#
# The engine (surge-common) and SurgeSynthProcessor build without JUCE's GUI modules, without Lua (no LuaJIT for
# wasm), MTS-ESP and OSC (patches/surge-*.patch).

cmake_minimum_required(VERSION 3.20)
project(surge-xt-webclap LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Configure with emcmake (Emscripten toolchain)")
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

get_filename_component(KIT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." ABSOLUTE)
set(EXT "${KIT_ROOT}/external")
set(SURGE "${EXT}/surge")
set(SURGE_LIBS "${SURGE}/libs")
set(BUNDLE "${CMAKE_BINARY_DIR}/web/surge-xt.wclap")
set(SURGE_VERSION "1.4.0")

# Every target (the libraries below too) is built with the kit's wasm flags (SIMD, wasm exceptions)
add_compile_options(-msimd128 -fwasm-exceptions -fno-math-errno -fno-trapping-math
    $<$<COMPILE_LANGUAGE:CXX>:-fno-char8_t>)

# ---------------------------------------------------------------------------------------------------------------
# JUCE with the wasm platform layer

set(JUCE_WEBCLAP_PLUGIN_DEFINITIONS
    JucePlugin_Name="Surge XT"
    JucePlugin_Desc="Surge XT"
    JucePlugin_Manufacturer="Surge Synth Team"
    JucePlugin_VersionString="${SURGE_VERSION}"
    JucePlugin_IsSynth=1
    JucePlugin_WantsMidiInput=1
    JucePlugin_ProducesMidiOutput=1
    JucePlugin_IsMidiEffect=0
    JucePlugin_EditorRequiresKeyboardFocus=1)
include("${KIT_ROOT}/modules/juce_webclap/juce_webclap.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Generated sources: version, the embedded shared resources (CMakeRC), the Lua preludes

set(GENERATED "${CMAKE_CURRENT_BINARY_DIR}/generated")

set(SURGE_BUILD_IS_RELEASE true)
set(SURGE_BUILD_HASH "4f425b0")
set(GIT_COMMIT_HASH "4f425b0")
set(GIT_BRANCH "main")
set(SURGE_FULL_VERSION "${SURGE_VERSION}.webclap")
set(SURGE_MAJOR_VERSION 1)
set(SURGE_SUB_VERSION 4)
set(SURGE_RELEASE_VERSION 0)
set(SURGE_RELEASE_NUMBER 0)
set(SURGE_BUILD_FQDN "webclap")
set(SURGE_BUILD_ARCH "wasm32")
set(SURGE_BUILD_LOCATION "Local")
string(TIMESTAMP SURGE_BUILD_DATE "%Y-%m-%d")
string(TIMESTAMP SURGE_BUILD_TIME "%H:%M:%S")
string(TIMESTAMP SURGE_BUILD_YEAR "%Y")
set(CMAKE_INSTALL_PREFIX "/")
configure_file("${SURGE}/src/common/version.cpp.in" "${GENERATED}/version.cpp")

include("${SURGE}/src/cmake/CmakeRC.cmake")
cmrc_add_resource_library(surge-common-binary
    ALIAS surge::common-binary
    NAMESPACE surge_common_binary
    WHENCE "${SURGE}/resources/surge-shared"
    "${SURGE}/resources/surge-shared/configuration.xml"
    "${SURGE}/resources/surge-shared/memoryWavetable.wt"
    "${SURGE}/resources/surge-shared/oscspecification.html"
    "${SURGE}/resources/surge-shared/paramdocumentation.xml"
    "${SURGE}/resources/surge-shared/README_UserArea.txt"
    "${SURGE}/resources/surge-shared/windows.wt")

set(LUA_PRELUDES formula_prelude.lua formula_prelude_test.lua wtse_prelude.lua)
add_custom_command(
    OUTPUT "${GENERATED}/LuaSources.cpp" "${GENERATED}/include/lua/LuaSources.h"
    COMMAND ${CMAKE_COMMAND} -P lua2cpp.cmake "${GENERATED}" LuaSources.cpp lua/LuaSources.h Surge::LuaSources
        ${LUA_PRELUDES}
    WORKING_DIRECTORY "${SURGE}/src/lua"
    DEPENDS "${SURGE}/src/lua/lua2cpp.cmake")

# ---------------------------------------------------------------------------------------------------------------
# Third-party libraries, as Surge's libs/ builds them

set(SST_INCLUDE_DIRECTORIES
    "${SURGE_LIBS}/sst/sst-cpputils/include"
    "${SURGE_LIBS}/sst/sst-basic-blocks/include"
    "${SURGE_LIBS}/sst/sst-filters/include"
    "${SURGE_LIBS}/sst/sst-filters/include-extras"
    "${SURGE_LIBS}/sst/sst-waveshapers/include"
    "${SURGE_LIBS}/sst/sst-effects/include"
    "${SURGE_LIBS}/sst/sst-plugininfra/include"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/include"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/strnatcmp"
    "${KIT_ROOT}/ports/sst-shim" # filesystem/import.h: ghc::filesystem
    "${EXT}/ghc-filesystem/include"
    "${EXT}/simde")

add_subdirectory("${SURGE_LIBS}/airwindows" airwindows EXCLUDE_FROM_ALL)
add_subdirectory("${SURGE_LIBS}/eurorack" eurorack EXCLUDE_FROM_ALL)
target_compile_options(airwindows PRIVATE -w)
target_compile_options(eurorack PRIVATE -w)

add_library(binn STATIC "${SURGE_LIBS}/binn/binn.c")
target_include_directories(binn PUBLIC "${SURGE_LIBS}/binn/include" PRIVATE "${SURGE_LIBS}/binn/include/binn")

add_library(sqlite STATIC "${SURGE_LIBS}/sqlite-3.23.3/sqlite3.c")
target_include_directories(sqlite PUBLIC "${SURGE_LIBS}/sqlite-3.23.3")
target_compile_definitions(sqlite PRIVATE SQLITE_THREADSAFE=0 SQLITE_OMIT_LOAD_EXTENSION=1)
target_compile_options(sqlite PRIVATE -w)

file(GLOB ZSTD_SOURCES "${SURGE_LIBS}/zstd/lib/common/*.c" "${SURGE_LIBS}/zstd/lib/compress/*.c"
    "${SURGE_LIBS}/zstd/lib/decompress/*.c")
add_library(zstd STATIC ${ZSTD_SOURCES})
target_include_directories(zstd PUBLIC "${SURGE_LIBS}/zstd/lib")
target_compile_definitions(zstd PRIVATE ZSTD_DISABLE_ASM=1 ZSTD_MULTITHREAD=0)
target_compile_options(zstd PRIVATE -w)

add_library(pffft STATIC "${SURGE_LIBS}/pffft/pffft.c" "${SURGE_LIBS}/pffft/fft_convolve.cpp")
target_include_directories(pffft PUBLIC "${SURGE_LIBS}/pffft")
target_compile_options(pffft PRIVATE -w)

add_library(surge-support STATIC
    "${KIT_ROOT}/ports/sst-shim/sst_plugininfra_wasm.cpp"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/strnatcmp/strnatcmp.cpp"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinystr.cpp"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinyxml.cpp"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinyxmlerror.cpp"
    "${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/src/tinyxmlparser.cpp"
    "${SURGE_LIBS}/r8brain-free-src/r8bbase.cpp"
    "${SURGE_LIBS}/fmt/src/format.cc"
    "${GENERATED}/LuaSources.cpp")
target_include_directories(surge-support PUBLIC ${SST_INCLUDE_DIRECTORIES} "${GENERATED}/include"
    "${SURGE_LIBS}/fmt/include")
target_include_directories(surge-support PRIVATE "${SURGE_LIBS}/sst/sst-plugininfra/libs/tinyxml/include/tinyxml")
target_compile_definitions(surge-support PUBLIC TIXML_USE_STL=1)
target_compile_options(surge-support PRIVATE -w)

# ---------------------------------------------------------------------------------------------------------------
# surge-common: the engine, its source list as upstream builds it

file(READ "${SURGE}/src/common/CMakeLists.txt" SURGE_COMMON_CMAKE)
string(REGEX MATCH "add_library\\(\\\${PROJECT_NAME}[^)]*\\)" SURGE_COMMON_BLOCK "${SURGE_COMMON_CMAKE}")
string(REGEX MATCHALL "[A-Za-z0-9_/]+\\.cpp" SURGE_COMMON_FILES "${SURGE_COMMON_BLOCK}")
set(SURGE_COMMON_SOURCES "${GENERATED}/version.cpp")
list(REMOVE_ITEM SURGE_COMMON_FILES version.cpp) # version.cpp.in, configured above
foreach(f IN LISTS SURGE_COMMON_FILES)
    list(APPEND SURGE_COMMON_SOURCES "${SURGE}/src/common/${f}")
endforeach()

set(SURGE_DEFINITIONS
    LINUX=1 # the desktop paths take the Linux branches, see the sst shim for where they point
    SURGE_COMPILE_BLOCK_SIZE=32
    SURGE_SKIP_ODDSOUND_MTS=1
    SURGE_WEBCLAP=1
    HAS_LUA=0
    SST_SIMD_OMIT_NATIVE_ALIASES=1
    EURORACK_CLOUDS_IS_CLOUDS=1
    SST_EFFECTS_EURORACK=1
    SURGE_XT_1X_WST=1
    JUCE_STRICT_REFCOUNTEDPOINTER=1)

set(SURGE_COMMON_INCLUDE_DIRECTORIES
    "${SURGE}/src/common"
    "${SURGE}/src/common/dsp"
    "${SURGE}/src/common/dsp/effects"
    "${SURGE}/src/common/dsp/filters"
    "${SURGE}/src/common/dsp/modulators"
    "${SURGE}/src/common/dsp/oscillators"
    "${SURGE}/src/common/dsp/utilities"
    "${SURGE}/src/common/dsp/vembertech"
    "${SURGE}/src/platform"
    "${SURGE_LIBS}/tuning-library/include"
    "${SURGE_LIBS}/PEGTL/include"
    "${SURGE_LIBS}/r8brain-free-src")

add_library(surge-common STATIC ${SURGE_COMMON_SOURCES})
target_include_directories(surge-common PUBLIC ${SURGE_COMMON_INCLUDE_DIRECTORIES})
target_compile_definitions(surge-common PUBLIC ${SURGE_DEFINITIONS})
target_compile_options(surge-common PRIVATE -Wno-deprecated-declarations -Wno-multichar)
target_link_libraries(surge-common PUBLIC surge-support airwindows eurorack binn sqlite zstd pffft
    surge::common-binary)

# ---------------------------------------------------------------------------------------------------------------
# module.wasm: SurgeSynthProcessor as a CLAP plugin, without its editor (SURGE_HEADLESS). It links JUCE with GUI
# modules as the processor's headers include juce_audio_processors (PluginHostType, Colour) and juce_audio_formats
# (it reads audio files into wavetables); the linker keeps what it uses.

add_executable(module
    dsp_main.cpp
    "${SURGE}/src/surge-xt/SurgeSynthProcessor.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_clap.cpp"
    "${KIT_ROOT}/modules/juce_webclap/juce_webclap_standalone.cpp")

target_include_directories(module PRIVATE "${SURGE}/src/surge-xt" "${EXT}/clap/include")
target_compile_definitions(module PRIVATE SURGE_HEADLESS=1)
target_compile_options(module PRIVATE -Wno-deprecated-declarations)
target_link_libraries(module PRIVATE surge-common juce_wasm_audio_formats)
target_link_options(module PRIVATE ${JUCE_WEBCLAP_DSP_LINK_OPTIONS})
set_target_properties(module PROPERTIES
    SUFFIX ".wasm"
    RUNTIME_OUTPUT_DIRECTORY "${BUNDLE}")
