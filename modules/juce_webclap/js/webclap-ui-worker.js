// juce_webclap: the worker that runs ui.wasm and paints into the transferred OffscreenCanvas.
//
// The page drives it: one "frame" message per animation frame, and the next one only after this worker
// answered "frameDone", so a slow frame never queues up more work. Input arrives as small messages.

"use strict"

let module = null
let canvas = null
let context = null
let imageData = null
let imageDataKey = ""
let pixelRatio = 1

const post = (message, transfer) => self.postMessage(message, transfer || [])

function framebufferImage() {
    const ptr = module._wclap_ui_framebuffer()
    const width = module._wclap_ui_framebuffer_width()
    const height = module._wclap_ui_framebuffer_height()
    const key = `${module.HEAPU8.buffer.byteLength}:${ptr}:${width}:${height}`
    if (key !== imageDataKey) { // memory grew or the desktop was resized: the old view is stale
        imageDataKey = key
        imageData = new ImageData(new Uint8ClampedArray(module.HEAPU8.buffer, ptr, width * height * 4), width, height)
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
        }
    }
    return imageData
}

function frame(time) {
    const start = performance.now()
    const count = module._wclap_ui_frame(time)
    const ticked = performance.now()
    let pixels = 0
    if (count > 0) {
        const image = framebufferImage()
        const rects = module._wclap_ui_dirty_rects() >> 2
        for (let i = 0; i < count; i++) {
            const x = module.HEAP32[rects + i * 4], y = module.HEAP32[rects + i * 4 + 1]
            const w = module.HEAP32[rects + i * 4 + 2], h = module.HEAP32[rects + i * 4 + 3]
            context.putImageData(image, 0, 0, x, y, w, h)
            pixels += w * h
        }
    }
    const end = performance.now()
    post({type: "frameDone", stats: {tickMs: ticked - start, blitMs: end - ticked, rects: count, pixels}})
}

function withString(text, fn) {
    const ptr = module.stringToNewUTF8(text)
    try { fn(ptr) } finally { module._free(ptr) }
}

function receive(bytes) {
    const ptr = module._malloc(bytes.byteLength)
    module.HEAPU8.set(bytes, ptr)
    module._wclap_ui_receive(ptr, bytes.byteLength)
    module._free(ptr)
}

async function init(message) {
    importScripts(message.moduleUrl)
    canvas = message.canvas
    context = canvas.getContext("2d", {alpha: false})
    pixelRatio = message.pixelRatio
    const host = {
        send: bytes => post({type: "send", bytes}, [bytes.buffer]),
        setCursor: name => post({type: "cursor", name}),
        requestSize: (width, height) => post({type: "requestSize", width, height}),
        copyText: text => post({type: "copyText", text}),
        textInput: (active, x, y) => post({type: "textInput", active, x, y})
    }
    const factory = self[message.factory]
    module = await factory({
        webclapHost: host,
        print: text => console.log(text),
        printErr: text => console.warn(text)
    })
    const t0 = performance.now()
    module._wclap_ui_set_screen(message.screenWidth, message.screenHeight)
    if (!module._wclap_ui_init(pixelRatio)) throw new Error("wclap_ui_init failed")
    const initMs = performance.now() - t0
    const width = Math.round(module._wclap_ui_framebuffer_width() / pixelRatio)
    const height = Math.round(module._wclap_ui_framebuffer_height() / pixelRatio)
    let params = null
    if (module._wclap_ui_describe) {
        try { params = JSON.parse(module.UTF8ToString(module._wclap_ui_describe())) } catch (e) { params = null }
    }
    post({type: "ready", width, height, initMs, params})
}

self.onmessage = event => {
    const m = event.data
    try {
        switch (m.type) {
            case "init": init(m).catch(error => post({type: "error", message: String(error && error.stack || error)})); break
            case "frame":
                // Always answer, or the page stops sending frames after one failure.
                try { if (module) frame(m.time); else post({type: "frameDone", stats: null}) }
                catch (error) {
                    post({type: "frameDone", stats: null})
                    throw error
                }
                break
            case "mouse": module && module._wclap_ui_mouse(m.kind, m.x, m.y, m.buttons, m.modifiers); break
            case "wheel": module && module._wclap_ui_wheel(m.x, m.y, m.dx, m.dy, m.smooth ? 1 : 0, m.modifiers); break
            case "key": module && module._wclap_ui_key(m.down ? 1 : 0, m.code, m.char, m.modifiers); break
            case "focus": module && module._wclap_ui_focus(m.focused ? 1 : 0); break
            case "clipboard": module && withString(m.text, ptr => module._wclap_ui_clipboard(ptr)); break
            case "screen": module && module._wclap_ui_set_screen(m.width, m.height); break
            case "desktop":
                pixelRatio = m.pixelRatio
                module && module._wclap_ui_set_desktop(m.width, m.height, m.pixelRatio)
                break
            case "receive": module && receive(new Uint8Array(m.bytes)); break
            case "valueText":
                post({type: "valueText", id: m.id, value: m.value,
                    text: module ? module.UTF8ToString(module._wclap_ui_value_text(m.id, m.value)) : ""})
                break
        }
    } catch (error) {
        post({type: "error", message: String(error && error.stack || error)})
    }
}
