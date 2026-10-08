# Sourced by the build scripts: puts a port's license into its bundle.
#
#   bundle_license <bundle dir> <NOTICES.md.in> [<source file> <licenses/ name>]...
#
# LICENSE is the AGPL-3.0 (every bundle contains JUCE, used under the AGPL), NOTICES.md is the port's template with
# @SOURCE_URL@ replaced by the repository commit the bundle is built from, the source the GPL/AGPL asks for. The
# pairs after the template are copied into licenses/.

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
    sed "s|@SOURCE_URL@|$source_url|" "$template" > "$bundle/NOTICES.md"
}
