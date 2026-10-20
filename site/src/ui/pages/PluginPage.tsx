import css from "./PluginPage.sass?inline"
import {DefaultObservableValue, Lifecycle} from "@opendaw/lib-std"
import {createElement, Frag, PageFactory, replaceChildren} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"
import {PluginEntry} from "@/plugins"
import {boot} from "@/opendaw/Boot"
import {BundleSource, PluginSession} from "@/opendaw/PluginSession"
import {MessageLog} from "@/host/MessageLog"
import {Button} from "@/ui/components/Button"
import {Panel} from "@/ui/components/Panel"
import {PluginWindow} from "@/ui/components/PluginWindow"
import {ParameterList} from "@/ui/components/ParameterList"
import {clearMessageLog, MessageLogView} from "@/ui/components/MessageLogView"
import {Keyboard} from "@/ui/components/Keyboard"
import {InputSource} from "@/ui/components/InputSource"
import {Meter} from "@/ui/components/Meter"
import {ColumnResizer} from "@/ui/components/ColumnResizer"
import {HeaderTitle} from "@/ui/Header"
import {Presentation} from "@/ui/Presentation"
import {LoadingProgress, LoadingState} from "@/ui/components/LoadingProgress"

const className = Html.adoptStyleSheet(css, "PluginPage")

// One plugin under test, in its own openDAW project for as long as the page shows
export const PluginPage = (plugin: PluginEntry): PageFactory<null> => ({lifecycle}) => {
    let alive = true
    lifecycle.own({terminate: () => alive = false})
    // dev only: ?local loads the archive the build script left in build/
    const source: BundleSource = import.meta.env.DEV && new URLSearchParams(location.search).has("local") ? "local" : "hosted"
    const subtitle: HTMLElement = <span className="subtitle">loading…</span>
    // starting openDAW, downloading the bundle (with its size), handing it to the engine
    const loading = new DefaultObservableValue<LoadingState>({text: "Starting openDAW…", fraction: null})
    const body: HTMLElement = (
        <div className="body">
            <div className="loading"><LoadingProgress lifecycle={lifecycle} state={loading}/></div>
        </div>
    )
    const progress = (text: string) => loading.setValue({text, fraction: null})
    const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)
    document.title = `${plugin.name} · open-webclap`
    HeaderTitle.show(lifecycle, (
        <Frag>
            <h1>{plugin.name}</h1>
            {subtitle}
            <div className="links">
                <a href={plugin.credit} target="_blank" rel="noopener noreferrer">Original</a>
                <a href={plugin.source} target="_blank" rel="noopener noreferrer">Port source</a>
                <span>{plugin.license}</span>
            </div>
        </Frag>
    ))
    boot(progress).then(async env => {
        const name = `${plugin.name}${source === "local" ? " (local build)" : ""}`
        const session = await PluginSession.create(env, plugin, source, ({loaded, total}) => {
            if (total === 0) {
                progress(`Downloading ${name}… ${megabytes(loaded)} MB`)
            } else if (loaded < total) {
                loading.setValue({text: `Downloading ${name} · ${megabytes(loaded)} of ${megabytes(total)} MB`,
                    fraction: loaded / total})
            } else {
                progress(`Starting ${name}…`)
            }
        })
        if (!alive) {return session.terminate()}
        lifecycle.own(session)
        subtitle.textContent = `${plugin.clapId}${source === "local" ? " · local build" : ""}`
        progress(`Starting ${name}…`)
        replaceChildren(body, <Workbench lifecycle={lifecycle} plugin={plugin} session={session} loading={loading}/>)
    }).catch((reason: unknown) => {
        if (!alive) {return}
        subtitle.textContent = "not loaded"
        replaceChildren(body, (
            <div className="message">
                <p className="error">{plugin.name} could not be loaded: {reason instanceof Error ? reason.message : String(reason)}</p>
                {source === "local" && <p>Build its bundle with <code>{plugin.build}</code>, then reload this page.</p>}
            </div>
        ))
    })
    return (
        <div className={className}>
            {body}
        </div>
    )
}

// Browsers start audio only after a user gesture. The button toggles; any other click starts it as well.
const AudioSwitch = ({lifecycle, context}: { lifecycle: Lifecycle, context: AudioContext }) => {
    const button: HTMLButtonElement = (
        <Button lifecycle={lifecycle} className="audio" tooltip="Browsers start audio only after a click"
                onClick={() => context.state === "running" ? context.suspend() : context.resume()}>Start audio</Button>
    )
    const update = () => {
        const running = context.state === "running"
        button.textContent = running ? `Audio on · ${context.sampleRate} Hz` : "Start audio"
        button.classList.toggle("active", running)
    }
    const resume = () => {if (context.state === "suspended") {context.resume().then(update, () => {})}}
    // The button's own press must not resume: its click would then see the context running and suspend it
    // (keys relayed from the plugin window are dispatched on the window itself, not on a node)
    const resumeOutside = (event: Event) => {
        if (!(event.target instanceof Node && button.contains(event.target))) {resume()}
    }
    lifecycle.ownAll(
        Events.subscribe(context, "statechange", update),
        Events.subscribe(window, "pointerdown", resumeOutside),
        Events.subscribe(window, "keydown", resumeOutside),
        // a click into the plugin window counts too
        Events.subscribe(window, "blur", () => setTimeout(() => {
            if (document.activeElement instanceof HTMLIFrameElement) {resume()}
        }))
    )
    update()
    return button
}

type WorkbenchConstruct = {
    lifecycle: Lifecycle
    plugin: PluginEntry
    session: PluginSession
    loading: DefaultObservableValue<LoadingState> // shown in the plugin column until the window is up
}

const Workbench = ({lifecycle, plugin, session, loading}: WorkbenchConstruct) => {
    const log = new MessageLog(id => `#${id}`)
    const midiStatus: HTMLElement = <span className="muted"/>
    const filter: HTMLInputElement = <input type="search" placeholder="Filter"/>
    const parameterCount: HTMLElement = <span className="muted"/>
    const counts: HTMLElement = <span className="muted"/>
    const logView: HTMLElement = <MessageLogView lifecycle={lifecycle} log={log} counts={counts}/>
    // hidden until the plugin window has its size: before, the stack is as narrow as the keyboard alone
    // (the main column goes full screen in presentation mode, the stack scales to fit, see Presentation)
    let stack_: HTMLElement | null = null
    let loading_: HTMLElement | null = null
    const aside: HTMLElement = (
        <aside>
            <Panel title="Audio">
                <div className="row audio">
                    <AudioSwitch lifecycle={lifecycle} context={session.env.audioContext}/>
                    <Meter lifecycle={lifecycle} context={session.env.audioContext} sources={session.outputs()}/>
                </div>
            </Panel>
            <Panel title="Plugin">
                <PluginStatus lifecycle={lifecycle} session={session}/>
                {plugin.kind === "instrument" && midiStatus}
            </Panel>
            {plugin.kind === "audio-fx" && (
                <Panel title="Input"><InputSource lifecycle={lifecycle} session={session}/></Panel>
            )}
            <Panel title="Parameters" grow actions={<Frag>{parameterCount}{filter}</Frag>}>
                <ParameterList lifecycle={lifecycle} session={session} filter={filter} count={parameterCount}/>
            </Panel>
            <Panel title="Messages" grow actions={(
                <Frag>
                    {counts}
                    <Button lifecycle={lifecycle} onClick={() => clearMessageLog(logView, log)}>Clear</Button>
                </Frag>
            )}>
                {logView}
            </Panel>
        </aside>
    )
    return (
        <div className="workbench">
            <div className="main" onInit={main => {
                if (stack_ !== null) {Presentation.register(lifecycle, main, stack_)}
            }}>
                <button type="button" className="leave-presentation" title="Leave presentation mode (Escape)"
                        onclick={() => Presentation.toggle()}>×</button>
                <div className="loading" onInit={element => loading_ = element}>
                    <LoadingProgress lifecycle={lifecycle} state={loading}/>
                </div>
                <div className="stack pending" onInit={stack => stack_ = stack}>
                    <PluginWindow lifecycle={lifecycle} session={session} log={log}
                                  onLayout={() => {
                                      stack_?.classList.remove("pending")
                                      loading_?.remove()
                                  }}/>
                    {plugin.kind === "instrument" && (
                        <Keyboard lifecycle={lifecycle} session={session} midiStatus={midiStatus}/>
                    )}
                </div>
            </div>
            <ColumnResizer lifecycle={lifecycle} target={aside} minWidth={240} maxWidth={400}
                           storageKey="open-webclap-aside-width"/>
            {aside}
        </div>
    )
}

// The engine's view of the plugin: loading, ready (with its audio inputs) or failed (with the reason)
const PluginStatus = ({lifecycle, session}: { lifecycle: Lifecycle, session: PluginSession }) => {
    const state: HTMLElement = <span className="state">loading</span>
    const message: HTMLElement = <span className="muted"/>
    lifecycle.own(session.subscribeStatus(status => {
        state.textContent = status.state
        state.className = Html.buildClassList("state", status.state)
        const inputs = status.inputs.length > 0 ? `${status.inputs.length} audio input${status.inputs.length > 1 ? "s" : ""}` : ""
        message.textContent = [status.message, inputs, status.editor === false ? "no plugin window" : ""]
            .filter(text => text.length > 0).join(" · ")
    }))
    return (
        <div className="row">
            {state}
            {message}
        </div>
    )
}
