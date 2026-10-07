#!/usr/bin/env python3
"""Pack a WebCLAP bundle directory into the .wclap.tar.gz hosts import (openDAW: "Import WebCLAP...").

The archive holds one top directory named like the bundle (obxf.wclap/module.wasm, obxf.wclap/ui/...), plain ustar
entries only (no pax headers, no macOS ._ files), sorted, with fixed times and owners, so the same bundle always
gives the same bytes and hosts that address bundles by their hash see the same plugin.

Usage: scripts/pack-wclap.py <bundle dir> [output]     (default output: <bundle dir>.tar.gz)
"""

import gzip
import io
import os
import sys
import tarfile


def pack(bundle, output):
    root = os.path.basename(os.path.normpath(bundle))
    paths = []
    for directory, dirs, files in os.walk(bundle):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            if not name.startswith("."):
                paths.append(os.path.join(directory, name))
    if not any(os.path.basename(p) == "module.wasm" for p in paths):
        raise SystemExit(f"{bundle}: no module.wasm")

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for path in paths:
            info = tarfile.TarInfo(root + "/" + os.path.relpath(path, bundle).replace(os.sep, "/"))
            info.size = os.path.getsize(path)
            info.mode = 0o644
            info.mtime = 0
            info.uname = info.gname = ""
            with open(path, "rb") as f:
                tar.addfile(info, f)

    with open(output, "wb") as out, gzip.GzipFile(filename="", mode="wb", fileobj=out, compresslevel=9, mtime=0) as gz:
        gz.write(buffer.getvalue())
    print(f"{output}: {len(paths)} files, {os.path.getsize(output) / 1048576:.1f} MB")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    bundle = sys.argv[1]
    pack(bundle, sys.argv[2] if len(sys.argv) > 2 else os.path.normpath(bundle) + ".tar.gz")
