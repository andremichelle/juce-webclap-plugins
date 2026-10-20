import css from "./Meter.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {AnimationFrame, Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "Meter")

const MIN_DB = -60.0
const RELEASE = 0.92 // the peak falls by this factor per frame

type Construct = { lifecycle: Lifecycle, context: AudioContext, sources: ReadonlyArray<AudioNode> }

// The stereo peak level of the summed nodes, left above right, -60..0 dB, red when a channel clips
export const Meter = ({lifecycle, context, sources}: Construct) => {
    const sum = context.createGain()
    sum.channelCount = 2
    sum.channelCountMode = "explicit"
    sources.forEach(source => source.connect(sum))
    const splitter = context.createChannelSplitter(2)
    sum.connect(splitter)
    const channels = [0, 1].map(index => {
        const analyser = context.createAnalyser()
        analyser.fftSize = 1024
        splitter.connect(analyser, index)
        const bar: HTMLElement = <div className="bar"/>
        const track: HTMLElement = <div className="track">{bar}</div>
        return {analyser, bar, track, samples: new Float32Array(analyser.fftSize), hold: 0.0}
    })
    const element: HTMLElement = <div className={className} title="Output, left and right">{channels.map(({track}) => track)}</div>
    lifecycle.ownAll(
        AnimationFrame.add(() => {
            for (const channel of channels) {
                channel.analyser.getFloatTimeDomainData(channel.samples)
                let peak = 0.0
                for (const sample of channel.samples) {peak = Math.max(peak, Math.abs(sample))}
                channel.hold = Math.max(peak, channel.hold * RELEASE)
                const db = channel.hold > 0.0 ? 20.0 * Math.log10(channel.hold) : MIN_DB
                channel.bar.style.width = `${Math.max(0.0, Math.min(1.0, 1.0 - db / MIN_DB)) * 100.0}%`
                channel.track.classList.toggle("clip", peak >= 1.0)
            }
        }),
        {
            terminate: () => {
                // The sources may be gone already (the host disconnects its nodes when it terminates)
                sources.forEach(source => {
                    try {source.disconnect(sum)} catch {/* not connected anymore */}
                })
                sum.disconnect()
            }
        }
    )
    return element
}
