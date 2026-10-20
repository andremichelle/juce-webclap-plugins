import css from "./Keyboard.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"
import {PluginSession} from "@/opendaw/PluginSession"

const className = Html.adoptStyleSheet(css, "Keyboard")

const FIRST_KEY = 36
const NUM_KEYS = 61
const BLACK_KEYS = [1, 3, 6, 8, 10]
const COMPUTER_KEYS = "awsedftgyhujk"

type Construct = { lifecycle: Lifecycle, session: PluginSession, midiStatus: HTMLElement }

// Notes from the on-screen keys, the computer keys (A W S E D F T G Y H U J K, Z/X octave) and Web MIDI inputs
export const Keyboard = ({lifecycle, session, midiStatus}: Construct) => {
    const keys = new Map<number, HTMLElement>()
    const held = new Map<string, number>() // computer key -> note
    let octave = 4
    // a key shows down while any source holds it (pointer, computer keys, MIDI)
    const holds = new Map<number, number>()
    const show = (key: number, on: boolean) => {
        const count = Math.max(0, (holds.get(key) ?? 0) + (on ? 1 : -1))
        holds.set(key, count)
        keys.get(key)?.classList.toggle("down", count > 0)
    }
    const note = (key: number, on: boolean) => {
        session.note(key, on)
        show(key, on)
    }
    const whiteKeys = Array.from({length: NUM_KEYS}, (_, index) => FIRST_KEY + index)
        .filter(key => !BLACK_KEYS.includes(key % 12)).length
    const element: HTMLElement = (
        <div className={className} style={{"--white-keys": String(whiteKeys)}}
             title="Notes: click, or the computer keys A W S E D F T G Y H U J K (Z/X octave)">
            {Array.from({length: NUM_KEYS}, (_, index) => {
                const key = FIRST_KEY + index
                const keyElement: HTMLElement = (
                    <div className={BLACK_KEYS.includes(key % 12) ? "black" : "white"}
                         onpointerdown={(event: PointerEvent) => {
                             keyElement.setPointerCapture(event.pointerId)
                             note(key, true)
                         }}
                         onpointerup={() => note(key, false)}
                         onpointercancel={() => note(key, false)}/>
                )
                keys.set(key, keyElement)
                return keyElement
            })}
        </div>
    )
    const typing = (event: KeyboardEvent) => event.repeat || event.metaKey || event.ctrlKey
        || (event.target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName))
    lifecycle.ownAll(
        Events.subscribe(window, "keydown", (event: KeyboardEvent) => {
            if (typing(event)) {return}
            if (event.key === "z") {octave = Math.max(1, octave - 1)}
            if (event.key === "x") {octave = Math.min(8, octave + 1)}
            const index = COMPUTER_KEYS.indexOf(event.key)
            if (index >= 0 && !held.has(event.key)) {
                const key = 12 * (octave + 1) + index
                held.set(event.key, key)
                note(key, true)
            }
        }),
        Events.subscribe(window, "keyup", (event: KeyboardEvent) => {
            const key = held.get(event.key)
            if (key === undefined) {return}
            note(key, false)
            held.delete(event.key)
        }),
        {terminate: () => held.forEach(key => note(key, false))}
    )
    connectMidi(lifecycle, session, midiStatus, show)
    return element
}

const connectMidi = (lifecycle: Lifecycle, session: PluginSession, status: HTMLElement,
                     show: (key: number, on: boolean) => void) => {
    if (navigator.requestMIDIAccess === undefined) {
        status.textContent = "No Web MIDI in this browser"
        return
    }
    let inputs: ReadonlyArray<MIDIInput> = []
    let alive = true
    lifecycle.own({
        terminate: () => {
            alive = false
            inputs.forEach(input => input.onmidimessage = null)
        }
    })
    navigator.requestMIDIAccess().then(access => {
        if (!alive) {return}
        const attach = () => {
            inputs = Array.from(access.inputs.values())
            inputs.forEach(input => input.onmidimessage = (event: MIDIMessageEvent) => {
                const [statusByte = 0xf0, key = 0, velocity = 0] = event.data ?? []
                const command = statusByte & 0xf0
                if (command !== 0x80 && command !== 0x90) {return} // notes, as openDAW passes them on
                session.midi(event)
                show(key, command === 0x90 && velocity > 0)
            })
            status.textContent = inputs.length > 0
                ? `MIDI in: ${inputs.map(input => input.name).join(", ")}` : "No MIDI inputs"
        }
        access.onstatechange = () => {if (alive) {attach()}}
        attach()
    }).catch(() => status.textContent = "Web MIDI not allowed")
}
