/*
    Odin 2 editor as ui.wasm.

    The stand-in processor is Odin's own OdinAudioProcessor, never processing audio, as in the OB-Xf and RipplerX
    ports. Parameters go through the kit's generic path. Odin keeps the rest of a patch in child trees of its value
    tree, which the editor edits directly; the glue for that and the rest lives here (frames in odin2_frames.h):

      - patch loads (browser, init button): the editor calls readPatch, which this side forwards as a readPatch
        frame, so the DSP side loads the patch itself
      - tree edits (mod matrix, drawn waveforms, FX order, play mode, ...): a mirror holds what the DSP side has,
        each frame sends the properties that differ
      - the tuning (part of the state, not of the tree): sent when its text changes
      - the arpeggiator's step LED and the wheels as MIDI moved them: from the DSP side's frames
      - the editor reads the patch only when it is constructed, so it is created once the DSP side's snapshot is
        in (or after a second without an answer)

    After a patch load, a remote state or creating the editor, the editor settles (forceValueTreeOntoComponents
    and the components write values back); for a few frames the mirror follows the stand-in instead of sending.
    Frames, not milliseconds: the editor's first frame scales its bitmaps and can take seconds.

    Exports (called from webclap-ui.js):
        wclap_ui_init, wclap_ui_frame, wclap_ui_set_desktop, wclap_ui_mouse, wclap_ui_wheel, wclap_ui_key,
        wclap_ui_focus, wclap_ui_clipboard, wclap_ui_receive, wclap_ui_framebuffer, wclap_ui_dirty_rects,
        wclap_ui_describe, wclap_ui_value_text
*/

#include <emscripten.h>

#include <juce_webclap/juce_webclap.h>
#include <juce_webclap/juce_webclap_bridge.h>

#include "PluginProcessor.h"
#include "odin2_frames.h"
#include "WebFonts.h"

EM_JS (void, wclap_js_send, (const void* data, int size), {
    const host = Module["webclapHost"];
    if (host && host.send) host.send (HEAPU8.slice (data, data + size));
});

namespace
{
using namespace odin2_webclap;

/** The plugin window: the editor sets its own size (zoom menu), the window follows. */
struct Window final : juce::Component, private juce::ComponentListener
{
    explicit Window (std::unique_ptr<juce::AudioProcessorEditor> e) : editor (std::move (e))
    {
        addAndMakeVisible (*editor);
        editor->addComponentListener (this);
        fit();
    }

    ~Window() override { editor->removeComponentListener (this); }

    void fit()
    {
        editor->setTopLeftPosition (0, 0);
        setSize (editor->getWidth(), editor->getHeight());
    }

    void componentMovedOrResized (juce::Component&, bool, bool) override { fit(); }

    std::unique_ptr<juce::AudioProcessorEditor> editor;
};

struct App
{
    std::unique_ptr<juce::ScopedJuceInitialiser_GUI> juce;
    std::unique_ptr<OdinAudioProcessor> processor;
    std::unique_ptr<juce::webclap::ProcessorBridge> bridge;
    std::unique_ptr<Window> window;
    std::map<juce::String, juce::ValueTree> mirror; // the child trees as the DSP side has them
    juce::String sentScl, sentKbm;
    int settleFrames = 0;
    bool applyingRemote = false; // inside a frame from the DSP side
    bool patchSent = false;      // a readPatch frame went out since the last frame
    int lastWidth = 0, lastHeight = 0;
    double pixelRatio = 1.0, startTime = -1.0;
};

App* app = nullptr;

constexpr int framesToSettle = 10;

void sendToHost (const void* data, size_t size) { wclap_js_send (data, (int) size); }

/** Takes what the stand-in has as what the DSP side has, for the next framesToSettle frames. */
void settle()
{
    app->settleFrames = framesToSettle;
}

void createWindow()
{
    std::unique_ptr<juce::AudioProcessorEditor> editor (app->processor->createEditorIfNeeded());

    if (editor == nullptr)
        return;

    app->window = std::make_unique<Window> (std::move (editor));
    app->lastWidth = app->window->getWidth();
    app->lastHeight = app->window->getHeight();
    juce::webclap::setDesktop (app->lastWidth, app->lastHeight, app->pixelRatio);

    app->window->addToDesktop (0);
    app->window->setVisible (true);
    app->bridge->sendResize (app->lastWidth, app->lastHeight);
    settle();
}

void sendTreeProperty (const juce::String& child, const juce::Identifier& property, const juce::var& value)
{
    juce::MemoryOutputStream out;
    out.writeString (child); // writeString includes the terminating 0, operator<< does not
    out.writeString (property.toString());
    value.writeToStream (out);
    app->bridge->sendPluginFrame (tree, out.getData(), out.getDataSize());
}

/** The glue that is not parameters, once per frame. */
void syncNonParameterState()
{
    auto& p = *app->processor;
    const auto settling = app->settleFrames > 0;

    for (const auto* name : trees)
    {
        const auto child = p.getValueTreeState().state.getChildWithName (name);
        auto& known = app->mirror[name];

        if (settling || ! known.isValid())
        {
            known = child.createCopy();
            continue;
        }

        for (int i = 0; i < child.getNumProperties(); ++i)
        {
            const auto property = child.getPropertyName (i);
            const auto& value = child[property];

            if (! known.hasProperty (property) || known[property] != value)
            {
                known.setProperty (property, value, nullptr);
                sendTreeProperty (name, property, value);
            }
        }
    }

    const auto& scl = p.m_tuning.scale.rawText;
    const auto& kbm = p.m_tuning.keyboardMapping.rawText;

    if (settling)
    {
        app->sentScl = scl;
        app->sentKbm = kbm;
    }
    else if (app->sentScl != juce::StringRef (scl) || app->sentKbm != juce::StringRef (kbm))
    {
        app->sentScl = scl;
        app->sentKbm = kbm;
        juce::MemoryOutputStream out;
        out.writeString (app->sentScl);
        out.writeString (app->sentKbm);
        app->bridge->sendPluginFrame (tuning, out.getData(), out.getDataSize());
    }
}

void onPluginFrame (juce::uint8 type, const juce::uint8* payload, size_t size)
{
    auto& p = *app->processor;

    if (type == arpStep && size == sizeof (int32_t))
    {
        int32_t step;
        std::memcpy (&step, payload, sizeof (step));
        p.m_step_led_active.set (step);
    }
    else if (type == wheels && size == 2 * sizeof (float))
    {
        float values[2];
        std::memcpy (values, payload, sizeof (values));
        auto& state = p.getValueTreeState();
        state.getRawParameterValue ("pitchbend")->store (values[0]);
        state.getRawParameterValue ("modwheel")->store (values[1]);
        p.updatePitchWheelGUI (values[0]);
        p.updateModWheelGUI (values[1]);
    }
}
} // namespace

extern "C"
{
EMSCRIPTEN_KEEPALIVE void wclap_ui_set_screen (int width, int height)
{
    juce::webclap::setScreenSize (width, height);
}

EMSCRIPTEN_KEEPALIVE int wclap_ui_init (double pixelRatio)
{
    if (app != nullptr)
        return 1;

    app = new App();
    app->pixelRatio = pixelRatio;

    juce::webclap::registerFont (WebFonts::DejaVuSans_ttf, (size_t) WebFonts::DejaVuSans_ttfSize, true);
    juce::webclap::registerFont (WebFonts::DejaVuSansBold_ttf, (size_t) WebFonts::DejaVuSansBold_ttfSize);
    juce::webclap::setDesktop (16, 16, pixelRatio);

    app->juce = std::make_unique<juce::ScopedJuceInitialiser_GUI>();

    app->processor = std::make_unique<OdinAudioProcessor>();
    app->processor->setRateAndBufferSizeDetails (48000.0, 512);
    app->processor->prepareToPlay (48000.0, 512);

    app->bridge = std::make_unique<juce::webclap::ProcessorBridge> (*app->processor, sendToHost);
    app->bridge->onRemoteState = [] { settle(); };
    app->bridge->onPluginFrame = onPluginFrame;

    app->processor->onReadPatch = [] (const juce::ValueTree& patch)
    {
        if (app->applyingRemote)
            return; // a state from the DSP side (setStateInformation reads it as a patch): it has it already

        juce::MemoryOutputStream out;
        patch.writeToStream (out);
        app->bridge->sendPluginFrame (readPatch, out.getData(), out.getDataSize());
        app->patchSent = true;
        settle();
    };

    // The mirror and the tuning start as the stand-in's init patch, which the DSP side has as well
    settle();
    syncNonParameterState();

    // The editor follows in wclap_ui_frame, once the DSP side's patch is in
    app->bridge->sendHello();
    return 1;
}

/** Returns the number of dirty rectangles to copy to the canvas. */
EMSCRIPTEN_KEEPALIVE int wclap_ui_frame (double timeMs)
{
    if (app == nullptr)
        return 0;

    if (app->startTime < 0)
        app->startTime = timeMs;

    if (app->window == nullptr && (app->bridge->getSnapshotsReceived() > 0 || timeMs - app->startTime > 1000.0))
        createWindow();

    const auto changed = juce::webclap::tick (timeMs);
    syncNonParameterState();
    app->settleFrames = juce::jmax (0, app->settleFrames - 1);

    // The DSP side loads the patch itself: the values it set on the stand-in are not news there
    if (std::exchange (app->patchSent, false))
        app->bridge->assumeRemoteHasCurrentValues();

    app->bridge->flush();

    if (app->window != nullptr && (app->window->getWidth() != app->lastWidth || app->window->getHeight() != app->lastHeight))
    {
        app->lastWidth = app->window->getWidth();
        app->lastHeight = app->window->getHeight();
        app->bridge->sendResize (app->lastWidth, app->lastHeight);
    }

    return changed ? (int) juce::webclap::getDirtyRects().size() : 0;
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_set_desktop (int width, int height, double pixelRatio)
{
    if (app != nullptr)
        app->pixelRatio = pixelRatio;

    juce::webclap::setDesktop (width, height, pixelRatio);
}

EMSCRIPTEN_KEEPALIVE const uint8_t* wclap_ui_framebuffer() { return juce::webclap::getFramebuffer(); }
EMSCRIPTEN_KEEPALIVE int wclap_ui_framebuffer_width()      { return juce::webclap::getFramebufferWidth(); }
EMSCRIPTEN_KEEPALIVE int wclap_ui_framebuffer_height()     { return juce::webclap::getFramebufferHeight(); }

/** x, y, width, height per rectangle, physical pixels. */
EMSCRIPTEN_KEEPALIVE const int* wclap_ui_dirty_rects()
{
    return reinterpret_cast<const int*> (juce::webclap::getDirtyRects().data());
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_mouse (int type, float x, float y, int buttons, int modifiers)
{
    juce::webclap::mouse ((juce::webclap::MouseEventType) type, x, y, buttons, modifiers);
}

EMSCRIPTEN_KEEPALIVE int wclap_ui_wheel (float x, float y, float deltaX, float deltaY, int isSmooth, int modifiers)
{
    return juce::webclap::wheel (x, y, deltaX, deltaY, isSmooth != 0, modifiers) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int wclap_ui_key (int isDown, int keyCode, int textCharacter, int modifiers)
{
    return juce::webclap::key (isDown != 0, keyCode, (juce::juce_wchar) textCharacter, modifiers) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_focus (int hasFocus) { juce::webclap::focus (hasFocus != 0); }

EMSCRIPTEN_KEEPALIVE void wclap_ui_clipboard (const char* utf8)
{
    juce::webclap::setClipboardText (juce::String::fromUTF8 (utf8));
}

/** A protocol frame from the DSP side (relayed by the host). */
EMSCRIPTEN_KEEPALIVE void wclap_ui_receive (const uint8_t* data, int size)
{
    if (app == nullptr)
        return;

    const juce::ScopedValueSetter<bool> remote (app->applyingRemote, true);
    app->bridge->receive (data, (size_t) size);
}

/** Parameter list as JSON, for test hosts that have no DSP module to ask. Not part of the protocol. */
EMSCRIPTEN_KEEPALIVE const char* wclap_ui_describe()
{
    static std::string json;

    if (app == nullptr)
        return "[]";

    juce::Array<juce::var> list;

    for (auto* parameter : app->processor->getParameters())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", (juce::int64) juce::webclap::ProcessorBridge::clapIdFor (*parameter));
        object->setProperty ("name", parameter->getName (64));
        object->setProperty ("value", parameter->getValue());
        object->setProperty ("text", parameter->getCurrentValueAsText());
        list.add (juce::var (object));
    }

    json = juce::JSON::toString (juce::var (list), true).toStdString();
    return json.c_str();
}

/** Display text for a normalised value, for the same test hosts. */
EMSCRIPTEN_KEEPALIVE const char* wclap_ui_value_text (uint32_t clapId, double value)
{
    static std::string text;

    if (app == nullptr)
        return "";

    if (auto* parameter = app->bridge->findParameter (clapId))
        text = parameter->getText ((float) value, 32).toStdString();
    else
        text.clear();

    return text.c_str();
}
}
