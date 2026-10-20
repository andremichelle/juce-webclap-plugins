import css from "./MessageLogView.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {LogLine, MessageLog} from "@/host/MessageLog"

const className = Html.adoptStyleSheet(css, "MessageLogView")

const MAX_LINES = 300

type Construct = { lifecycle: Lifecycle, log: MessageLog, counts: HTMLElement }

export const MessageLogView = ({lifecycle, log, counts}: Construct) => {
    const element: HTMLElement = <div className={className}/>
    let last: { line: LogLine, element: HTMLElement } | null = null
    const text = ({direction, kind, text, repeat}: LogLine) => {
        const prefix = kind === "host" ? "host    " : direction === "in" ? "UI → DSP" : "DSP → UI"
        return `${prefix}  ${text}${repeat > 0 ? `  (×${repeat + 1})` : ""}`
    }
    lifecycle.own(log.subscribe(line => {
        counts.textContent = `${log.counts.in} in · ${log.counts.out} out`
        if (last !== null && last.line.key === line.key && line.repeat > 0) {
            last.element.textContent = text(line)
            last.line = line
        } else {
            const lineElement: HTMLElement = <div className={line.kind === "page" ? line.direction : line.kind}>{text(line)}</div>
            element.appendChild(lineElement)
            last = {line, element: lineElement}
            while (element.childElementCount > MAX_LINES) {element.firstElementChild?.remove()}
        }
        element.scrollTop = element.scrollHeight
    }))
    return element
}

export const clearMessageLog = (element: HTMLElement, log: MessageLog) => {
    element.textContent = ""
    log.clear()
}
