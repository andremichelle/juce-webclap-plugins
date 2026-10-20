import css from "./Panel.sass?inline"
import {createElement, JsxValue} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "Panel")

type Construct = {
    title: string
    actions?: JsxValue // shown right of the title
    grow?: boolean // takes the space left in its column
    className?: string
}

export const Panel = ({title, actions, grow, className: externalClassName}: Construct, children: JsxValue) => (
    <section className={Html.buildClassList(className, grow === true && "grow", externalClassName)}>
        <h2><span>{title}</span>{actions}</h2>
        {children}
    </section>
)
