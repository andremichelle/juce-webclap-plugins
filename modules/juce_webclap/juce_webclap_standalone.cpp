/*
    juce_webclap: keeps module.wasm free of Emscripten "env" imports.

    WebCLAP hosts give a module WASI and nothing else (openDAW skips "env" functions), but a standalone Emscripten
    build still imports a few functions from "env" that its JS runtime would provide: the memory growth hook and
    the file syscalls WASI has no equivalent for. Defining them here makes the linker use these instead.

    A DSP module has no files of its own (the host serves the bundle to the page), so they fail with ENOSYS,
    the same as the WASI calls a host does not implement.

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

int __syscall_faccessat (int, intptr_t, int, int)               { return -ENOSYS; }
int __syscall_getdents64 (int, intptr_t, size_t)                { return -ENOSYS; }
int __syscall_readlinkat (int, intptr_t, intptr_t, size_t)      { return -ENOSYS; }
int __syscall_unlinkat (int, intptr_t, int)                     { return -ENOSYS; }
int __syscall_rmdir (intptr_t)                                  { return -ENOSYS; }
int __syscall_renameat (int, intptr_t, int, intptr_t)           { return -ENOSYS; }
}
