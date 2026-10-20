import {Promises} from "@opendaw/lib-runtime"

// Static hosts send no COOP/COEP headers. The service worker adds them, but only to loads it already
// controls, so the first visit registers it and reloads once it is actually in charge.
export namespace Isolation {
    const Attempts = "coi-attempts"
    // Two reloads at most: enough for a worker that needs a second navigation to take over, few enough that
    // a host which simply cannot be isolated ends on a message instead of cycling.
    const MaxAttempts = 2
    const ClaimTimeoutMs = 4_000

    export const recover = async (): Promise<boolean> => {
        if (crossOriginIsolated) {return true}
        if (!("serviceWorker" in navigator)) {return false}
        const attempts = parseInt(sessionStorage.getItem(Attempts) ?? "0", 10) || 0
        if (attempts >= MaxAttempts) {return false}
        const {status} = await Promises.tryCatch(navigator.serviceWorker.register("./coi-sw.js", {scope: "./"}))
        if (status === "rejected") {return false}
        // register() only promises that the registration exists: the worker can still be installing, and a
        // reload racing it is served without the headers again, which used to strand the page for good.
        await awaitController()
        sessionStorage.setItem(Attempts, String(attempts + 1))
        location.reload()
        return false
    }

    // Settles once the worker controls this page. It gives up after a timeout rather than hanging on a
    // promise that may never resolve: reloading is still the best move, it just might cost one more attempt.
    const awaitController = (): Promise<unknown> => {
        if (navigator.serviceWorker.controller !== null) {return Promise.resolve()}
        return Promise.race([
            navigator.serviceWorker.ready.then(() => navigator.serviceWorker.controller !== null
                ? Promise.resolve()
                : new Promise(resolve =>
                    navigator.serviceWorker.addEventListener("controllerchange", resolve, {once: true}))),
            new Promise(resolve => setTimeout(resolve, ClaimTimeoutMs))
        ])
    }
}
