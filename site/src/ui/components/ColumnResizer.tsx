import css from "./ColumnResizer.sass?inline"
import {clamp, Lifecycle, Option} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Dragging, Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "ColumnResizer")

type Construct = {
    lifecycle: Lifecycle
    target: HTMLElement // the column right of the resizer, sized by it
    minWidth: number
    maxWidth: number
    storageKey: string // the max-width is remembered per browser
}

// A handle between two columns, like the studio's PanelResizer: dragging sets the max-width of the right one, the
// left one takes the rest (the right one may still give way to it)
export const ColumnResizer = ({lifecycle, target, minWidth, maxWidth, storageKey}: Construct) => {
    const element: HTMLElement = <div className={className}/>
    let limit = maxWidth
    const apply = (width: number): void => {
        limit = clamp(width, minWidth, maxWidth)
        target.style.maxWidth = `${limit}px`
    }
    try {
        const stored = Number(localStorage.getItem(storageKey))
        if (stored > 0) {apply(stored)}
    } catch {/* no storage, the default width */}
    lifecycle.own(Dragging.attach(element, (beginEvent: PointerEvent) => {
        const beginPointer = beginEvent.clientX
        const beginWidth = target.getBoundingClientRect().width
        return Option.wrap({
            update: (event: Dragging.Event): void => apply(beginWidth - (event.clientX - beginPointer)),
            finally: (): void => {
                try {localStorage.setItem(storageKey, String(limit))} catch {/* ignore */}
            }
        })
    }))
    return element
}
