import css from "./LoadingProgress.sass?inline"
import {Lifecycle, ObservableValue} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "LoadingProgress")

// fraction: 0..1 while the size is known (a download), null while it is not (starting up)
export type LoadingState = { text: string, fraction: number | null }

type Construct = { lifecycle: Lifecycle, state: ObservableValue<LoadingState> }

// What is loading, with a bar: filling for a download, sweeping while the length is unknown
export const LoadingProgress = ({lifecycle, state}: Construct) => {
    const label: HTMLElement = <span className="label"/>
    const bar: HTMLElement = <div className="bar"/>
    const element: HTMLElement = <div className={className}>{label}<div className="track">{bar}</div></div>
    lifecycle.own(state.catchupAndSubscribe(owner => {
        const {text, fraction} = owner.getValue()
        label.textContent = text
        element.classList.toggle("indeterminate", fraction === null)
        bar.style.width = fraction === null ? "" : `${Math.round(fraction * 1000) / 10}%`
    }))
    return element
}
