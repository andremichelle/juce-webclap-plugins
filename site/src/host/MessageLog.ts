import {Notifier, Observer, Subscription} from "@opendaw/lib-std"

// What passes between the plugin's page and its DSP, and what the host does. "in" is page → DSP, "out" is
// DSP → page. Repeats (a drag) collapse into one line.

export type Direction = "in" | "out"
export type LogKind = "page" | "host" | "error"
export type LogLine = { direction: Direction, kind: LogKind, text: string, key: string, repeat: number }

// juce_webclap's frame types (modules/juce_webclap/juce_webclap_protocol.h)
const FrameTypes: Record<number, string> = {
    1: "hello", 2: "snapshot", 3: "param", 4: "gesture", 5: "state", 6: "stream", 7: "resize"
}

export class MessageLog {
    readonly #notifier = new Notifier<LogLine>()
    #last: LogLine | null = null
    #counts = {in: 0, out: 0}

    constructor(readonly label: (id: number) => string) {}

    get counts(): Readonly<{ in: number, out: number }> {return this.#counts}

    subscribe(observer: Observer<LogLine>): Subscription {return this.#notifier.subscribe(observer)}

    frame(direction: Direction, buffer: ArrayBuffer): void {
        this.add(direction, "page", this.#describe(buffer))
    }

    add(direction: Direction, kind: LogKind, text: string): void {
        this.#counts[direction]++
        const key = `${kind} ${direction} ${text.replace(/=.*$/, "")}`
        if (this.#last !== null && this.#last.key === key) {
            this.#last = {...this.#last, text, repeat: this.#last.repeat + 1}
        } else {
            this.#last = {direction, kind, text, key, repeat: 0}
        }
        this.#notifier.notify(this.#last)
    }

    clear(): void {this.#last = null}

    #describe(buffer: ArrayBuffer): string {
        if (buffer.byteLength === 0) {return "empty frame"}
        const view = new DataView(buffer)
        const type = view.getUint8(0)
        if (type === 0x7b) { // "{": a JSON message (SC Dark's page)
            try {
                const message = JSON.parse(new TextDecoder().decode(buffer))
                const name = message.op ?? message.type ?? "message"
                return `${name}${message.id !== undefined ? ` ${this.label(message.id)}` : ""}${
                    message.value !== undefined ? ` = ${message.value}` : ""} (${buffer.byteLength} bytes)`
            } catch {
                return `JSON ${buffer.byteLength} bytes`
            }
        }
        const name = FrameTypes[type] ?? `type ${type}`
        if (type === 3 && buffer.byteLength >= 16) {
            return `param ${this.label(view.getUint32(4, true))} = ${view.getFloat64(8, true).toFixed(4)}`
        }
        if (type === 4 && buffer.byteLength >= 9) {
            return `gesture ${this.label(view.getUint32(4, true))} ${view.getUint8(8) ? "begin" : "end"}`
        }
        if (type === 2 && buffer.byteLength >= 8) {
            return `snapshot ${view.getUint32(4, true)} values, ${buffer.byteLength} bytes`
        }
        if (type === 7 && buffer.byteLength >= 12) {
            return `resize ${view.getUint32(4, true)} × ${view.getUint32(8, true)}`
        }
        return `${name} ${buffer.byteLength} bytes`
    }
}
