import css from "./Button.sass?inline"
import {isDefined, Lifecycle, ObservableValue, Procedure} from "@opendaw/lib-std"
import {createElement, JsxValue} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"

const className = Html.adoptStyleSheet(css, "Button")

export type ButtonParameters = {
    lifecycle: Lifecycle
    onClick: Procedure<MouseEvent>
    onInit?: Procedure<HTMLButtonElement>
    className?: string
    tooltip?: string
    disabled?: ObservableValue<boolean>
}

// A framed button like the studio's (ButtonCheckboxRadio with appearance framed), as a plain <button>
export const Button = ({lifecycle, onClick, onInit, className: externalClassName, tooltip, disabled}: ButtonParameters,
                       children: JsxValue) => {
    const button: HTMLButtonElement = (
        <button type="button"
                className={Html.buildClassList(className, externalClassName)}
                title={tooltip ?? ""}
                onclick={onClick}
                onInit={onInit}>{children}</button>
    )
    if (isDefined(disabled)) {
        lifecycle.own(disabled.catchupAndSubscribe(owner => button.disabled = owner.getValue()))
    }
    return button
}
