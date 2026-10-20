import css from "./NavMenu.sass?inline"
import {Color, Lifecycle} from "@opendaw/lib-std"
import {createElement, RouteLocation} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "NavMenu")

type Construct = {
    lifecycle: Lifecycle
    label: string
    color: Color
    links: ReadonlyArray<{ href: string, label: string }>
}

// A header dropdown of page links, looking like the studio's framed MenuButton and its Menu: a header row in the
// button's color, a check at the page that shows. Opens on press, closes on a choice, a press elsewhere or Escape.
export const NavMenu = ({lifecycle, label, color, links}: Construct) => {
    const items = links.map(({href, label}) => {
        const item: HTMLElement = (
            <div className="item">
                <div className="default">
                    <svg className="check-icon" viewBox="0 0 12 12">
                        <path d="M2 7L5 10L10 3"/>
                    </svg>
                    <div className="label">{label}</div>
                </div>
            </div>
        )
        lifecycle.own(Events.subscribe(item, "click", () => {
            setOpen(false)
            RouteLocation.get().navigateTo(href)
        }))
        return {href, item}
    })
    const menu: HTMLElement = (
        <nav className="menu">
            <div className="container">
                <div className="item">
                    <div className="header">
                        <div className="label">{label}</div>
                    </div>
                </div>
                {items.map(({item}) => item)}
            </div>
        </nav>
    )
    const button: HTMLButtonElement = (
        <button type="button">
            <label>{label}</label>
        </button>
    )
    const element: HTMLElement = <div className={className} style={{"--color": color.toString()}}>{button}{menu}</div>
    const setOpen = (open: boolean) => {
        element.classList.toggle("open", open)
        button.classList.toggle("active", open || isCurrent())
    }
    const isCurrent = () => items.some(({href}) => href === RouteLocation.get().path)
    lifecycle.ownAll(
        Events.subscribe(button, "pointerdown", (event: PointerEvent) => {
            event.stopPropagation()
            setOpen(!element.classList.contains("open"))
        }),
        Events.subscribe(window, "pointerdown", (event: PointerEvent) => {
            if (!(event.target instanceof Node && menu.contains(event.target))) {setOpen(false)}
        }),
        Events.subscribe(window, "keydown", (event: KeyboardEvent) => {if (event.key === "Escape") {setOpen(false)}}),
        RouteLocation.get().catchupAndSubscribe(location => {
            items.forEach(({href, item}) =>
                item.firstElementChild?.classList.toggle("checked", href === location.path))
            setOpen(false)
        })
    )
    return element
}
