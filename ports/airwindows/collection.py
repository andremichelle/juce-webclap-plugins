#!/usr/bin/env python3
"""Airwindows Basics: upstream's registry cut down to one of its collections, for CMake at configure time.

    collection.py <airwin2rack> <collection> <out dir>

Writes into <out dir>:
  ModuleAdd.h          upstream's registrations (src/ModuleAdd.h) of the collection's effects only, their collection
                       tags dropped: with no collections left the editor lists every effect it has
  AirwinRegistry.cpp   a copy of upstream's src/AirwinRegistry.cpp: its #include "ModuleAdd.h" then finds the one
                       above, next to it
  collection.cmake     AW_COLLECTION_SOURCES and AW_COLLECTION_DOCS, the effects' sources and documentation
"""

import pathlib
import re
import sys

aw, collection, out = pathlib.Path(sys.argv[1]), sys.argv[2], pathlib.Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)

# each effect is an #include line and a registerAirwindow line
lines = (aw / "src/ModuleAdd.h").read_text().splitlines()
registration = re.compile(r'^int \w+_unused = AirwinRegistry::registerAirwindow\(\{"([^"]+)".*, \{([^}]*)\}\}\);$')
names, kept = [], []
for include, register in zip(lines[0::2], lines[1::2]):
    match = registration.match(register)
    if not include.startswith('#include "autogen_airwin/') or match is None:
        sys.exit(f"collection.py: unexpected ModuleAdd.h line: {register[:80]}")
    if f'"{collection}"' in match.group(2):
        names.append(match.group(1))
        kept += [include, register[:match.start(2)] + " " + register[match.end(2):]]
if not names:
    sys.exit(f"collection.py: no effect in collection {collection}")

sources = []
for name in names:
    for file in (f"src/autogen_airwin/{name}.cpp", f"src/autogen_airwin/{name}Proc.cpp"):
        if not (aw / file).is_file():
            sys.exit(f"collection.py: missing {file}")
        sources.append(f'"{aw / file}"')
docs = [f'"{aw / "res/awpdoc" / (name + ".txt")}"' for name in names if (aw / "res/awpdoc" / f"{name}.txt").is_file()]


def write(name, text):
    # unchanged files keep their time stamp, so a reconfigure does not rebuild the registry
    path = out / name
    if not path.is_file() or path.read_text() != text:
        path.write_text(text)


write("ModuleAdd.h", "\n".join(kept) + "\n")
write("AirwinRegistry.cpp", (aw / "src/AirwinRegistry.cpp").read_text())
write("collection.cmake", f"# {len(names)} effects of the collection {collection}\n"
      f"set(AW_COLLECTION_SOURCES\n    " + "\n    ".join(sources) + ")\n"
      f"set(AW_COLLECTION_DOCS\n    " + "\n    ".join(docs) + ")\n")
print(f"{collection}: {len(names)} effects")
