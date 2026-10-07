#!/usr/bin/env python3
"""Fetch the pinned third-party sources into external/ and apply our patches.

Files are fetched one by one (GitHub tree API + raw.githubusercontent.com) instead of git clones or tarballs:
it only downloads what the build needs and survives flaky connections, since every file is retried on its own.

Usage: scripts/fetch-deps.py [--force]
"""

import io
import json
import os
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request
import concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTERNAL = os.path.join(ROOT, "external")

JUCE_MODULES = ["juce_core", "juce_events", "juce_data_structures", "juce_graphics", "juce_gui_basics",
                "juce_gui_extra", "juce_audio_basics", "juce_audio_processors", "juce_audio_processors_headless",
                "juce_audio_utils", "juce_audio_devices", "juce_audio_formats", "juce_dsp"]
JUCE_SKIP = ["VST3_SDK", "LV2_SDK", "/lilv/", "/serd/", "/sord/", "/sratom/", "/lv2/", "/zix/", "pslextensions",
             "/java/", "javaopt", "oboe", "/flac/", "oggvorbis"]


def juce_filter(path):
    parts = path.split("/")
    if path.startswith("modules/") and len(parts) == 2:
        return True
    return (path.startswith("modules/") and len(parts) > 2 and parts[1] in JUCE_MODULES
            and not any(s in path for s in JUCE_SKIP))


def obxf_filter(path):
    if path.startswith("assets/installer"):
        return "Themes/Default/" in path and "@4x" not in path or "/Patches/" in path
    return path.startswith(("src/", "assets/", "cmake/", "libs/CMakeLists")) or "/" not in path


# (directory, repo, commit, filter). Commits are the submodule pins of OB-Xf main at the time of writing.
DEPS = [
    ("OB-Xf", "surge-synthesizer/OB-Xf", "b08ffb6ab6cfa0f66cb057e855149ab640de0f78", obxf_filter),
    ("JUCE", "juce-framework/JUCE", "a8c7c714c7564b9248749e1e8cefcc5ef2b6f0cc", juce_filter),
    ("sst-cpputils", "surge-synthesizer/sst-cpputils", "ca88c2e02cef7142856bc8cf2ad4f0b298ed406a",
     lambda p: p.startswith("include/")),
    ("sst-basic-blocks", "surge-synthesizer/sst-basic-blocks", "1f1825b083e2c113c63fc5226f1fdd394982ac13",
     lambda p: p.startswith("include/")),
    ("sst-plugininfra", "surge-synthesizer/sst-plugininfra", "f6deb258ca2f99e48d8ddc3e5bdf4f245e15052b",
     lambda p: p.startswith(("include/", "src/", "libs/filesystem/", "libs/strnatcmp/"))),
    ("fmt", "fmtlib/fmt", "407c905e45ad75fc29bf0f9bb7c5c2fd3475976f", lambda p: p.startswith(("include/", "src/"))),
    ("simde", "simd-everywhere/simde", "71fd833d9666141edcd1d3c109a80e228303d8d7", lambda p: p.startswith("simde/")),
    ("ghc-filesystem", "gulrak/filesystem", "614bbe87b80435d87ab8791564370e0c1d13627d",
     lambda p: p == "include/ghc/filesystem.hpp"),
    ("clap", "free-audio/clap", "a47f6badb49d948fd009998f28309cdab78979c9", lambda p: p.startswith("include/")),
    ("MTS-ESP", "oddsound/MTS-ESP", "ce3f30e812744d8319313d80b92781bc3bcf4e18", lambda p: p.startswith("Client/")),
]

FONT_PACKAGE = "https://registry.npmjs.org/dejavu-fonts-ttf/-/dejavu-fonts-ttf-2.37.3.tgz"
FONT_FILES = ["package/ttf/DejaVuSans.ttf", "package/ttf/DejaVuSans-Bold.ttf", "package/LICENSE"]


def curl(url, out=None, retries=8):
    for attempt in range(retries):
        args = ["curl", "-sSfL", "--max-time", "300", url]
        if out:
            args += ["-o", out]
        result = subprocess.run(args, capture_output=True)
        if result.returncode == 0:
            return result.stdout
        time.sleep(1 + attempt)
    raise RuntimeError(f"download failed: {url}")


def fetch_repo(directory, repo, commit, keep, force):
    dest = os.path.join(EXTERNAL, directory)
    stamp = os.path.join(dest, ".fetched")
    if not force and os.path.exists(stamp) and open(stamp).read().strip() == commit:
        print(f"{directory}: up to date")
        return
    tree = json.loads(curl(f"https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1"))
    if tree.get("truncated"):
        raise RuntimeError(f"{repo}: tree listing truncated")
    files = [e["path"] for e in tree["tree"] if e["type"] == "blob" and keep(e["path"])]

    def get(path):
        out = os.path.join(dest, path)
        if os.path.exists(out) and os.path.getsize(out) > 0 and not force:
            return
        os.makedirs(os.path.dirname(out), exist_ok=True)
        curl(f"https://raw.githubusercontent.com/{repo}/{commit}/" + urllib.parse.quote(path), out)

    with cf.ThreadPoolExecutor(16) as pool:
        list(pool.map(get, files))
    open(stamp, "w").write(commit + "\n")
    print(f"{directory}: {len(files)} files")


def fetch_fonts():
    dest = os.path.join(EXTERNAL, "fonts")
    if all(os.path.exists(os.path.join(dest, n)) for n in ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVu-LICENSE")):
        print("fonts: up to date")
        return
    os.makedirs(dest, exist_ok=True)
    data = urllib.request.urlopen(FONT_PACKAGE).read()
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        for name in FONT_FILES:
            target = os.path.join(dest, os.path.basename(name) if not name.endswith("LICENSE") else "DejaVu-LICENSE")
            open(target, "wb").write(tar.extractfile(name).read())
    print("fonts: DejaVu Sans")


def apply_patches():
    juce = os.path.join(EXTERNAL, "JUCE")
    for name in sorted(p for p in os.listdir(os.path.join(ROOT, "patches")) if p.startswith("juce-")):
        path = os.path.join(ROOT, "patches", name)
        dry = lambda *extra: subprocess.run(["patch", "-p1", "-s", "-f", "--dry-run", *extra, "-i", path],
                                            cwd=juce, capture_output=True).returncode == 0
        if dry("-R"):
            print(f"{name}: already applied")
        elif dry():
            subprocess.run(["patch", "-p1", "-s", "-i", path], cwd=juce, check=True)
            print(f"{name}: applied")
        else:
            raise RuntimeError(f"{name} does not apply to external/JUCE (modified by hand?)")


def main():
    force = "--force" in sys.argv
    os.makedirs(EXTERNAL, exist_ok=True)
    for directory, repo, commit, keep in DEPS:
        fetch_repo(directory, repo, commit, keep, force)
    fetch_fonts()
    apply_patches()


if __name__ == "__main__":
    main()
