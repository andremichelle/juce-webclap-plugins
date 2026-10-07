// A fake WebCLAP host for testing the split UI without audio.
//
// It plays both roles the real system splits up: the host that relays webview messages, and the DSP module
// that owns parameter values and state. It answers "hello" with a snapshot, records what the editor sends,
// and can move parameters itself (automation) to show that host-side changes reach the editor.

"use strict"

const TYPES = {1: "hello", 2: "snapshot", 3: "param", 4: "gesture", 5: "state", 6: "stream", 7: "resize"}
const FLAG_SYNC = 1

const frame = document.getElementById("plugin")
const paramsView = document.getElementById("params")
const logView = document.getElementById("log")

// The DSP side's model
const values = new Map()        // clapId -> normalised value
let stateBlob = null            // last state the UI sent (Uint8Array)
let storedState = null
const names = new Map()         // clapId -> name, from the UI's debug message (a real host asks the DSP)
const rows = new Map()          // clapId -> row elements
const gestures = new Set()
const counts = {in: 0, out: 0}

// ---------------------------------------------------------------------------------------------------------------
// Frames

function header(type, flags, payloadSize) {
    const buffer = new ArrayBuffer(4 + payloadSize)
    const view = new DataView(buffer)
    view.setUint8(0, type)
    view.setUint8(1, flags)
    return [buffer, view]
}

function sendToUI(buffer) {
    frame.contentWindow.postMessage(buffer, "*", [buffer])
}

function sendParam(id, value) {
    const [buffer, view] = header(3, 0, 12)
    view.setUint32(4, id, true)
    view.setFloat64(8, value, true)
    log("out", `param ${label(id)} = ${value.toFixed(4)}`)
    sendToUI(buffer)
}

function sendState(blob) {
    const [buffer] = header(5, 0, blob.byteLength)
    new Uint8Array(buffer, 4).set(blob)
    log("out", `state ${blob.byteLength} bytes`)
    sendToUI(buffer)
}

function sendSnapshot() {
    const state = stateBlob || new Uint8Array(0)
    const [buffer, view] = header(2, 0, 4 + values.size * 12 + 4 + state.byteLength)
    let offset = 4
    view.setUint32(offset, values.size, true); offset += 4
    for (const [id, value] of values) {
        view.setUint32(offset, id, true)
        view.setFloat64(offset + 4, value, true)
        offset += 12
    }
    view.setUint32(offset, state.byteLength, true); offset += 4
    new Uint8Array(buffer, offset).set(state)
    log("out", `snapshot ${values.size} values, state ${state.byteLength} bytes`)
    sendToUI(buffer)
}

function receive(buffer) {
    const view = new DataView(buffer)
    const type = view.getUint8(0), flags = view.getUint8(1)
    const sync = (flags & FLAG_SYNC) !== 0
    switch (type) {
        case 1:
            log("in", `hello v${view.getUint32(4, true)}`)
            sendSnapshot()
            break
        case 3: {
            const id = view.getUint32(4, true), value = view.getFloat64(8, true)
            values.set(id, value)
            updateRow(id, value, !sync)
            if (!sync) log("in", `param ${label(id)} = ${value.toFixed(4)}`)
            break
        }
        case 4: {
            const id = view.getUint32(4, true), begin = view.getUint8(8) === 1
            begin ? gestures.add(id) : gestures.delete(id)
            const row = rows.get(id)
            row && row.root.classList.toggle("gesture", begin)
            log("in", `gesture ${label(id)} ${begin ? "begin" : "end"}`)
            break
        }
        case 5:
            stateBlob = new Uint8Array(buffer.slice(4))
            document.getElementById("stateInfo").textContent = `current state ${stateBlob.byteLength} bytes`
            log("in", `state ${stateBlob.byteLength} bytes${sync ? " (sync)" : ""}`)
            break
        case 7: {
            const width = view.getUint32(4, true), height = view.getUint32(8, true)
            frame.style.width = `${width}px`
            frame.style.height = `${height}px`
            document.getElementById("windowSize").textContent = `${width} × ${height}`
            log("in", `resize ${width} × ${height}`)
            break
        }
        default:
            log("in", `${TYPES[type] || "type " + type} ${buffer.byteLength} bytes`)
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Relay: the plugin page posts ArrayBuffers (protocol) and, for this test harness only, JSON debug messages.

window.addEventListener("message", event => {
    if (event.source !== frame.contentWindow) return
    if (event.data instanceof ArrayBuffer) receive(event.data)
    else if (event.data && event.data.webclapDebug) debug(event.data)
})

let statsWindow = []
function debug(message) {
    switch (message.webclapDebug) {
        case "ready":
            if (message.params) buildParams(message.params)
            document.getElementById("stats").dataset.init = `init ${message.initMs.toFixed(0)} ms`
            break
        case "error":
            log("in", `ERROR ${message.message}`)
            break
        case "stats":
            statsWindow.push({...message.stats, t: performance.now()})
            break
    }
}

setInterval(() => {
    const now = performance.now()
    statsWindow = statsWindow.filter(s => now - s.t < 1000)
    const n = statsWindow.length
    const el = document.getElementById("stats")
    if (!n) { el.textContent = el.dataset.init || ""; return }
    const avg = key => statsWindow.reduce((sum, s) => sum + s[key], 0) / n
    const max = key => Math.max(...statsWindow.map(s => s[key]))
    const painted = statsWindow.filter(s => s.rects > 0).length
    el.textContent = `${el.dataset.init || ""} · ${n} fps · tick ${avg("tickMs").toFixed(2)} ms (max ${max("tickMs").toFixed(1)})` +
        ` · blit ${avg("blitMs").toFixed(2)} ms · ${painted} painted frames · ${(avg("pixels") / 1000).toFixed(0)} kpx/frame`
}, 500)

// ---------------------------------------------------------------------------------------------------------------
// Parameter table

function label(id) {
    return names.has(id) ? `"${names.get(id)}"` : `#${id}`
}

function buildParams(params) {
    paramsView.textContent = ""
    rows.clear()
    const select = document.getElementById("automate")
    select.textContent = ""
    for (const p of params) {
        names.set(p.id, p.name)
        if (!values.has(p.id)) values.set(p.id, p.value)
        const root = document.createElement("div")
        root.className = "param"
        const name = document.createElement("span")
        name.className = "name"
        name.textContent = p.name
        const range = document.createElement("input")
        range.type = "range"
        range.min = "0"; range.max = "1"; range.step = "0.001"
        range.value = String(values.get(p.id))
        const value = document.createElement("span")
        value.className = "value"
        value.textContent = Number(range.value).toFixed(3)
        range.addEventListener("input", () => {
            const v = Number(range.value)
            values.set(p.id, v)
            value.textContent = v.toFixed(3)
            sendParam(p.id, v)
        })
        root.append(name, range, value)
        paramsView.append(root)
        rows.set(p.id, {root, range, value})

        const option = document.createElement("option")
        option.value = String(p.id)
        option.textContent = p.name
        select.append(option)
    }
    const cutoff = params.find(p => /cutoff/i.test(p.name))
    if (cutoff) select.value = String(cutoff.id)
    applyFilter()
}

function updateRow(id, value, flash) {
    const row = rows.get(id)
    if (!row) return
    row.range.value = String(value)
    row.value.textContent = value.toFixed(3)
    if (flash) {
        row.root.classList.add("flash")
        clearTimeout(row.timer)
        row.timer = setTimeout(() => row.root.classList.remove("flash"), 300)
    }
}

function applyFilter() {
    const q = document.getElementById("filter").value.trim().toLowerCase()
    for (const [id, row] of rows) row.root.hidden = q !== "" && !names.get(id).toLowerCase().includes(q)
}
document.getElementById("filter").addEventListener("input", applyFilter)

// ---------------------------------------------------------------------------------------------------------------
// Automation: the host moves a parameter, the editor must follow.

let automation = null
document.getElementById("automateToggle").addEventListener("click", event => {
    if (automation) {
        clearInterval(automation)
        automation = null
        event.target.textContent = "Start"
        return
    }
    const id = Number(document.getElementById("automate").value)
    const start = performance.now()
    automation = setInterval(() => {
        const v = 0.5 + 0.45 * Math.sin((performance.now() - start) / 1000 * Math.PI)
        values.set(id, v)
        updateRow(id, v, false)
        sendParam(id, v)
    }, 1000 / 30)
    event.target.textContent = "Stop"
})

// ---------------------------------------------------------------------------------------------------------------
// State and window lifecycle

document.getElementById("saveState").addEventListener("click", () => {
    if (!stateBlob) return
    storedState = stateBlob.slice()
    document.getElementById("recallState").disabled = false
    document.getElementById("stateInfo").textContent = `stored ${storedState.byteLength} bytes`
})
document.getElementById("recallState").addEventListener("click", () => {
    if (!storedState) return
    stateBlob = storedState.slice()
    sendState(stateBlob)
})
document.getElementById("reopen").addEventListener("click", () => {
    log("out", "— window closed, reopening —")
    frame.src = "about:blank"
    setTimeout(() => { frame.src = "plugin/index.html" }, 100)
})

// ---------------------------------------------------------------------------------------------------------------
// Log

const MAX_LOG = 300
let lastLine = null, repeat = 0
function log(direction, text) {
    counts[direction]++
    document.getElementById("counts").textContent = `${counts.in} in · ${counts.out} out`
    const key = direction + text.replace(/=.*$/, "")
    if (lastLine && lastLine.dataset.key === key) { // collapse drags into one line
        repeat++
        lastLine.textContent = `${direction === "in" ? "UI → DSP" : "DSP → UI"}  ${text}  (×${repeat + 1})`
        return
    }
    repeat = 0
    const line = document.createElement("div")
    line.className = direction
    line.dataset.key = key
    line.textContent = `${direction === "in" ? "UI → DSP" : "DSP → UI"}  ${text}`
    logView.append(line)
    lastLine = line
    while (logView.childElementCount > MAX_LOG) logView.firstElementChild.remove()
    logView.scrollTop = logView.scrollHeight
}
document.getElementById("clearLog").addEventListener("click", () => { logView.textContent = ""; lastLine = null })
