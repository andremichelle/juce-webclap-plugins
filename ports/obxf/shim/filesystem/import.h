#pragma once
// sst-plugininfra's filesystem/import.h, configured for ghc::filesystem (header-only), as on Linux.
// OB-Xf relies on ghc semantics: path::u8string() returns std::string, std::filesystem's returns u8string.

#ifndef GHC_FILESYSTEM_ENFORCE_CPP17_API
#define GHC_FILESYSTEM_ENFORCE_CPP17_API 1
#endif
#include <ghc/filesystem.hpp>
#include <string>
#include <utility>

namespace fs = ghc::filesystem;

#define SST_PLUGINFRA_GHC_FS 1

inline std::string path_to_string(const fs::path &path) { return path.generic_string(); }

template <typename T> inline fs::path string_to_path(T &&path) { return fs::path(std::forward<T>(path)); }

void string_to_path(fs::path) = delete;
