import css from "./HomePage.sass?inline"
import {createElement, LocalLink, PageFactory} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {PluginEntry, Plugins} from "@/plugins"

const className = Html.adoptStyleSheet(css, "HomePage")

const KindLabels = {"instrument": "Instrument", "audio-fx": "Audio effect"} as const

const PluginCard = ({plugin}: { plugin: PluginEntry }) => (
    <article>
        <header>
            <h2><LocalLink href={`/${plugin.id}`}>{plugin.name}</LocalLink></h2>
            <span className={Html.buildClassList("kind", plugin.kind)}>{KindLabels[plugin.kind]}</span>
        </header>
        <p>{plugin.description}</p>
        <footer>
            <a href={plugin.credit} target="_blank" rel="noopener noreferrer">Original</a>
            <a href={plugin.source} target="_blank" rel="noopener noreferrer">Port source</a>
            <span>{plugin.license}</span>
        </footer>
    </article>
)

export const HomePage: PageFactory<null> = () => (
    <div className={className}>
        <h1>open-webclap</h1>
        <p className="intro">
            Open-source audio plugins ported to WebCLAP. Each page runs the plugin in this browser: its DSP in an
            AudioWorklet, its editor in the plugin window. Instruments play from the keyboard or MIDI, effects
            from the microphone, an audio file or a test signal.
        </p>
        <div className="grid">
            {Plugins.map(plugin => <PluginCard plugin={plugin}/>)}
        </div>
    </div>
)
