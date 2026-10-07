/*
    juce_webclap: juce_core natives for wasm that JUCE's wasm target does not provide.

    Files live in Emscripten's in-memory filesystem. There are no threads: Thread::startThread fails,
    and code that needs a background thread has to be driven from the frame callback instead.

    Included at the end of juce_core_wasm.cpp, inside the juce_core translation unit.
*/

#include <cwchar>
#include <ctime>
#include <dirent.h>
#include <fnmatch.h>
#include <sys/stat.h>

namespace juce
{

File File::getSpecialLocation (const SpecialLocationType type)
{
    switch (type)
    {
        case userHomeDirectory:
        case userDocumentsDirectory:
        case userMusicDirectory:
        case userMoviesDirectory:
        case userPicturesDirectory:
        case userDesktopDirectory:
        case userApplicationDataDirectory:
            return File ("/user");

        case commonDocumentsDirectory:
        case commonApplicationDataDirectory:
        case globalApplicationsDirectory:
            return File ("/factory");

        case tempDirectory:
            return File ("/tmp");

        case currentExecutableFile:
        case currentApplicationFile:
        case invokedExecutableFile:
        case hostApplicationPath:
            return File ("/ui.wasm");

        default:
            return {};
    }
}

bool File::copyInternal (const File& dest) const
{
    FileInputStream in (*this);

    if (! dest.deleteFile())
        return false;

    {
        FileOutputStream out (dest);

        if (! out.failedToOpen() && out.writeFromInputStream (in, -1) == getSize())
            return true;
    }

    dest.deleteFile();
    return false;
}

void File::findFileSystemRoots (Array<File>& destArray)    { destArray.add (File ("/")); }
bool File::isHidden() const                                 { return getFileName().startsWithChar ('.'); }
bool File::isSymbolicLink() const                           { return getNativeLinkedTarget().isNotEmpty(); }

String File::getNativeLinkedTarget() const
{
    char buffer[4096];
    const auto numBytes = (int) readlink (getFullPathName().toRawUTF8(), buffer, sizeof (buffer) - 1);
    return String::fromUTF8 (buffer, jmax (0, numBytes));
}

//==============================================================================
class DirectoryIterator::NativeIterator::Pimpl
{
public:
    Pimpl (const File& directory, const String& wc)
        : parentDir (File::addTrailingSeparator (directory.getFullPathName())),
          wildCard (wc),
          dir (opendir (directory.getFullPathName().toRawUTF8()))
    {
    }

    ~Pimpl()
    {
        if (dir != nullptr)
            closedir (dir);
    }

    bool next (String& filenameFound, bool* isDir, bool* isHidden, int64* fileSize,
               Time* modTime, Time* creationTime, bool* isReadOnly)
    {
        if (dir == nullptr)
            return false;

        while (auto* entry = readdir (dir))
        {
            if (fnmatch (wildCard.toRawUTF8(), entry->d_name, 0) != 0)
                continue;

            filenameFound = String::fromUTF8 (entry->d_name);

            struct stat info {};
            const auto ok = stat ((parentDir + filenameFound).toRawUTF8(), &info) == 0;

            if (isDir != nullptr)        *isDir = ok && S_ISDIR (info.st_mode);
            if (isHidden != nullptr)     *isHidden = filenameFound.startsWithChar ('.');
            if (fileSize != nullptr)     *fileSize = ok ? (int64) info.st_size : 0;
            if (modTime != nullptr)      *modTime = Time (ok ? (int64) info.st_mtime * 1000 : 0);
            if (creationTime != nullptr) *creationTime = Time (ok ? (int64) info.st_ctime * 1000 : 0);
            if (isReadOnly != nullptr)   *isReadOnly = ok && (info.st_mode & S_IWUSR) == 0;

            return true;
        }

        return false;
    }

private:
    String parentDir, wildCard;
    DIR* dir;

    JUCE_DECLARE_NON_COPYABLE (Pimpl)
};

DirectoryIterator::NativeIterator::NativeIterator (const File& directory, const String& wildCardStr)
    : pimpl (new Pimpl (directory, wildCardStr))
{
}

DirectoryIterator::NativeIterator::~NativeIterator() {}

bool DirectoryIterator::NativeIterator::next (String& filenameFound, bool* isDir, bool* isHidden, int64* fileSize,
                                              Time* modTime, Time* creationTime, bool* isReadOnly)
{
    return pimpl->next (filenameFound, isDir, isHidden, fileSize, modTime, creationTime, isReadOnly);
}

//==============================================================================
bool File::isOnCDRomDrive() const       { return false; }
bool File::isOnHardDisk() const         { return true; }
bool File::isOnRemovableDrive() const   { return false; }
String File::getVersion() const         { return {}; }
bool File::moveToTrash() const          { return deleteRecursively(); }
void File::revealToUser() const         {}

bool JUCE_CALLTYPE Process::openDocument (const String&, const String&) { return false; }

// No threads: report failure, so Thread::startThread returns false and nothing waits on a thread that never runs.
bool Thread::createNativeThread (Priority)  { return false; }
void Thread::killThread()                   {}

} // namespace juce

// Emscripten's libc has no wcsftime. JUCE's Time::formatted uses it, so format narrow and widen.
extern "C" size_t wcsftime (wchar_t* out, size_t maxSize, const wchar_t* format, const struct tm* time)
{
    if (maxSize == 0)
        return 0;

    const auto narrowFormat = juce::String (juce::CharPointer_UTF32 (reinterpret_cast<const juce::juce_wchar*> (format))).toStdString();
    std::vector<char> buffer (maxSize * 4 + 1);
    const auto length = std::strftime (buffer.data(), buffer.size(), narrowFormat.c_str(), time);

    const auto wide = juce::String::fromUTF8 (buffer.data(), (int) length);
    const auto* p = wide.toUTF32().getAddress();
    size_t n = 0;

    while (p[n] != 0 && n < maxSize - 1)
    {
        out[n] = (wchar_t) p[n];
        ++n;
    }

    out[n] = 0;
    return p[n] == 0 ? n : 0;
}
