// sst-plugininfra for the browser: fixed paths in Emscripten's in-memory filesystem, no platform probing.
//
//   /factory   factory patches and themes, packaged with the module (--preload-file)
//   /user      the user's document folder (settings, saved patches). In memory only for now.

#include "filesystem/import.h"
#include "sst/plugininfra/cpufeatures.h"
#include "sst/plugininfra/misc_platform.h"
#include "sst/plugininfra/paths.h"

#include <cerrno>
#include <cstring>

namespace sst::plugininfra
{
namespace paths
{
std::string CMAKE_INSTALL_PREFIX{"/"};

fs::path homePath() { return fs::path{"/user"}; }

fs::path sharedLibraryBinaryPath() { return fs::path{"/ui.wasm"}; }

fs::path bestDocumentsVendorFolderPathFor(const std::string &, const std::string &)
{
    return fs::path{"/user"};
}

fs::path bestLibrarySharedVendorFolderPathFor(const std::string &, const std::string &, bool userLevel)
{
    // A "local" factory folder would win over the system one, so only the system one exists.
    return userLevel ? fs::path{"/factory-local"} : fs::path{"/factory"};
}
} // namespace paths

namespace misc_platform
{
bool isDarkMode() { return true; }
void allocateConsole() {}
std::string toOSCase(const std::string &text) { return text; }
std::string stackTraceToString(int) { return {}; }
std::string getLastSystemError() { return std::string(strerror(errno)); }
} // namespace misc_platform

namespace cpufeatures
{
std::string brand() { return "WebAssembly"; }
bool isArm() { return false; }
bool isX86() { return false; }
bool hasSSE2() { return false; }
bool hasAVX() { return false; }
FPUStateGuard::FPUStateGuard() : priorS(0) {}
FPUStateGuard::~FPUStateGuard() = default;
} // namespace cpufeatures
} // namespace sst::plugininfra
