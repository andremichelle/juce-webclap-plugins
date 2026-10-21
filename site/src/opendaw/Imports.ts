import {WclapBundles} from "@opendaw/studio-core"

// Bundles imported from disk (Import in the header), each at /imported/<id> under a url of its own. They live in
// memory: a reload forgets them.
export type ImportedBundle = {
    id: string
    fileName: string
    url: string
    ready: Promise<void> // unpacked and registered, rejects if the file is no bundle
}

export namespace Imports {
    const bundles = new Map<string, ImportedBundle>()
    let count = 0

    export const add = (file: File): ImportedBundle => {
        const id = String(++count)
        const url = `imported://${id}/${encodeURIComponent(file.name)}`
        const ready = file.arrayBuffer()
            .then(bytes => WclapBundles.register(url, bytes).catch(() => {
                throw new Error(`${file.name} is no WebCLAP bundle (a .wclap.tar.gz or a bare .wasm)`)
            }))
            .then(bundle => {
                if (WclapBundles.file(bundle, "module.wasm") === undefined) {
                    throw new Error(`${file.name} holds no module.wasm`)
                }
            })
        const imported: ImportedBundle = {id, fileName: file.name, url, ready}
        bundles.set(id, imported)
        return imported
    }

    export const get = (id: string): ImportedBundle | undefined => bundles.get(id)
}
