// juce_webclap test host, page side: loads a WebCLAP bundle, runs its module.wasm in an AudioWorklet
// (clap-host-worklet.js) and shows its webview page in an iframe, relaying messages like a real host.
//
// The bundle comes from ?bundle=<dir>, else the first entry of bundles.json (written by the build).

"use strict"

const TYPES = {1: "hello", 2: "snapshot", 3: "param", 4: "gesture", 5: "state", 6: "stream", 7: "resize"}

const frame = document.getElementById("plugin")
const paramsView = document.getElementById("params")
const logView = document.getElementById("log")
const rows = new Map()   // clapId -> {root, range, value, info}
const counts = {in: 0, out: 0}
let bundle = null, node = null, context = null, storedState = null

// ---------------------------------------------------------------------------------------------------------------
// Start

async function start() {
    bundle = new URLSearchParams(location.search).get("bundle")
    if (!bundle) bundle = (await (await fetch("bundles.json")).json())[0]
    bundle = bundle.replace(/\/$/, "")

    context = new AudioContext({latencyHint: "interactive"})
    await context.audioWorklet.addModule("clap-host-worklet.js")
    node = new AudioWorkletNode(context, "clap-host", {numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]})
    node.connect(context.destination)
    node.port.onmessage = event => fromWorklet(event.data)

    const bytes = await (await fetch(`${bundle}/module.wasm`)).arrayBuffer()
    node.port.postMessage({type: "load", bytes}, [bytes])
    updateAudioButton()
}

function updateAudioButton() {
    const button = document.getElementById("audio")
    const running = context && context.state === "running"
    button.textContent = running ? `Audio on · ${context.sampleRate} Hz` : "Start audio"
    button.classList.toggle("on", running)
}

function resumeAudio() {
    if (context && context.state !== "running") context.resume().then(updateAudioButton)
}
document.getElementById("audio").addEventListener("click", () => {
    if (context.state === "running") context.suspend().then(updateAudioButton)
    else resumeAudio()
})
// Clicks into the plugin window count as a user gesture for the parent too
window.addEventListener("blur", () => setTimeout(() => document.activeElement === frame && resumeAudio()))
for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, resumeAudio)

// ---------------------------------------------------------------------------------------------------------------
// Worklet (the plugin)

function fromWorklet(m) {
    switch (m.type) {
        case "loaded": {
            const d = m.descriptor
            document.getElementById("title").innerHTML = ""
            document.getElementById("title").append(d.name, Object.assign(document.createElement("span"),
                {textContent: `${d.vendor} · ${d.version} · ${d.id} · ${m.params.length} parameters · WebCLAP test host`}))
            document.title = `${d.name} · WebCLAP test host`
            buildParams(m.params)
            if (m.hasGui) openGui()
            break
        }
        case "gui":
            if (!m.uri) { log("in", "plugin has no webview page"); break }
            setWindowSize(m.width, m.height)
            frame.src = `${bundle}/${m.uri.replace(/^\//, "")}`
            break
        case "send":
            logFrame("out", m.bytes)
            if (frame.contentWindow) frame.contentWindow.postMessage(m.bytes, "*", [m.bytes])
            break
        case "resize":
            setWindowSize(m.width, m.height)
            log("out", `request_resize ${m.width} × ${m.height}`, "host")
            break
        case "paramOut":
            updateRow(m.id, m.value, m.text, true)
            log("out", `param event ${label(m.id)} = ${m.text}`, "host")
            break
        case "gesture": {
            const row = rows.get(m.id)
            if (row) row.root.classList.toggle("gesture", m.begin)
            log("out", `gesture event ${label(m.id)} ${m.begin ? "begin" : "end"}`, "host")
            break
        }
        case "params":
            for (const p of m.params) updateRow(p.id, p.value, p.text, false)
            log("out", "params rescan", "host")
            break
        case "valueText": {
            const row = rows.get(m.id)
            if (row) row.value.textContent = m.text
            break
        }
        case "state":
            storedState = m.bytes
            document.getElementById("loadState").disabled = !storedState
            document.getElementById("stateInfo").textContent = storedState ? `saved ${storedState.byteLength} bytes` : "save failed"
            break
        case "dirty":
            document.getElementById("stateInfo").textContent = "state dirty (mark_dirty)"
            break
        case "log":
            console.log("[plugin]", m.line)
            break
        case "error":
            console.error("[plugin]", m.message)
            log("in", `ERROR ${m.message.split("\n")[0]}`, "host")
            break
    }
}

function openGui() { node.port.postMessage({type: "openGui"}) }

function setWindowSize(width, height) {
    frame.style.width = `${width}px`
    frame.style.height = `${height}px`
    document.getElementById("windowSize").textContent = `${width} × ${height}`
}

// ---------------------------------------------------------------------------------------------------------------
// Page relay: protocol frames are ArrayBuffers, the page's JSON debug messages carry stats

window.addEventListener("message", event => {
    if (event.source !== frame.contentWindow) return
    const data = event.data
    const bytes = data instanceof ArrayBuffer ? data
        : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : null
    if (bytes) {
        logFrame("in", bytes)
        node.port.postMessage({type: "receive", bytes}, [bytes])
    } else if (data && data.webclapDebug) {
        debug(data)
    }
})

let statsWindow = []
function debug(message) {
    if (message.webclapDebug === "ready") document.getElementById("stats").dataset.init = `UI init ${message.initMs.toFixed(0)} ms`
    else if (message.webclapDebug === "stats") statsWindow.push({...message.stats, t: performance.now()})
    else if (message.webclapDebug === "error") log("in", `UI ERROR ${message.message}`, "host")
}

setInterval(() => {
    const now = performance.now()
    statsWindow = statsWindow.filter(s => now - s.t < 1000)
    const el = document.getElementById("stats")
    const n = statsWindow.length
    const init = el.dataset.init || ""
    if (!n) { el.textContent = init; return }
    const avg = key => statsWindow.reduce((sum, s) => sum + s[key], 0) / n
    el.textContent = `${init} · ${n} fps · tick ${avg("tickMs").toFixed(2)} ms · blit ${avg("blitMs").toFixed(2)} ms`
}, 500)

// ---------------------------------------------------------------------------------------------------------------
// Parameters

function label(id) {
    const row = rows.get(id)
    return row ? `"${row.info.name}"` : `#${id}`
}

function buildParams(params) {
    paramsView.textContent = ""
    rows.clear()
    const select = document.getElementById("automate")
    select.textContent = ""
    let module = null
    for (const p of params) {
        if (p.module !== module) {
            module = p.module
            paramsView.append(Object.assign(document.createElement("div"), {className: "module", textContent: module || "—"}))
        }
        const root = document.createElement("div")
        root.className = "param"
        const name = Object.assign(document.createElement("span"), {className: "name", textContent: p.name})
        const range = Object.assign(document.createElement("input"), {type: "range", min: p.min, max: p.max,
            step: (p.flags & 1) ? 1 : (p.max - p.min) / 1000, value: p.value})
        const value = Object.assign(document.createElement("span"), {className: "value", textContent: p.text})
        range.addEventListener("input", () => setParam(p.id, Number(range.value)))
        root.append(name, range, value)
        paramsView.append(root)
        rows.set(p.id, {root, range, value, info: p})
        select.append(Object.assign(document.createElement("option"), {value: String(p.id), textContent: p.name}))
    }
    const cutoff = params.find(p => /cutoff/i.test(p.name))
    if (cutoff) select.value = String(cutoff.id)
    applyFilter()
}

function setParam(id, value) {
    node.port.postMessage({type: "param", id, value})
    node.port.postMessage({type: "valueText", id, value})
    const row = rows.get(id)
    if (row) row.range.value = String(value)
}

function updateRow(id, value, text, flash) {
    const row = rows.get(id)
    if (!row) return
    row.range.value = String(value)
    row.value.textContent = text
    if (flash) {
        row.root.classList.add("flash")
        clearTimeout(row.timer)
        row.timer = setTimeout(() => row.root.classList.remove("flash"), 300)
    }
}

function applyFilter() {
    const q = document.getElementById("filter").value.trim().toLowerCase()
    for (const row of rows.values())
        row.root.hidden = q !== "" && !`${row.info.module} ${row.info.name}`.toLowerCase().includes(q)
}
document.getElementById("filter").addEventListener("input", applyFilter)

// Automation: the host moves a parameter, the editor must follow
let automation = null
document.getElementById("automateToggle").addEventListener("click", event => {
    if (automation) {
        clearInterval(automation)
        automation = null
        event.target.textContent = "Start"
        return
    }
    const id = Number(document.getElementById("automate").value)
    const row = rows.get(id)
    const start = performance.now()
    automation = setInterval(() => {
        const t = 0.5 + 0.45 * Math.sin((performance.now() - start) / 1000 * Math.PI)
        setParam(id, row.info.min + t * (row.info.max - row.info.min))
    }, 1000 / 30)
    event.target.textContent = "Stop"
})

// ---------------------------------------------------------------------------------------------------------------
// State, window, host options

document.getElementById("saveState").addEventListener("click", () => node.port.postMessage({type: "saveState"}))
document.getElementById("loadState").addEventListener("click", () => {
    if (!storedState) return
    const bytes = storedState.slice(0)
    log("in", `state load ${bytes.byteLength} bytes`, "host")
    node.port.postMessage({type: "loadState", bytes}, [bytes])
})
document.getElementById("reopen").addEventListener("click", () => {
    log("out", "— window closed, reopening —", "host")
    node.port.postMessage({type: "closeGui"})
    frame.src = "about:blank"
    setTimeout(openGui, 100)
})
document.getElementById("callbacks").addEventListener("change", event =>
    node.port.postMessage({type: "honourCallbacks", value: event.target.checked}))

// ---------------------------------------------------------------------------------------------------------------
// Notes: on-screen keyboard, computer keys, Web MIDI

const keyboard = document.getElementById("keyboard")
const heldKeys = new Map()   // key -> element
let octave = 4

function note(key, on, velocity = 0.8) {
    node.port.postMessage({type: "note", on, key, velocity: on ? velocity : 0})
    const el = keyboard.querySelector(`[data-key="${key}"]`)
    if (el) el.classList.toggle("down", on)
}

for (let key = 36; key < 36 + 61; key++) {
    const black = [1, 3, 6, 8, 10].includes(key % 12)
    const el = Object.assign(document.createElement("div"), {className: black ? "black" : "white"})
    el.dataset.key = key
    el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); note(key, true) })
    el.addEventListener("pointerup", () => note(key, false))
    el.addEventListener("pointercancel", () => note(key, false))
    keyboard.append(el)
}

const COMPUTER_KEYS = "awsedftgyhujk"
window.addEventListener("keydown", e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.target.tagName === "INPUT") return
    if (e.key === "z") octave = Math.max(1, octave - 1)
    if (e.key === "x") octave = Math.min(8, octave + 1)
    const i = COMPUTER_KEYS.indexOf(e.key)
    if (i >= 0 && !heldKeys.has(e.key)) {
        const key = 12 * (octave + 1) + i
        heldKeys.set(e.key, key)
        note(key, true)
    }
})
window.addEventListener("keyup", e => {
    if (heldKeys.has(e.key)) {
        note(heldKeys.get(e.key), false)
        heldKeys.delete(e.key)
    }
})

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(access => {
        const attach = () => {
            const names = []
            for (const input of access.inputs.values()) {
                names.push(input.name)
                input.onmidimessage = e => {
                    const [status, a, b] = e.data
                    if (status >= 0xf0) return
                    node.port.postMessage({type: "midi", data: [status, a ?? 0, b ?? 0]})
                }
            }
            document.getElementById("midi").textContent = names.length ? `MIDI in: ${names.join(", ")}` : "No MIDI inputs"
        }
        access.onstatechange = attach
        attach()
    }).catch(() => { document.getElementById("midi").textContent = "Web MIDI not allowed" })
}

// ---------------------------------------------------------------------------------------------------------------
// Log. "in" is UI → plugin, "out" is plugin → UI, host-side events are marked as such.

function logFrame(direction, buffer) {
    const view = new DataView(buffer)
    const type = view.getUint8(0)
    const name = TYPES[type] || `type ${type}`
    let text = `${name} ${buffer.byteLength} bytes`
    if (type === 3 && buffer.byteLength >= 16) text = `param ${label(view.getUint32(4, true))} = ${view.getFloat64(8, true).toFixed(4)}`
    else if (type === 4 && buffer.byteLength >= 9) text = `gesture ${label(view.getUint32(4, true))} ${view.getUint8(8) ? "begin" : "end"}`
    else if (type === 2) text = `snapshot ${view.getUint32(4, true)} values, ${buffer.byteLength} bytes`
    else if (type === 7) text = `resize ${view.getUint32(4, true)} × ${view.getUint32(8, true)}`
    log(direction, text)
}

const MAX_LOG = 300
let lastLine = null, repeat = 0
function log(direction, text, kind = "page") {
    counts[direction]++
    document.getElementById("counts").textContent = `${counts.in} in · ${counts.out} out`
    const prefix = kind === "host" ? "host  " : direction === "in" ? "UI → DSP" : "DSP → UI"
    const key = prefix + text.replace(/=.*$/, "")
    if (lastLine && lastLine.dataset.key === key) { // collapse drags into one line
        repeat++
        lastLine.textContent = `${prefix}  ${text}  (×${repeat + 1})`
        return
    }
    repeat = 0
    const line = Object.assign(document.createElement("div"), {className: kind === "host" ? "host" : direction})
    line.dataset.key = key
    line.textContent = `${prefix}  ${text}`
    logView.append(line)
    lastLine = line
    while (logView.childElementCount > MAX_LOG) logView.firstElementChild.remove()
    logView.scrollTop = logView.scrollHeight
}
document.getElementById("clearLog").addEventListener("click", () => { logView.textContent = ""; lastLine = null })

start().catch(error => {
    console.error(error)
    document.getElementById("title").lastChild.textContent = `failed: ${error.message}`
})
