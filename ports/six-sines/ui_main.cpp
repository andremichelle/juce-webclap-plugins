/*
    Six Sines editor as ui.wasm.

    The editor is upstream's SixSinesEditor, unchanged. It is built against a stand-in Synth that never
    processes audio: the editor needs its patchMain, wavetable handoff, queues and session state, and Six
    Sines' preset manager and statics come with it. The Bridge below connects the stand-in's queues to the
    DSP module (dsp_main.cpp), see six_sines_wire.h for the frames.

    Exports (called from webclap-ui.js):
        wclap_ui_init, wclap_ui_frame, wclap_ui_set_desktop, wclap_ui_mouse, wclap_ui_wheel, wclap_ui_key,
        wclap_ui_focus, wclap_ui_clipboard, wclap_ui_receive, wclap_ui_framebuffer, wclap_ui_dirty_rects,
        wclap_ui_describe, wclap_ui_value_text
*/

#include <emscripten.h>

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_webclap/juce_webclap.h>

#include "synth/synth.h"
#include "ui/six-sines-editor.h"
#include "sst/plugininfra/patch-support/patch_base_clap_adapter.h"

#include "six_sines_wire.h"
#include "WebFonts.h"

EM_JS(void, wclap_js_send, (const void *data, int size), {
    const host = Module["webclapHost"];
    if (host && host.send) host.send(HEAPU8.slice(data, data + size));
});

namespace
{
namespace ss = baconpaul::six_sines;
namespace wire = six_sines_webclap::wire;
namespace proto = juce::webclap::protocol;

void send(const proto::Writer &w) { wclap_js_send(w.bytes.data(), (int)w.bytes.size()); }

/*
    The clap_host the editor sees. It asks the host to re-read parameter info after a macro rename and
    to flush; the DSP module does both itself when the change arrives, so here they do nothing.
*/
const clap_host_params_t hostParams{
    [](const clap_host_t *, clap_param_rescan_flags) {},
    [](const clap_host_t *, clap_id, clap_param_clear_flags) {},
    [](const clap_host_t *) {}};

const clap_host_t stubHost{
    CLAP_VERSION,
    nullptr,
    "WebCLAP",
    "",
    "",
    "",
    [](const clap_host_t *, const char *id) -> const void *
    { return std::strcmp(id, CLAP_EXT_PARAMS) == 0 ? &hostParams : nullptr; },
    [](const clap_host_t *) {},
    [](const clap_host_t *) {},
    [](const clap_host_t *) {}};

//==============================================================================================================
/*
    Connects the stand-in Synth to the DSP module. Per frame, flush() sends what the editor queued for the
    engine (toAudio), the patch meta when it changed and the analyzer's subscription; receive() feeds the
    engine's answers to the editor (toMain) and loads patches the DSP side sends.
*/
struct Bridge
{
    explicit Bridge(ss::Synth &s) : synth(s) {}

    void sendHello()
    {
        proto::Writer w(proto::hello);
        w.u32(proto::version);
        send(w);
    }

    void sendResize(int width, int height)
    {
        proto::Writer w(proto::resize);
        w.u32((uint32_t)width);
        w.u32((uint32_t)height);
        send(w);
    }

    void receive(const void *data, size_t size)
    {
        proto::Reader r(data, size);
        const auto type = r.get<uint8_t>();
        r.get<uint8_t>();
        r.get<uint16_t>();
        if (!r.ok)
            return;

        switch (type)
        {
        case proto::snapshot:
        {
            r.get<uint32_t>(); // no parameter list
            auto n = r.get<uint32_t>();
            if (r.ok && r.has(n))
                loadPatch(std::string(reinterpret_cast<const char *>(r.p), n));
            synced = true;
            break;
        }
        case proto::state:
            loadPatch(std::string(reinterpret_cast<const char *>(r.p), (size_t)(r.end - r.p)));
            break;
        case wire::toMain:
        {
            auto count = r.get<uint32_t>();
            for (uint32_t i = 0; i < count && r.ok; ++i)
            {
                auto m = wire::getAudioToMain(r);
                if (r.ok)
                    synth.audioToMain.push(m);
            }
            break;
        }
        case wire::audio:
        {
            auto frames = r.get<uint32_t>();
            if (!r.ok || !r.has((size_t)frames * 8) || !synth.audioOutputRing.subscribed())
                break;
            for (uint32_t i = 0; i < frames; ++i)
            {
                auto left = r.get<float>();
                auto right = r.get<float>();
                synth.audioOutputRing.push(left, right);
            }
            break;
        }
        default:
            break;
        }
    }

    void flush()
    {
        using M = ss::Synth::MainToAudioMsg;

        proto::Writer toAudio(wire::toAudio);
        toAudio.u32(0);
        uint32_t count{0};
        while (auto m = synth.mainToAudio.pop())
        {
            if (m->action == M::SET_WAVETABLE)
            {
                // The editor staged a table it built for the stand-in's audio side. Take it, as the engine
                // would, so the staging slots free up. The DSP module builds its own from patchMeta.
                auto op = synth.wavetableHandoff.opForSlot(m->paramId);
                auto table = synth.wavetableHandoff.consume(m->paramId);
                if (op >= 0 && op < (int)ss::numOps)
                    synth.patch.sourceNodes[op].wavetable = std::move(table);
                continue;
            }

            // Until the DSP side's patch arrived, the editor's state is the stand-in's defaults, not news
            if (!synced && m->action != M::REQUEST_NON_PATCH_STATE)
                continue;

            wire::put(toAudio, *m);
            ++count;
        }
        if (count > 0)
        {
            std::memcpy(toAudio.bytes.data() + 4, &count, sizeof(count));
            send(toAudio);
        }

        if (synced)
        {
            auto meta = wire::metaFingerprint(synth.patchMain, synth.dawStateMain.main);
            if (meta != sentMeta)
            {
                auto blobs = wire::blobsFingerprint(synth.patchMain);
                proto::Writer w(wire::patchMeta);
                wire::putPatchMeta(w, synth.patchMain, synth.dawStateMain.main, blobs != sentBlobs);
                send(w);
                sentMeta = meta;
                sentBlobs = blobs;
            }
        }

        auto scope = synth.audioOutputRing.subscribed();
        if (scope != scopeOn)
        {
            scopeOn = scope;
            proto::Writer w(wire::scope);
            w.u8(scope ? 1 : 0);
            send(w);
        }
    }

    /** What upstream's stateLoad does to patchMain, for a patch from the DSP side. The editor's idle sees
        uiForceRebuild change and rebuilds every widget from patchMain. */
    void loadPatch(const std::string &state)
    {
        auto tmp = std::make_unique<ss::Patch>();
        ss::Synth::DawStateMain loaded{};
        tmp->dawExtraStateFrom = [&](TiXmlElement &e) { ss::Synth::fromDawExtraState(e, loaded); };
        if (!tmp->fromState(state))
            return;

        synth.patchMain.copyValuesFrom(*tmp);
        if (!loaded.main.mpeFromExtraState)
        {
            loaded.audio.mpeActive = synth.patchMain.output.legacyMpeActive.value > 0.5f;
            loaded.audio.mpeBendRange =
                (int)std::round(synth.patchMain.output.legacyMpeBendRange.value);
        }
        synth.dawStateMain = loaded;
        synth.uiForceRebuild++;

        // This is what the DSP side has: not sent back
        sentMeta = wire::metaFingerprint(synth.patchMain, synth.dawStateMain.main);
        sentBlobs = wire::blobsFingerprint(synth.patchMain);
    }

    ss::Synth &synth;
    bool synced{false}, scopeOn{false};
    size_t sentMeta{0}, sentBlobs{0};
};

//==============================================================================================================
/*
    The plugin window. Upstream's CLAP shim sizes its window to the editor's zoom (the editor scales itself
    with a transform), this does the same for the page.
*/
struct Window : juce::Component
{
    explicit Window(std::unique_ptr<ss::ui::SixSinesEditor> e) : editor(std::move(e))
    {
        addAndMakeVisible(*editor);
        editor->setBounds(0, 0, ss::ui::SixSinesEditor::edWidth, ss::ui::SixSinesEditor::edHeight);
        editor->onZoomChanged = [this](float zoom)
        {
            setSize(juce::roundToInt(ss::ui::SixSinesEditor::edWidth * zoom),
                    juce::roundToInt(ss::ui::SixSinesEditor::edHeight * zoom));
        };
        editor->setZoomFactor(editor->zoomFactor);
    }

    std::unique_ptr<ss::ui::SixSinesEditor> editor;
};

struct App
{
    std::unique_ptr<juce::ScopedJuceInitialiser_GUI> juce;
    std::unique_ptr<ss::Synth> synth;
    std::unique_ptr<Bridge> bridge;
    std::unique_ptr<Window> window;
    int lastWidth = 0, lastHeight = 0;
};

App *app = nullptr;
} // namespace

extern "C"
{
EMSCRIPTEN_KEEPALIVE void wclap_ui_set_screen(int width, int height)
{
    juce::webclap::setScreenSize(width, height);
}

EMSCRIPTEN_KEEPALIVE int wclap_ui_init(double pixelRatio)
{
    if (app != nullptr)
        return 1;

    app = new App();

    juce::webclap::registerFont(WebFonts::DejaVuSans_ttf, (size_t)WebFonts::DejaVuSans_ttfSize, true);
    juce::webclap::registerFont(WebFonts::DejaVuSansBold_ttf, (size_t)WebFonts::DejaVuSansBold_ttfSize);
    juce::webclap::setDesktop(16, 16, pixelRatio);

    app->juce = std::make_unique<juce::ScopedJuceInitialiser_GUI>();

    app->synth = std::make_unique<ss::Synth>(false);
    app->synth->clapHost = &stubHost;
    app->bridge = std::make_unique<Bridge>(*app->synth);

    auto &s = *app->synth;
    auto editor = std::make_unique<ss::ui::SixSinesEditor>(
        s.patchMain, s.wavetableHandoff, s.audioToMain, s.mainToAudio, s.audioOutputRing, s.editorActive,
        s.uiForceRebuild, s.dawStateMain, *s.defaultsProvider, &stubHost);
    app->window = std::make_unique<Window>(std::move(editor));

    app->lastWidth = app->window->getWidth();
    app->lastHeight = app->window->getHeight();
    juce::webclap::setDesktop(app->lastWidth, app->lastHeight, pixelRatio);

    app->window->addToDesktop(0);
    app->window->setVisible(true);
    app->window->grabKeyboardFocus();

    app->bridge->sendResize(app->lastWidth, app->lastHeight);
    app->bridge->sendHello();
    return 1;
}

/** Returns the number of dirty rectangles to copy to the canvas. */
EMSCRIPTEN_KEEPALIVE int wclap_ui_frame(double timeMs)
{
    if (app == nullptr)
        return 0;

    const auto changed = juce::webclap::tick(timeMs);
    app->bridge->flush();

    if (app->window->getWidth() != app->lastWidth || app->window->getHeight() != app->lastHeight)
    {
        app->lastWidth = app->window->getWidth();
        app->lastHeight = app->window->getHeight();
        app->bridge->sendResize(app->lastWidth, app->lastHeight);
    }

    return changed ? (int)juce::webclap::getDirtyRects().size() : 0;
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_set_desktop(int width, int height, double pixelRatio)
{
    juce::webclap::setDesktop(width, height, pixelRatio);
}

EMSCRIPTEN_KEEPALIVE const uint8_t *wclap_ui_framebuffer() { return juce::webclap::getFramebuffer(); }
EMSCRIPTEN_KEEPALIVE int wclap_ui_framebuffer_width() { return juce::webclap::getFramebufferWidth(); }
EMSCRIPTEN_KEEPALIVE int wclap_ui_framebuffer_height() { return juce::webclap::getFramebufferHeight(); }

/** x, y, width, height per rectangle, physical pixels. */
EMSCRIPTEN_KEEPALIVE const int *wclap_ui_dirty_rects()
{
    return reinterpret_cast<const int *>(juce::webclap::getDirtyRects().data());
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_mouse(int type, float x, float y, int buttons, int modifiers)
{
    juce::webclap::mouse((juce::webclap::MouseEventType)type, x, y, buttons, modifiers);
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_wheel(float x, float y, float deltaX, float deltaY, int isSmooth,
                                         int modifiers)
{
    juce::webclap::wheel(x, y, deltaX, deltaY, isSmooth != 0, modifiers);
}

EMSCRIPTEN_KEEPALIVE int wclap_ui_key(int isDown, int keyCode, int textCharacter, int modifiers)
{
    return juce::webclap::key(isDown != 0, keyCode, (juce::juce_wchar)textCharacter, modifiers) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE void wclap_ui_focus(int hasFocus) { juce::webclap::focus(hasFocus != 0); }

EMSCRIPTEN_KEEPALIVE void wclap_ui_clipboard(const char *utf8)
{
    juce::webclap::setClipboardText(juce::String::fromUTF8(utf8));
}

/** A protocol frame from the DSP side (relayed by the host). */
EMSCRIPTEN_KEEPALIVE void wclap_ui_receive(const uint8_t *data, int size)
{
    if (app != nullptr)
        app->bridge->receive(data, (size_t)size);
}

/** Parameter list as JSON, for test hosts that have no DSP module to ask. Not part of the protocol. */
EMSCRIPTEN_KEEPALIVE const char *wclap_ui_describe()
{
    static std::string json;

    if (app == nullptr)
        return "[]";

    juce::Array<juce::var> list;
    auto &patch = app->synth->patchMain;

    for (uint32_t i = 0; i < patch.params.size(); ++i)
    {
        clap_param_info info{};
        double value{0};
        char text[64]{};
        if (!sst::plugininfra::patch_support::patchParamsInfo(i, &info, patch))
            continue;
        sst::plugininfra::patch_support::patchParamsValue(info.id, &value, patch);
        sst::plugininfra::patch_support::patchParamsValueToText(info.id, value, text, sizeof(text), patch);

        auto *object = new juce::DynamicObject();
        object->setProperty("id", (juce::int64)info.id);
        object->setProperty("name", juce::String::fromUTF8(info.name));
        object->setProperty("value", value);
        object->setProperty("text", juce::String::fromUTF8(text));
        list.add(juce::var(object));
    }

    json = juce::JSON::toString(juce::var(list), true).toStdString();
    return json.c_str();
}

/** Display text for a value, for the same test hosts. */
EMSCRIPTEN_KEEPALIVE const char *wclap_ui_value_text(uint32_t clapId, double value)
{
    static char text[64];
    text[0] = 0;

    if (app != nullptr)
        sst::plugininfra::patch_support::patchParamsValueToText(clapId, value, text, sizeof(text),
                                                                app->synth->patchMain);
    return text;
}
}
