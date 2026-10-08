/*
    juce_webclap: keeps module.wasm free of Emscripten "env" imports.

    WebCLAP hosts give a module WASI and nothing else (openDAW skips "env" functions), but a standalone Emscripten
    build still imports a few functions from "env" that its JS runtime would provide: the memory growth hook and
    the file syscalls WASI has no equivalent for. Defining them here makes the linker use these instead.

    A DSP module has no files of its own (the host serves the bundle to the page). It looks like an empty,
    read-only filesystem: lookups fail with ENOENT, changes with EROFS. Emscripten's own stubs for stat, open
    and mkdir answer ENOSYS, which libraries treat as a hard error (ghc::filesystem::exists throws) where a
    missing file is an ordinary case (no settings saved yet).

    Emscripten's standalone getentropy() aborts (its weak default), which kills std::random_device. It is
    replaced with WASI random_get.
*/

#include <cerrno>
#include <cstddef>
#include <cstdint>
#include <cstring>

#include <wasi/api.h>

extern "C"
{
void emscripten_notify_memory_growth (size_t) {}

int getentropy (void* buffer, size_t length)
{
    if (length > 256)
    {
        errno = EIO;
        return -1;
    }

    if (__wasi_random_get (static_cast<uint8_t*> (buffer), length) != 0)
    {
        errno = EIO;
        return -1;
    }

    return 0;
}

int __syscall_getcwd (intptr_t buffer, size_t size)
{
    if (size < 2)
        return -ERANGE;

    std::memcpy (reinterpret_cast<char*> (buffer), "/", 2);
    return 2;
}

int __syscall_faccessat (int, intptr_t, int, int)               { return -ENOENT; }
int __syscall_stat64 (intptr_t, intptr_t)                       { return -ENOENT; }
int __syscall_lstat64 (intptr_t, intptr_t)                      { return -ENOENT; }
int __syscall_newfstatat (int, intptr_t, intptr_t, int)         { return -ENOENT; }
int __syscall_openat (int, intptr_t, int, ...)                  { return -ENOENT; }
int __syscall_getdents64 (int, intptr_t, size_t)                { return -ENOENT; }
int __syscall_readlinkat (int, intptr_t, intptr_t, size_t)      { return -ENOENT; }
int __syscall_mkdirat (int, intptr_t, int)                      { return -EROFS; }
int __syscall_unlinkat (int, intptr_t, int)                     { return -EROFS; }
int __syscall_rmdir (intptr_t)                                  { return -EROFS; }
int __syscall_renameat (int, intptr_t, int, intptr_t)           { return -EROFS; }
}
