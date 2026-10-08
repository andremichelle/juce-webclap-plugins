# Sourced by the build scripts: puts a port's license into its bundle.
#
#   bundle_license <bundle dir> <NOTICES.md.in> [<source file> <licenses/ name>]...
#
# LICENSE is the AGPL-3.0 (every bundle contains JUCE, used under the AGPL), NOTICES.md is the port's template with
# @SOURCE_URL@ replaced by the repository commit the bundle is built from, the source the GPL/AGPL asks for, and
# @JUCE_BUNDLED@ by licenses/juce-bundled.md. The pairs after the template are copied into licenses/.

# The licenses of what JUCE bundles, for ports to pass to bundle_license: zlib (juce_core), libpng, libjpeg, HarfBuzz
# and SheenBidi (juce_graphics, every editor), FLAC (juce_audio_formats).
JUCE_MODULES_DIR="$ROOT/external/JUCE/modules"
JUCE_CORE_LICENSES=("$JUCE_MODULES_DIR/juce_core/zip/zlib/LICENSE" JUCE-zlib.txt)
JUCE_GRAPHICS_LICENSES=(
    "$JUCE_MODULES_DIR/juce_graphics/image_formats/pnglib/LICENSE" JUCE-libpng.txt
    "$JUCE_MODULES_DIR/juce_graphics/image_formats/jpglib/README" JUCE-libjpeg.txt
    "$JUCE_MODULES_DIR/juce_graphics/fonts/harfbuzz/COPYING" JUCE-HarfBuzz.txt
    "$JUCE_MODULES_DIR/juce_graphics/unicode/sheenbidi/LICENSE" JUCE-SheenBidi-Apache-2.0.txt)
JUCE_FLAC_LICENSES=("$JUCE_MODULES_DIR/juce_audio_formats/codecs/flac/Flac Licence.txt" JUCE-FLAC.txt)

bundle_license() {
    local bundle="$1" template="$2"
    shift 2

    local remote source_url
    remote="$(git -C "$ROOT" remote get-url origin | sed -e 's|^git@github.com:|https://github.com/|' -e 's|\.git$||')"
    source_url="$remote/tree/$(git -C "$ROOT" rev-parse HEAD)"
    if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
        source_url="$source_url (plus uncommitted changes: not a release build)"
    fi

    rm -rf "$bundle/licenses"
    mkdir -p "$bundle/licenses"
    cp "$ROOT/licenses/AGPL-3.0.txt" "$bundle/LICENSE"
    while [ $# -ge 2 ]; do
        cp "$1" "$bundle/licenses/$2"
        shift 2
    done
    sed -e "s|@SOURCE_URL@|$source_url|" -e "/@JUCE_BUNDLED@/{
r $ROOT/licenses/juce-bundled.md
d
}" "$template" > "$bundle/NOTICES.md"
}
