import workersUrl from "@opendaw/studio-core/workers-main.js?worker&url"
import workletsUrl from "@opendaw/studio-core/processors.js?url"
import wasmProcessorUrl from "@opendaw/studio-core-wasm/wasm-processor.js?url"
import wasmOfflineWorkerUrl from "@opendaw/studio-core-wasm/wasm-offline-worker.js?worker&url"
import {panic, Procedure, UUID} from "@opendaw/lib-std"
import {SoundfontMetaData} from "@opendaw/studio-adapters"
import {
    AudioWorklets,
    GlobalSampleLoaderManager,
    GlobalSoundfontLoaderManager,
    SoundfontProvider,
    Workers
} from "@opendaw/studio-core"
import {WasmEngine} from "@opendaw/studio-core-wasm"
import {LocalSamples} from "@/opendaw/LocalSamples"

// What lives for the whole site: one context, one engine, one sample cache. Each plugin page runs its own
// project on it.
export type Env = {
    audioContext: AudioContext
    audioWorklets: AudioWorklets
    sampleManager: GlobalSampleLoaderManager
    soundfontManager: GlobalSoundfontLoaderManager
}

const NoSoundfonts: SoundfontProvider = {
    fetch: async (uuid: UUID.Bytes): Promise<[ArrayBuffer, SoundfontMetaData]> =>
        panic(`No soundfonts here (${UUID.toString(uuid)})`)
}

let env: Promise<Env> | null = null

export const boot = (progress: Procedure<string>): Promise<Env> => env ??= setup(progress)

const setup = async (progress: Procedure<string>): Promise<Env> => {
    progress("Installing workers")
    await Workers.install(workersUrl)
    AudioWorklets.install(workletsUrl)
    const audioContext = new AudioContext({sampleRate: 48000, latencyHint: 0})
    const audioWorklets = await AudioWorklets.createFor(audioContext)
    progress("Loading the openDAW engine")
    WasmEngine.install({
        processorUrl: wasmProcessorUrl,
        offlineWorkerUrl: wasmOfflineWorkerUrl,
        wasmUrl: `${import.meta.env.BASE_URL}wasm-engine`
    })
    if (!await WasmEngine.ensureReady(audioContext)) {
        return panic("Could not load the openDAW engine")
    }
    return {
        audioContext,
        audioWorklets,
        sampleManager: new GlobalSampleLoaderManager(LocalSamples),
        soundfontManager: new GlobalSoundfontLoaderManager(NoSoundfonts)
    }
}
