import {DefaultObservableValue, Lifecycle, ObservableValue} from "@opendaw/lib-std"
import {Events} from "@opendaw/lib-dom"

// Presentation mode: only the plugin (its page, no title bar, no keyboard) over the whole window, scaled to fit,
// and the browser full screen if it allows. A plugin page registers what to present, the header toggles it;
// Escape leaves it, so does leaving the browser's full screen.
export namespace Presentation {
    type Target = { stage: HTMLElement, content: HTMLElement }

    const target = new DefaultObservableValue<Target | null>(null)
    const active = new DefaultObservableValue(false)
    const available = new DefaultObservableValue(false)
    target.subscribe(owner => available.setValue(owner.getValue() !== null))

    export const isAvailable: ObservableValue<boolean> = available
    export const isActive: ObservableValue<boolean> = active

    // stage: what covers the window (it lays the content out), content: what is scaled to fit into it
    export const register = (lifecycle: Lifecycle, stage: HTMLElement, content: HTMLElement): void => {
        const registered: Target = {stage, content}
        target.setValue(registered)
        const fit = () => {
            if (!active.getValue()) {
                content.style.removeProperty("scale")
                return
            }
            const scale = Math.min(stage.clientWidth / content.offsetWidth, stage.clientHeight / content.offsetHeight)
            content.style.scale = String(Math.max(0.1, scale * 0.95))
        }
        const leaveWithBrowser = () => {if (document.fullscreenElement === null) {set(false)}}
        document.addEventListener("fullscreenchange", leaveWithBrowser)
        lifecycle.ownAll(
            active.subscribe(owner => {
                stage.classList.toggle("presenting", owner.getValue())
                requestAnimationFrame(fit)
            }),
            Events.subscribe(window, "resize", fit),
            Events.subscribe(window, "keydown", (event: KeyboardEvent) => {
                if (event.key === "Escape") {set(false)}
            }),
            {
                terminate: () => {
                    document.removeEventListener("fullscreenchange", leaveWithBrowser)
                    if (target.getValue() === registered) {
                        set(false)
                        target.setValue(null)
                    }
                }
            }
        )
    }

    export const toggle = (): void => set(!active.getValue())

    const set = (value: boolean): void => {
        if (target.getValue() === null || active.getValue() === value) {return}
        active.setValue(value)
        // the browser's full screen is a bonus: it may refuse (no user gesture, a policy), the mode works without
        if (value) {
            document.documentElement.requestFullscreen?.().catch(() => {})
        } else if (document.fullscreenElement !== null) {
            document.exitFullscreen().catch(() => {})
        }
    }
}
