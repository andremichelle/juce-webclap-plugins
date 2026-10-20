import css from "./ParameterList.sass?inline"
import {Lifecycle, Terminator} from "@opendaw/lib-std"
import {createElement, replaceChildren} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {AutomatableParameterFieldAdapter} from "@opendaw/studio-adapters"
import {WclapParameterBox} from "@opendaw/studio-boxes"
import {PluginSession} from "@/opendaw/PluginSession"

const className = Html.adoptStyleSheet(css, "ParameterList")

const REBUILD_DELAY_MS = 50

type Construct = { lifecycle: Lifecycle, session: PluginSession, filter: HTMLInputElement, count: HTMLElement }

// The plugin's automatable parameters as openDAW sees them, a slider each. Changes from the plugin's own window
// arrive through the engine and flash.
export const ParameterList = ({lifecycle, session, filter, count}: Construct) => {
    const element: HTMLElement = <div className={className}><p className="empty">Waiting for the plugin…</p></div>
    const rows: Array<{ element: HTMLElement, text: string }> = []
    const rowsLifecycle = lifecycle.own(new Terminator())
    const Row = (parameter: AutomatableParameterFieldAdapter) => {
        // the track fills up to the value
        const fill = (unitValue: number) => range.style.setProperty("--fill", `${unitValue * 100.0}%`)
        const range: HTMLInputElement = (
            <input type="range" min="0" max="1" step="0.001"
                   oninput={() => {
                       editing = true
                       fill(Number(range.value))
                       session.setParameter(parameter, Number(range.value))
                       editing = false
                   }}/>
        )
        const value: HTMLElement = <span className="value"/>
        const name: HTMLElement = <span className="name" title={parameter.name}>{parameter.name}</span>
        const row: HTMLElement = (
            <div className="param">
                {name}
                {range}
                {value}
            </div>
        )
        let editing = false
        let timer = 0
        rowsLifecycle.own(parameter.catchupAndSubscribe(owner => {
            const {value: text, unit} = owner.getPrintValue()
            value.textContent = `${text}${unit.length > 0 ? ` ${unit}` : ""}`
            if (editing) {return}
            range.value = String(owner.getUnitValue())
            fill(owner.getUnitValue())
            row.classList.add("flash")
            clearTimeout(timer)
            timer = window.setTimeout(() => row.classList.remove("flash"), 300)
        }))
        const entry = {element: row, text: parameter.name.toLowerCase()}
        // a rescan can rename it (Airwindows Basics' knobs belong to the loaded effect)
        const box = parameter.field.box
        if (box instanceof WclapParameterBox) {
            rowsLifecycle.own(box.label.subscribe(owner => {
                const label = owner.getValue()
                name.textContent = label
                name.title = label
                entry.text = label.toLowerCase()
                applyFilter()
            }))
        }
        rows.push(entry)
        return row
    }
    const build = () => {
        rowsLifecycle.terminate()
        rows.length = 0
        const parameters = session.parameters()
        count.textContent = parameters.length > 0 ? String(parameters.length) : ""
        if (parameters.length === 0) {return}
        replaceChildren(element, parameters.map(Row))
        rows.forEach(row => row.element.classList.remove("flash"))
        applyFilter()
    }
    const applyFilter = () => {
        const query = filter.value.trim().toLowerCase()
        rows.forEach(row => row.element.hidden = query !== "" && !row.text.includes(query))
    }
    filter.oninput = applyFilter
    let rebuild = 0
    const scheduleBuild = () => {
        clearTimeout(rebuild)
        rebuild = window.setTimeout(build, REBUILD_DELAY_MS)
    }
    lifecycle.ownAll(
        session.subscribeParameters(scheduleBuild),
        {terminate: () => clearTimeout(rebuild)}
    )
    build()
    return element
}
