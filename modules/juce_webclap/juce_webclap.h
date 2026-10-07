/*
    juce_webclap: run a JUCE editor in a browser canvas, single-threaded, with JUCE's software renderer.

    The embedding app (the plugin's ui.wasm) exports a few C functions that call into this API:

        init     -> registerFont(...) for the default font, setDesktop(...), create the editor, addToDesktop
        frame    -> tick(now) once per animation frame, then copy getDirtyRects() of getFramebuffer() to the canvas
        input    -> mouse(...), wheel(...), key(...), focus(...)

    Callbacks to the page (cursor, size requests, clipboard, text input) go through Module.webclapHost, see
    js/webclap-ui.js.

    Build: compile juce_events_wasm.cpp, juce_graphics_wasm.cpp and juce_gui_basics_wasm.cpp in place of the
    JUCE module files of the same name, with this module's parent directory on the include path and JUCE
    patched by patches/juce-*.patch.
*/

#pragma once

#include <juce_core/juce_core.h>

#include <cstdint>
#include <vector>

namespace juce::webclap
{
    struct DirtyRect
    {
        int x, y, width, height;
    };

    enum class MouseEventType
    {
        move = 0,
        down = 1,
        up = 2,
        leave = 3
    };

    /** Registers a TrueType/OpenType font from memory. Browsers have no system fonts, so the kit needs at least
        one font for JUCE's default sans-serif. The first registered font is the default unless another is
        registered with makeDefault. */
    void registerFont (const void* data, size_t numBytes, bool makeDefault = false);

    /** Screen space the page can give the plugin window, in CSS pixels (screen.availWidth/Height). JUCE sees
        it as the display size, so editors offer zoom levels up to it. */
    void setScreenSize (int width, int height);

    /** Size of the canvas in CSS pixels, and the device pixel ratio. Windows paint at that ratio. */
    void setDesktop (int logicalWidth, int logicalHeight, double pixelRatio);

    /** Runs one frame: queued messages, due timers, vblank listeners, repaints and compositing.
        Returns true if parts of the framebuffer changed (see getDirtyRects). */
    bool tick (double timeMs);

    /** Dispatches the messages queued now. tick() does this too. */
    int dispatchPendingMessages();

    /** The composited desktop, RGBA, getFramebufferWidth() * getFramebufferHeight() pixels. */
    const uint8_t* getFramebuffer();
    int getFramebufferWidth();
    int getFramebufferHeight();

    /** Physical pixel rectangles that changed in the last tick(). */
    const std::vector<DirtyRect>& getDirtyRects();

    /** Pointer input in CSS pixels relative to the canvas. buttons as in PointerEvent.buttons,
        modifiers: 1 shift, 2 ctrl, 4 alt, 8 meta. */
    void mouse (MouseEventType type, float x, float y, int buttons, int modifiers);

    /** Wheel deltas in JUCE units (positive deltaY scrolls up). */
    void wheel (float x, float y, float deltaX, float deltaY, bool isSmooth, int modifiers);

    /** Key input. keyCode uses the KeyPress codes of this platform (see juce_wasm_Windowing.cpp),
        textCharacter is the produced character or 0. Returns true if a component used the key. */
    bool key (bool isDown, int keyCode, juce_wchar textCharacter, int modifiers);

    /** Canvas focus changed. */
    void focus (bool hasFocus);

    /** Text the page read from the system clipboard (paste events), returned by SystemClipboard. */
    void setClipboardText (const String& text);
}
