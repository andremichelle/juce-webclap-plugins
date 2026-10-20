import {asInstanceOf, isDefined, Nullable, Observer, Procedure, Subscription, Terminable, Terminator, UUID} from "@opendaw/lib-std"
import {network} from "@opendaw/lib-runtime"
import {AudioData} from "@opendaw/lib-dsp"
import {
    AutomatableParameterFieldAdapter,
    BpmDetector,
    InstrumentFactories,
    NoteSignal,
    WclapDeviceBoxAdapter,
    WclapInstrumentBoxAdapter,
    WclapStatus
} from "@opendaw/studio-adapters"
import {AudioFileBox, AudioRegionBox, AudioUnitBox, TrackBox, WclapDeviceBox, WclapInstrumentBox} from "@opendaw/studio-boxes"
import {
    AudioContentFactory,
    CaptureAudio,
    EffectFactories,
    EngineWorklet,
    Project,
    SampleService,
    SoundfontService,
    WclapBundles
} from "@opendaw/studio-core"
import {PluginEntry} from "@/plugins"
import {Env} from "@/opendaw/Boot"
import {LocalSamples} from "@/opendaw/LocalSamples"

// openDAW's hosted bundles want the same credentials the studio sends (see the studio's OpenDAWHeaders)
// (dev goes through the vite proxy: the host allows CORS for the site's own origin only)
const HostedRoot = import.meta.env.DEV ? "/wclaps" : "https://assets.opendaw.studio/wclaps"
const HostedHeaders: RequestInit = {headers: {"Authorization": `Basic ${btoa("openDAW:prototype")}`}}

export type BundleSource = "hosted" | "local"

export type InputKind = "none" | "microphone" | "file" | "tone" | "noise"

// One plugin in its own openDAW project: an instrument on an instrument unit, or an effect on an audio track.
// Notes go to the unit, effect input comes from the track (a looped sample) or the unit's monitored capture.
export class PluginSession implements Terminable {
    // download: the bundle's bytes so far and in all (0 while the host does not say)
    static async create(env: Env, plugin: PluginEntry, source: BundleSource,
                        download: Procedure<{ loaded: number, total: number }>): Promise<PluginSession> {
        const url = source === "hosted" ? `${HostedRoot}/${plugin.uuid}.wclap` : `/bundles/${plugin.id}.wclap.tar.gz`
        const response = await fetch(url, source === "hosted" ? HostedHeaders : undefined)
        if (!response.ok) {throw new Error(`${url}: ${response.status} ${await response.text()}`.trim())}
        const total = Number(response.headers.get("Content-Length") ?? 0)
        download({loaded: 0, total})
        const bytes = await network.progress(fraction => download({loaded: fraction * total, total}))(response).arrayBuffer()
        // The engine asks for the bundle by its url; registered, it needs no credentials of its own
        await WclapBundles.register(url, bytes)
        const {audioContext, audioWorklets, sampleManager, soundfontManager} = env
        const project = Project.new({
            audioContext, audioWorklets, sampleManager, soundfontManager,
            sampleService: new SampleService(audioContext, BpmDetector.Unknown),
            soundfontService: new SoundfontService()
        })
        const created = project.editing.modify(() => {
            if (plugin.kind === "instrument") {
                const {audioUnitBox, instrumentBox, trackBox} = project.api.createInstrument(InstrumentFactories.Wclap)
                instrumentBox.url.setValue(url)
                instrumentBox.clapId.setValue(plugin.clapId)
                return {audioUnitBox, trackBox, device: instrumentBox as WclapInstrumentBox | WclapDeviceBox}
            }
            const {audioUnitBox, trackBox} = project.api.createInstrument(InstrumentFactories.Tape)
            const device = asInstanceOf(project.api.insertEffect(audioUnitBox.audioEffects, EffectFactories.Wclap), WclapDeviceBox)
            device.url.setValue(url)
            device.clapId.setValue(plugin.clapId)
            return {audioUnitBox, trackBox, device: device as WclapInstrumentBox | WclapDeviceBox}
        }, false).unwrap("Could not create the device")
        const worklet = project.startAudioWorklet()
        await project.engine.isReady()
        return new PluginSession(env, project, worklet, created.audioUnitBox, created.trackBox, created.device, url)
    }

    readonly #terminator = new Terminator()
    readonly #input: { region: Nullable<AudioRegionBox>, file: Nullable<AudioFileBox>, sample: Nullable<string> } =
        {region: null, file: null, sample: null}

    private constructor(readonly env: Env,
                        readonly project: Project,
                        readonly worklet: EngineWorklet,
                        readonly audioUnitBox: AudioUnitBox,
                        readonly trackBox: TrackBox,
                        readonly device: WclapInstrumentBox | WclapDeviceBox,
                        readonly url: string) {
        this.#terminator.own(project)
    }

    get engine() {return this.project.engine}

    // What reaches the speakers: the engine, plus the monitored microphone (it returns past the worklet)
    outputs(): ReadonlyArray<AudioNode> {
        const capture = this.#capture()
        return capture === null ? [this.worklet] : [this.worklet, capture.monitorPanNode]
    }
    get deviceUuid(): UUID.Bytes {return this.device.address.uuid}
    get deviceKey(): string {return UUID.toString(this.deviceUuid)}

    subscribeStatus(observer: Observer<WclapStatus>): Subscription {
        return this.engine.subscribeWclapStatus(this.deviceKey, observer)
    }

    parameters(): ReadonlyArray<AutomatableParameterFieldAdapter> {
        const adapter = this.device instanceof WclapInstrumentBox
            ? this.project.boxAdapters.adapterFor(this.device, WclapInstrumentBoxAdapter)
            : this.project.boxAdapters.adapterFor(this.device, WclapDeviceBoxAdapter)
        return adapter.parameters.parameters()
    }

    // The parameters arrive once the plugin has loaded, one WclapParameterBox each
    subscribeParameters(observer: () => void): Subscription {
        return this.device.parameters.pointerHub.subscribe({onAdded: observer, onRemoved: observer})
    }

    setParameter(parameter: AutomatableParameterFieldAdapter, unitValue: number): void {
        this.project.editing.modify(() => parameter.setUnitValue(unitValue), false)
    }

    note(pitch: number, on: boolean, velocity: number = 0.8): void {
        const unit = this.audioUnitBox.address.uuid
        this.engine.noteSignal(on ? NoteSignal.on(unit, pitch, velocity) : NoteSignal.off(unit, pitch))
    }

    midi(event: MIDIMessageEvent): void {
        this.engine.noteSignal(NoteSignal.fromEvent(event, this.audioUnitBox.address.uuid))
    }

    // Effects: what plays into the track. The microphone runs through the unit's effects as monitoring, the
    // others are a looped sample on the track.
    async setInput(kind: InputKind, file?: { name: string, buffer: AudioBuffer }): Promise<void> {
        this.#clearInput()
        const capture = this.#capture()
        if (kind === "microphone") {
            if (isDefined(capture)) {capture.monitoringMode = "effects"}
            return
        }
        const {sampleRate} = this.env.audioContext
        const audioData: Nullable<AudioData> = kind === "tone" ? LocalSamples.tone(sampleRate)
            : kind === "noise" ? LocalSamples.noise(sampleRate)
                : kind === "file" && isDefined(file) ? LocalSamples.fromAudioBuffer(file.buffer) : null
        if (audioData === null) {return}
        const name = kind === "file" && isDefined(file) ? file.name : kind
        const sample = LocalSamples.add(name, audioData)
        const {project} = this
        project.editing.modify(() => {
            const audioFileBox = AudioFileBox.create(project.boxGraph, UUID.parse(sample.uuid), box => {
                box.fileName.setValue(sample.name)
                box.endInSeconds.setValue(sample.duration)
            })
            const position = 0
            const duration = AudioContentFactory.calculateDuration(sample, project.tempoMap, position, true)
            const region = project.api.createNotStretchedRegion({
                boxGraph: project.boxGraph, targetTrack: this.trackBox, audioFileBox, sample, position
            })
            const {loopArea} = project.timelineBox
            loopArea.from.setValue(position)
            loopArea.to.setValue(position + duration)
            loopArea.enabled.setValue(true)
            this.#input.region = region
            this.#input.file = audioFileBox
            this.#input.sample = sample.uuid
        }, false)
        await project.engine.queryLoadingComplete()
        project.engine.setPosition(0)
        project.engine.play()
    }

    #capture(): CaptureAudio | null {
        const capture = this.project.captureDevices.get(this.audioUnitBox.address.uuid).unwrapOrNull()
        return capture instanceof CaptureAudio ? capture : null
    }

    #clearInput(): void {
        const capture = this.#capture()
        if (isDefined(capture) && capture.monitoringMode !== "off") {capture.monitoringMode = "off"}
        this.engine.stop()
        const {region, file, sample} = this.#input
        if (region !== null || file !== null) {
            this.project.editing.modify(() => {
                region?.delete()
                file?.delete()
            }, false)
        }
        if (sample !== null) {LocalSamples.remove(sample)}
        this.#input.region = this.#input.file = null
        this.#input.sample = null
    }

    terminate(): void {
        this.#clearInput()
        this.#terminator.terminate()
    }
}
