/*
    juce_webclap: windowing for the wasm platform layer.

    The page's canvas is the whole desktop. Every top-level JUCE window (the editor, and popup menus, tooltips
    or alert windows that ask for their own window) gets a WasmComponentPeer that paints with the software
    renderer into its own image. The compositor stacks those images into one RGBA framebuffer and records the
    dirty rectangles the page has to copy into the canvas.

    Everything runs on the page's thread (or the worker's): webclap::tick() is the whole message loop.

    Included by the patched juce_gui_basics.cpp in place of the platform windowing files.
*/

#include <emscripten.h>
#include <juce_webclap/juce_webclap.h>

// Callbacks into the page. Module.webclapHost is installed by webclap-ui.js before the module starts.
EM_JS (void, juce_webclap_js_set_cursor, (const char* name), {
    const host = Module["webclapHost"];
    if (host && host.setCursor) host.setCursor (UTF8ToString (name));
});

EM_JS (void, juce_webclap_js_request_size, (int width, int height), {
    const host = Module["webclapHost"];
    if (host && host.requestSize) host.requestSize (width, height);
});

EM_JS (void, juce_webclap_js_copy_text, (const char* text), {
    const host = Module["webclapHost"];
    if (host && host.copyText) host.copyText (UTF8ToString (text));
});

EM_JS (void, juce_webclap_js_text_input, (int active, int x, int y), {
    const host = Module["webclapHost"];
    if (host && host.textInput) host.textInput (active !== 0, x, y);
});

namespace juce
{

class WasmComponentPeer;

//==============================================================================
/*  The desktop: one display the size of the canvas, the stacking order of the peers and the framebuffer
    they are composited into.
*/
class WasmDesktop
{
public:
    static WasmDesktop& get()
    {
        static WasmDesktop instance;
        return instance;
    }

    int logicalWidth = 1, logicalHeight = 1;   // the canvas
    int screenWidth = 0, screenHeight = 0;      // room the page has for the plugin window
    double pixelRatio = 1.0;

    std::vector<WasmComponentPeer*> peers; // back to front
    WasmComponentPeer* focusedPeer = nullptr;
    WasmComponentPeer* mainPeer = nullptr;

    // Mouse state
    Point<float> lastMousePosition { -1000.0f, -1000.0f };
    WasmComponentPeer* capturedPeer = nullptr;
    int buttonFlags = 0, keyboardFlags = 0;
    std::set<int> keysDown;

    String clipboard;

    // Framebuffer, RGBA in physical pixels
    std::vector<uint8> framebuffer;
    int framebufferWidth = 0, framebufferHeight = 0;
    RectangleList<int> invalidRegion;
    std::vector<webclap::DirtyRect> dirtyRects;

    void invalidate (Rectangle<int> physicalArea)
    {
        invalidRegion.add (physicalArea.getIntersection ({ framebufferWidth, framebufferHeight }));
    }

    void invalidateLogical (Rectangle<int> logicalArea)
    {
        invalidate ((logicalArea.toDouble() * pixelRatio).getSmallestIntegerContainer());
    }

    void resizeFramebuffer()
    {
        framebufferWidth = jmax (1, roundToInt (logicalWidth * pixelRatio));
        framebufferHeight = jmax (1, roundToInt (logicalHeight * pixelRatio));
        framebuffer.assign ((size_t) framebufferWidth * (size_t) framebufferHeight * 4, 0);
        invalidRegion.clear();
        invalidate ({ framebufferWidth, framebufferHeight });
    }

    void compose();
    WasmComponentPeer* peerAt (Point<float> position) const;
    void raise (WasmComponentPeer* peer);
    void setFocus (WasmComponentPeer* peer);
    void removePeer (WasmComponentPeer* peer);

    ModifierKeys currentModifiers() const { return ModifierKeys (keyboardFlags | buttonFlags); }
};

// Set by Component::mouseWheelMove when a wheel event bubbles up past the window (patches/juce-8-wasm.patch)
extern bool webclapWheelUnused;

//==============================================================================
class WasmComponentPeer final : public ComponentPeer
{
public:
    WasmComponentPeer (Component& comp, int windowStyleFlags)
        : ComponentPeer (comp, windowStyleFlags)
    {
        JUCE_ASSERT_MESSAGE_MANAGER_IS_LOCKED

        auto& desktop = WasmDesktop::get();
        scale = desktop.pixelRatio;
        bounds = placedInCanvas (comp.getBounds());
        desktop.peers.push_back (this);

        getNativeRealtimeModifiers = [] { return WasmDesktop::get().currentModifiers(); };
    }

    ~WasmComponentPeer() override
    {
        JUCE_ASSERT_MESSAGE_MANAGER_IS_LOCKED

        auto& desktop = WasmDesktop::get();

        if (visible)
            desktop.invalidateLogical (bounds);

        desktop.removePeer (this);
    }

    bool isMainPeer() const noexcept { return WasmDesktop::get().mainPeer == this; }

    /** JUCE sees the screen as the display (see setScreenSize), so it places windows that the page cannot show:
        outside the canvas. Menus, submenus and tooltips beyond its edge are moved inside. Dialogs (any other window
        before it is shown) are centred: JUCE centred them too, on the screen. */
    Rectangle<int> placedInCanvas (Rectangle<int> r) const
    {
        const auto& desktop = WasmDesktop::get();
        const Rectangle<int> canvas (desktop.logicalWidth, desktop.logicalHeight);

        if (! visible && (getStyleFlags() & windowIsTemporary) == 0 && ! canvas.contains (r))
            r.setCentre (canvas.getCentre());

        return r.withPosition (jlimit (0, jmax (0, canvas.getWidth() - r.getWidth()), r.getX()),
                               jlimit (0, jmax (0, canvas.getHeight() - r.getHeight()), r.getY()));
    }

    /** The first ordinary window that is shown is the plugin's editor. It owns the canvas: its size is the desktop
        size. Shown, not created: a TopLevelWindow (an AlertWindow a plugin keeps as a member) is on the desktop,
        hidden, from its constructor on. */
    void becomeMainPeerIfFirst()
    {
        auto& desktop = WasmDesktop::get();

        if (desktop.mainPeer != nullptr || (getStyleFlags() & windowIsTemporary) != 0)
            return;

        desktop.mainPeer = this;
        bounds.setPosition (0, 0);

        // Editors created after init (once the DSP side's state is in) still size the canvas
        juce_webclap_js_request_size (bounds.getWidth(), bounds.getHeight());
    }

    //==============================================================================
    void* getNativeHandle() const override { return (void*) this; }

    void setVisible (bool shouldBeVisible) override
    {
        if (visible == shouldBeVisible)
            return;

        visible = shouldBeVisible;

        if (visible)
            becomeMainPeerIfFirst();

        WasmDesktop::get().invalidateLogical (bounds);

        if (visible)
            repaint (bounds.withZeroOrigin());
    }

    void setTitle (const String&) override {}

    void setBounds (const Rectangle<int>& newBounds, bool isNowFullScreen) override
    {
        auto corrected = newBounds.withSize (jmax (1, newBounds.getWidth()), jmax (1, newBounds.getHeight()));

        if (isMainPeer())
            corrected.setPosition (0, 0);
        else
            corrected = placedInCanvas (corrected);

        if (corrected == bounds && fullScreen == isNowFullScreen)
            return;

        const auto sizeChanged = corrected.getWidth() != bounds.getWidth() || corrected.getHeight() != bounds.getHeight();

        if (visible)
            WasmDesktop::get().invalidateLogical (bounds);

        bounds = corrected;
        fullScreen = isNowFullScreen;

        if (sizeChanged)
            image = {};

        repaint (bounds.withZeroOrigin());

        WeakReference<Component> deletionChecker (&component);
        handleMovedOrResized();

        if (deletionChecker != nullptr && sizeChanged && isMainPeer())
            juce_webclap_js_request_size (bounds.getWidth(), bounds.getHeight());
    }

    Rectangle<int> getBounds() const override { return bounds; }

    Point<float> localToGlobal (Point<float> relativePosition) override { return relativePosition + bounds.getPosition().toFloat(); }
    Point<float> globalToLocal (Point<float> screenPosition) override   { return screenPosition - bounds.getPosition().toFloat(); }

    using ComponentPeer::localToGlobal;
    using ComponentPeer::globalToLocal;

    void setMinimised (bool shouldBeMinimised) override  { setVisible (! shouldBeMinimised); }
    bool isMinimised() const override                    { return false; }
    bool isShowing() const override                      { return visible; }

    void setFullScreen (bool shouldBeFullScreen) override
    {
        if (shouldBeFullScreen)
            setBounds ({ WasmDesktop::get().logicalWidth, WasmDesktop::get().logicalHeight }, true);
        else
            fullScreen = false;
    }

    bool isFullScreen() const override { return fullScreen; }

    void setIcon (const Image&) override {}

    bool contains (Point<int> localPos, bool) const override
    {
        return bounds.withZeroOrigin().contains (localPos);
    }

    OptionalBorderSize getFrameSizeIfPresent() const override { return OptionalBorderSize { BorderSize<int>() }; }
    BorderSize<int> getFrameSize() const override            { return {}; }

    bool setAlwaysOnTop (bool) override { return false; }

    void toFront (bool takeKeyboardFocus) override
    {
        WasmDesktop::get().raise (this);

        if (takeKeyboardFocus)
            grabFocus();

        handleBroughtToFront();
    }

    void toBehind (ComponentPeer* other) override
    {
        auto& peers = WasmDesktop::get().peers;
        const auto self = std::find (peers.begin(), peers.end(), this);
        if (self == peers.end())
            return;

        peers.erase (self);
        const auto target = std::find (peers.begin(), peers.end(), other);
        peers.insert (target, this);
        WasmDesktop::get().invalidateLogical (bounds);
    }

    bool isFocused() const override { return WasmDesktop::get().focusedPeer == this; }
    void grabFocus() override       { WasmDesktop::get().setFocus (this); }

    void textInputRequired (Point<int> position, TextInputTarget&) override
    {
        const auto global = localToGlobal (position.toFloat()).roundToInt();
        juce_webclap_js_text_input (1, global.x, global.y);
    }

    void dismissPendingTextInput() override
    {
        closeInputMethodContext();
        juce_webclap_js_text_input (0, 0, 0);
    }

    //==============================================================================
    void repaint (const Rectangle<int>& area) override
    {
        dirty.add (area.getIntersection (bounds.withZeroOrigin()));
    }

    void performAnyPendingRepaintsNow() override
    {
        if (! visible || dirty.isEmpty())
            return;

        const auto imageWidth = jmax (1, roundToInt (bounds.getWidth() * scale));
        const auto imageHeight = jmax (1, roundToInt (bounds.getHeight() * scale));

        if (image.isNull() || image.getWidth() != imageWidth || image.getHeight() != imageHeight)
        {
            image = Image (Image::ARGB, imageWidth, imageHeight, true, SoftwareImageType());
            dirty = RectangleList<int> (bounds.withZeroOrigin());
        }

        RectangleList<int> physical;

        for (const auto& r : dirty)
            physical.add ((r.toDouble() * scale).getSmallestIntegerContainer().getIntersection (image.getBounds()));

        dirty.clear();

        if (physical.isEmpty())
            return;

        if ((getStyleFlags() & windowIsSemiTransparent) != 0)
            for (const auto& r : physical)
                image.clear (r);

        {
            auto context = component.getLookAndFeel().createGraphicsContext (image, {}, physical);
            context->addTransform (AffineTransform::scale ((float) scale));
            handlePaint (*context);
        }

        const auto origin = getPhysicalOrigin();

        for (const auto& r : physical)
            WasmDesktop::get().invalidate (r + origin);
    }

    void setAlpha (float newAlpha) override
    {
        alpha = jlimit (0.0f, 1.0f, newAlpha);
        WasmDesktop::get().invalidateLogical (bounds);
    }

    StringArray getAvailableRenderingEngines() override { return { "Software Renderer" }; }

    double getPlatformScaleFactor() const noexcept override { return scale; }

    //==============================================================================
    void setScale (double newScale)
    {
        if (approximatelyEqual (scale, newScale))
            return;

        scale = newScale;
        image = {};
        repaint (bounds.withZeroOrigin());
        scaleFactorListeners.call ([this] (ScaleFactorListener& l) { l.nativeScaleFactorChanged (scale); });
    }

    void vblank (double timestampSec)
    {
        callVBlankListeners (timestampSec);
    }

    Point<int> getPhysicalOrigin() const
    {
        return (bounds.getPosition().toDouble() * scale).roundToInt();
    }

    bool isVisibleOnDesktop() const noexcept { return visible && ! image.isNull(); }
    const Image& getImage() const noexcept  { return image; }
    float getAlpha() const noexcept         { return alpha; }
    bool isTemporary() const noexcept       { return (getStyleFlags() & windowIsTemporary) != 0; }

private:
    Rectangle<int> bounds;
    RectangleList<int> dirty;
    Image image;
    double scale = 1.0;
    float alpha = 1.0f;
    bool visible = false, fullScreen = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (WasmComponentPeer)
};

//==============================================================================
WasmComponentPeer* WasmDesktop::peerAt (Point<float> position) const
{
    for (auto it = peers.rbegin(); it != peers.rend(); ++it)
        if ((*it)->isShowing() && (*it)->getBounds().toFloat().contains (position))
            return *it;

    return nullptr;
}

void WasmDesktop::raise (WasmComponentPeer* peer)
{
    const auto it = std::find (peers.begin(), peers.end(), peer);

    if (it == peers.end() || it == std::prev (peers.end()))
        return;

    peers.erase (it);
    peers.push_back (peer);
    invalidateLogical (peer->getBounds());
}

void WasmDesktop::setFocus (WasmComponentPeer* peer)
{
    if (focusedPeer == peer)
        return;

    auto* previous = std::exchange (focusedPeer, peer);

    if (previous != nullptr)
        previous->handleFocusLoss();

    if (peer != nullptr)
        peer->handleFocusGain();
}

void WasmDesktop::removePeer (WasmComponentPeer* peer)
{
    peers.erase (std::remove (peers.begin(), peers.end(), peer), peers.end());

    if (focusedPeer == peer)
        focusedPeer = nullptr;

    if (capturedPeer == peer)
        capturedPeer = nullptr;

    if (mainPeer == peer)
        mainPeer = nullptr;
}

void WasmDesktop::compose()
{
    dirtyRects.clear();

    if (invalidRegion.isEmpty())
        return;

    invalidRegion.consolidate();

    // Many small rectangles cost more in putImageData calls than they save in pixels.
    if (invalidRegion.getNumRectangles() > 24)
        invalidRegion = RectangleList<int> (invalidRegion.getBounds());

    for (const auto& area : invalidRegion)
    {
        // Background where no window covers the desktop.
        for (int y = area.getY(); y < area.getBottom(); ++y)
        {
            auto* dst = framebuffer.data() + ((size_t) y * (size_t) framebufferWidth + (size_t) area.getX()) * 4;

            for (int x = 0; x < area.getWidth(); ++x, dst += 4)
            {
                dst[0] = 24; dst[1] = 24; dst[2] = 24; dst[3] = 255;
            }
        }

        for (auto* peer : peers)
        {
            if (! peer->isVisibleOnDesktop())
                continue;

            auto image = peer->getImage(); // a handle copy: BitmapData wants a non-const Image
            const auto origin = peer->getPhysicalOrigin();
            const auto clip = Rectangle<int> (origin.x, origin.y, image.getWidth(), image.getHeight()).getIntersection (area);

            if (clip.isEmpty())
                continue;

            const Image::BitmapData src (image, clip.getX() - origin.x, clip.getY() - origin.y,
                                         clip.getWidth(), clip.getHeight(), Image::BitmapData::readOnly);
            const auto peerAlpha = (uint32) roundToInt (peer->getAlpha() * 256.0f);

            for (int y = 0; y < clip.getHeight(); ++y)
            {
                const auto* s = reinterpret_cast<const PixelARGB*> (src.getLinePointer (y));
                auto* d = framebuffer.data() + ((size_t) (clip.getY() + y) * (size_t) framebufferWidth + (size_t) clip.getX()) * 4;

                for (int x = 0; x < clip.getWidth(); ++x, ++s, d += 4)
                {
                    // Source pixels are premultiplied ARGB, the framebuffer is opaque RGBA.
                    uint32 a = s->getAlpha(), r = s->getRed(), g = s->getGreen(), b = s->getBlue();

                    if (peerAlpha < 256)
                    {
                        a = (a * peerAlpha) >> 8; r = (r * peerAlpha) >> 8;
                        g = (g * peerAlpha) >> 8; b = (b * peerAlpha) >> 8;
                    }

                    if (a == 255)
                    {
                        d[0] = (uint8) r; d[1] = (uint8) g; d[2] = (uint8) b;
                    }
                    else if (a != 0)
                    {
                        const auto inv = 255 - a;
                        d[0] = (uint8) (r + (d[0] * inv + 127) / 255);
                        d[1] = (uint8) (g + (d[1] * inv + 127) / 255);
                        d[2] = (uint8) (b + (d[2] * inv + 127) / 255);
                    }
                }
            }
        }

        dirtyRects.push_back ({ area.getX(), area.getY(), area.getWidth(), area.getHeight() });
    }

    invalidRegion.clear();
}

//==============================================================================
ComponentPeer* Component::createNewPeer (int styleFlags, void*)
{
    return new WasmComponentPeer (*this, styleFlags);
}

JUCE_API bool JUCE_CALLTYPE Process::isForegroundProcess()    { return WasmDesktop::get().focusedPeer != nullptr; }
JUCE_API void JUCE_CALLTYPE Process::makeForegroundProcess()  {}
JUCE_API void JUCE_CALLTYPE Process::hide()                   {}

bool WindowUtils::areThereAnyAlwaysOnTopWindows()  { return false; }

//==============================================================================
void Desktop::setKioskComponent (Component* comp, bool enableOrDisable, bool)
{
    if (enableOrDisable)
        comp->setBounds (getDisplays().getPrimaryDisplay()->totalArea);
}

void Displays::findDisplays (const Desktop&)
{
    const auto& desktop = WasmDesktop::get();

    // The display is the screen space the window could grow into, not the canvas: editors offer only sizes that
    // fit the display (zoom menus, constrainers). Windows outside the canvas are clipped.
    Display d;
    d.isMain = true;
    d.totalArea = d.userArea = { jmax (desktop.logicalWidth, desktop.screenWidth),
                                 jmax (desktop.logicalHeight, desktop.screenHeight) };
    d.topLeftPhysical = {};
    d.scale = desktop.pixelRatio;
    d.dpi = 96.0 * desktop.pixelRatio;
    d.verticalFrequencyHz = 60.0;
    displays.add (d);
}

bool Desktop::canUseSemiTransparentWindows() noexcept { return true; }

class Desktop::NativeDarkModeChangeDetectorImpl
{
public:
    bool isDarkModeEnabled() const noexcept { return true; }
};

std::unique_ptr<Desktop::NativeDarkModeChangeDetectorImpl> Desktop::createNativeDarkModeChangeDetectorImpl()
{
    return std::make_unique<NativeDarkModeChangeDetectorImpl>();
}

bool Desktop::isDarkModeActive() const                              { return nativeDarkModeChangeDetectorImpl->isDarkModeEnabled(); }
void Desktop::setScreenSaverEnabled (bool)                          {}
bool Desktop::isScreenSaverEnabled()                                { return true; }
double Desktop::getDefaultMasterScale()                             { return 1.0; }
Desktop::DisplayOrientation Desktop::getCurrentOrientation() const  { return upright; }
void Desktop::allowedOrientationsChanged()                          {}

//==============================================================================
bool detail::MouseInputSourceList::addSource()
{
    if (sources.isEmpty())
    {
        addSource (0, MouseInputSource::InputSourceType::mouse);
        return true;
    }

    return false;
}

bool detail::MouseInputSourceList::canUseTouch() const              { return false; }

Point<float> MouseInputSource::getCurrentRawMousePosition()         { return WasmDesktop::get().lastMousePosition; }
void MouseInputSource::setRawMousePosition (Point<float>)           {} // browsers do not let pages move the pointer

//==============================================================================
class MouseCursor::PlatformSpecificHandle
{
public:
    explicit PlatformSpecificHandle (const MouseCursor::StandardCursorType type) : cssName (toCss (type)) {}
    explicit PlatformSpecificHandle (const detail::CustomMouseCursorInfo&) : cssName ("default") {}

    static void showInWindow (PlatformSpecificHandle* handle, ComponentPeer*)
    {
        juce_webclap_js_set_cursor (handle != nullptr ? handle->cssName : "default");
    }

private:
    static const char* toCss (MouseCursor::StandardCursorType type)
    {
        switch (type)
        {
            case NoCursor:                      return "none";
            case WaitCursor:                    return "wait";
            case IBeamCursor:                   return "text";
            case CrosshairCursor:               return "crosshair";
            case CopyingCursor:                 return "copy";
            case PointingHandCursor:            return "pointer";
            case DraggingHandCursor:            return "grab";
            case LeftRightResizeCursor:         return "ew-resize";
            case UpDownResizeCursor:            return "ns-resize";
            case UpDownLeftRightResizeCursor:   return "move";
            case TopEdgeResizeCursor:           return "n-resize";
            case BottomEdgeResizeCursor:        return "s-resize";
            case LeftEdgeResizeCursor:          return "w-resize";
            case RightEdgeResizeCursor:         return "e-resize";
            case TopLeftCornerResizeCursor:     return "nw-resize";
            case TopRightCornerResizeCursor:    return "ne-resize";
            case BottomLeftCornerResizeCursor:  return "sw-resize";
            case BottomRightCornerResizeCursor: return "se-resize";
            case ParentCursor:
            case NormalCursor:
            case NumStandardCursorTypes:
            default:                            return "default";
        }
    }

    const char* cssName;

    JUCE_DECLARE_NON_COPYABLE (PlatformSpecificHandle)
    JUCE_DECLARE_NON_MOVEABLE (PlatformSpecificHandle)
};

//==============================================================================
bool DragAndDropContainer::performExternalDragDropOfFiles (const StringArray&, bool, Component*, std::function<void()>)
{
    return false;
}

bool DragAndDropContainer::performExternalDragDropOfText (const String&, Component*, std::function<void()>)
{
    return false;
}

void SystemClipboard::copyTextToClipboard (const String& text)
{
    WasmDesktop::get().clipboard = text;
    juce_webclap_js_copy_text (text.toRawUTF8());
}

String SystemClipboard::getTextFromClipboard()
{
    return WasmDesktop::get().clipboard;
}

bool KeyPress::isKeyCurrentlyDown (int keyCode)
{
    return WasmDesktop::get().keysDown.count (keyCode) > 0;
}

void LookAndFeel::playAlertSound() {}

Image detail::WindowingHelpers::createIconForFile (const File&) { return {}; }

//==============================================================================
// Key codes. Printable keys use their character, the rest use the DOM keyCode ORed with an "extended" bit.
// webclap-ui.js uses the same table when it translates KeyboardEvents.
namespace WasmKeys { constexpr int extended = 0x10000; }

const int KeyPress::spaceKey              = ' ';
const int KeyPress::returnKey             = 0x0d;
const int KeyPress::escapeKey             = 0x1b;
const int KeyPress::backspaceKey          = 0x08;
const int KeyPress::tabKey                = 0x09;
const int KeyPress::pageUpKey             = 0x21 | WasmKeys::extended;
const int KeyPress::pageDownKey           = 0x22 | WasmKeys::extended;
const int KeyPress::endKey                = 0x23 | WasmKeys::extended;
const int KeyPress::homeKey               = 0x24 | WasmKeys::extended;
const int KeyPress::leftKey               = 0x25 | WasmKeys::extended;
const int KeyPress::upKey                 = 0x26 | WasmKeys::extended;
const int KeyPress::rightKey              = 0x27 | WasmKeys::extended;
const int KeyPress::downKey               = 0x28 | WasmKeys::extended;
const int KeyPress::insertKey             = 0x2d | WasmKeys::extended;
const int KeyPress::deleteKey             = 0x2e | WasmKeys::extended;
const int KeyPress::F1Key                 = 0x70 | WasmKeys::extended;
const int KeyPress::F2Key                 = 0x71 | WasmKeys::extended;
const int KeyPress::F3Key                 = 0x72 | WasmKeys::extended;
const int KeyPress::F4Key                 = 0x73 | WasmKeys::extended;
const int KeyPress::F5Key                 = 0x74 | WasmKeys::extended;
const int KeyPress::F6Key                 = 0x75 | WasmKeys::extended;
const int KeyPress::F7Key                 = 0x76 | WasmKeys::extended;
const int KeyPress::F8Key                 = 0x77 | WasmKeys::extended;
const int KeyPress::F9Key                 = 0x78 | WasmKeys::extended;
const int KeyPress::F10Key                = 0x79 | WasmKeys::extended;
const int KeyPress::F11Key                = 0x7a | WasmKeys::extended;
const int KeyPress::F12Key                = 0x7b | WasmKeys::extended;
const int KeyPress::F13Key                = 0x7c | WasmKeys::extended;
const int KeyPress::F14Key                = 0x7d | WasmKeys::extended;
const int KeyPress::F15Key                = 0x7e | WasmKeys::extended;
const int KeyPress::F16Key                = 0x7f | WasmKeys::extended;
const int KeyPress::F17Key                = 0x80 | WasmKeys::extended;
const int KeyPress::F18Key                = 0x81 | WasmKeys::extended;
const int KeyPress::F19Key                = 0x82 | WasmKeys::extended;
const int KeyPress::F20Key                = 0x83 | WasmKeys::extended;
const int KeyPress::F21Key                = 0x84 | WasmKeys::extended;
const int KeyPress::F22Key                = 0x85 | WasmKeys::extended;
const int KeyPress::F23Key                = 0x86 | WasmKeys::extended;
const int KeyPress::F24Key                = 0x87 | WasmKeys::extended;
const int KeyPress::F25Key                = 0x88 | WasmKeys::extended;
const int KeyPress::F26Key                = 0x89 | WasmKeys::extended;
const int KeyPress::F27Key                = 0x8a | WasmKeys::extended;
const int KeyPress::F28Key                = 0x8b | WasmKeys::extended;
const int KeyPress::F29Key                = 0x8c | WasmKeys::extended;
const int KeyPress::F30Key                = 0x8d | WasmKeys::extended;
const int KeyPress::F31Key                = 0x8e | WasmKeys::extended;
const int KeyPress::F32Key                = 0x8f | WasmKeys::extended;
const int KeyPress::F33Key                = 0x90 | WasmKeys::extended;
const int KeyPress::F34Key                = 0x91 | WasmKeys::extended;
const int KeyPress::F35Key                = 0x92 | WasmKeys::extended;
const int KeyPress::numberPad0            = 0x60 | WasmKeys::extended;
const int KeyPress::numberPad1            = 0x61 | WasmKeys::extended;
const int KeyPress::numberPad2            = 0x62 | WasmKeys::extended;
const int KeyPress::numberPad3            = 0x63 | WasmKeys::extended;
const int KeyPress::numberPad4            = 0x64 | WasmKeys::extended;
const int KeyPress::numberPad5            = 0x65 | WasmKeys::extended;
const int KeyPress::numberPad6            = 0x66 | WasmKeys::extended;
const int KeyPress::numberPad7            = 0x67 | WasmKeys::extended;
const int KeyPress::numberPad8            = 0x68 | WasmKeys::extended;
const int KeyPress::numberPad9            = 0x69 | WasmKeys::extended;
const int KeyPress::numberPadMultiply     = 0x6a | WasmKeys::extended;
const int KeyPress::numberPadAdd          = 0x6b | WasmKeys::extended;
const int KeyPress::numberPadSeparator    = 0x6c | WasmKeys::extended;
const int KeyPress::numberPadSubtract     = 0x6d | WasmKeys::extended;
const int KeyPress::numberPadDecimalPoint = 0x6e | WasmKeys::extended;
const int KeyPress::numberPadDivide       = 0x6f | WasmKeys::extended;
const int KeyPress::numberPadEquals       = 0x93 | WasmKeys::extended;
const int KeyPress::numberPadDelete       = 0x94 | WasmKeys::extended;
const int KeyPress::playKey               = 0xb3 | WasmKeys::extended;
const int KeyPress::stopKey               = 0xb2 | WasmKeys::extended;
const int KeyPress::fastForwardKey        = 0xb0 | WasmKeys::extended;
const int KeyPress::rewindKey             = 0xb1 | WasmKeys::extended;

//==============================================================================
namespace detail
{
std::unique_ptr<ScopedMessageBoxInterface> ScopedMessageBoxInterface::create (const MessageBoxOptions& options)
{
    // Same as on Linux: reuse the AlertWindow, and map its result to the button index like native boxes do.
    class MessageBox final : public ScopedMessageBoxInterface
    {
    public:
        explicit MessageBox (const MessageBoxOptions& o)
            : inner (detail::AlertWindowHelpers::create (o)), numButtons (o.getNumButtons()) {}

        void runAsync (std::function<void (int)> fn) override
        {
            inner->runAsync ([fn, n = numButtons] (int result) { fn (map (result, n)); });
        }

        int runSync() override { return map (inner->runSync(), numButtons); }
        void close() override  { inner->close(); }

    private:
        static int map (int button, int n) { return n <= 0 ? 0 : (button + n - 1) % n; }

        std::unique_ptr<ScopedMessageBoxInterface> inner;
        int numButtons = 0;
    };

    return std::make_unique<MessageBox> (options);
}
} // namespace detail

bool FileChooser::isPlatformDialogAvailable() { return false; }

std::shared_ptr<FileChooser::Pimpl> FileChooser::showPlatformDialog (FileChooser&, int, FilePreviewComponent*)
{
    return {};
}

//==============================================================================
namespace webclap
{
    int dispatchPendingMessages(); // juce_wasm_Messaging.cpp

    void setScreenSize (int width, int height)
    {
        auto& desktop = WasmDesktop::get();
        desktop.screenWidth = jmax (0, width);
        desktop.screenHeight = jmax (0, height);

        if (! desktop.framebuffer.empty())
            const_cast<Displays&> (Desktop::getInstance().getDisplays()).refresh();
    }

    void setDesktop (int logicalWidth, int logicalHeight, double pixelRatio)
    {
        auto& desktop = WasmDesktop::get();
        logicalWidth = jmax (1, logicalWidth);
        logicalHeight = jmax (1, logicalHeight);
        pixelRatio = jlimit (0.5, 8.0, pixelRatio);

        if (desktop.logicalWidth == logicalWidth && desktop.logicalHeight == logicalHeight
            && approximatelyEqual (desktop.pixelRatio, pixelRatio) && ! desktop.framebuffer.empty())
            return;

        desktop.logicalWidth = logicalWidth;
        desktop.logicalHeight = logicalHeight;
        desktop.pixelRatio = pixelRatio;
        desktop.resizeFramebuffer();

        const_cast<Displays&> (Desktop::getInstance().getDisplays()).refresh();

        for (auto* peer : desktop.peers)
        {
            peer->setScale (pixelRatio);
            peer->repaint (peer->getBounds().withZeroOrigin());
        }
    }

    bool tick (double timeMs)
    {
        dispatchPendingMessages();
        Timer::callPendingTimersSynchronously();

        auto& desktop = WasmDesktop::get();

        // Copy: vblank listeners may open or close windows.
        const auto peers = desktop.peers;
        const auto timestampSec = timeMs / 1000.0;

        for (auto* peer : peers)
            if (std::find (desktop.peers.begin(), desktop.peers.end(), peer) != desktop.peers.end())
                peer->vblank (timestampSec);

        for (auto* peer : std::vector<WasmComponentPeer*> (desktop.peers))
            if (std::find (desktop.peers.begin(), desktop.peers.end(), peer) != desktop.peers.end())
                peer->performAnyPendingRepaintsNow();

        desktop.compose();
        return ! desktop.dirtyRects.empty();
    }

    const uint8_t* getFramebuffer()                   { return WasmDesktop::get().framebuffer.data(); }
    int getFramebufferWidth()                         { return WasmDesktop::get().framebufferWidth; }
    int getFramebufferHeight()                        { return WasmDesktop::get().framebufferHeight; }
    const std::vector<DirtyRect>& getDirtyRects()     { return WasmDesktop::get().dirtyRects; }

    static int toButtonFlags (int buttons)
    {
        // DOM PointerEvent.buttons: 1 left, 2 right, 4 middle
        return ((buttons & 1) != 0 ? ModifierKeys::leftButtonModifier : 0)
             | ((buttons & 2) != 0 ? ModifierKeys::rightButtonModifier : 0)
             | ((buttons & 4) != 0 ? ModifierKeys::middleButtonModifier : 0);
    }

    static int toKeyboardFlags (int modifiers)
    {
        // Bits from webclap-ui.js: 1 shift, 2 ctrl, 4 alt, 8 meta. Meta acts as command, which is ctrl off Apple.
        return ((modifiers & 1) != 0 ? ModifierKeys::shiftModifier : 0)
             | ((modifiers & (2 | 8)) != 0 ? ModifierKeys::ctrlModifier : 0)
             | ((modifiers & 4) != 0 ? ModifierKeys::altModifier : 0);
    }

    static void updateKeyboardFlags (int modifiers)
    {
        auto& desktop = WasmDesktop::get();
        const auto flags = toKeyboardFlags (modifiers);

        if (flags == desktop.keyboardFlags)
            return;

        desktop.keyboardFlags = flags;
        ModifierKeys::currentModifiers = desktop.currentModifiers();

        if (auto* peer = desktop.focusedPeer != nullptr ? desktop.focusedPeer : desktop.mainPeer)
            peer->handleModifierKeysChange();
    }

    void mouse (MouseEventType type, float x, float y, int buttons, int modifiers)
    {
        auto& desktop = WasmDesktop::get();
        const auto position = Point<float> (x, y);
        updateKeyboardFlags (modifiers);

        if (type != MouseEventType::leave)
            desktop.lastMousePosition = position;

        desktop.buttonFlags = toButtonFlags (buttons);

        auto* target = desktop.capturedPeer;

        if (target == nullptr)
            target = type == MouseEventType::leave ? desktop.mainPeer : desktop.peerAt (position);

        if (type == MouseEventType::down)
        {
            desktop.capturedPeer = target;

            if (target != nullptr && ! target->isTemporary() && ! target->isFocused())
                target->grabFocus();
        }
        else if (type == MouseEventType::up && desktop.buttonFlags == 0)
        {
            desktop.capturedPeer = nullptr;
        }

        ModifierKeys::currentModifiers = desktop.currentModifiers();

        if (target == nullptr)
            return;

        // Leaving the canvas: report a position outside every window, as desktop platforms do.
        const auto local = type == MouseEventType::leave ? Point<float> (-10000.0f, -10000.0f)
                                                         : target->globalToLocal (position);

        target->handleMouseEvent (MouseInputSource::InputSourceType::mouse, local, ModifierKeys::currentModifiers,
                                  MouseInputSource::defaultPressure, MouseInputSource::defaultOrientation,
                                  Time::currentTimeMillis());
    }

    bool wheel (float x, float y, float deltaX, float deltaY, bool isSmooth, int modifiers)
    {
        auto& desktop = WasmDesktop::get();
        const auto position = Point<float> (x, y);
        updateKeyboardFlags (modifiers);
        desktop.lastMousePosition = position;

        webclapWheelUnused = true;

        if (auto* target = desktop.peerAt (position))
        {
            webclapWheelUnused = false;

            MouseWheelDetails details;
            details.deltaX = deltaX;
            details.deltaY = deltaY;
            details.isReversed = false;
            details.isSmooth = isSmooth;
            details.isInertial = false;

            target->handleMouseWheel (MouseInputSource::InputSourceType::mouse, target->globalToLocal (position),
                                      Time::currentTimeMillis(), details);
        }

        return ! webclapWheelUnused;
    }

    bool key (bool isDown, int keyCode, juce_wchar textCharacter, int modifiers)
    {
        auto& desktop = WasmDesktop::get();
        updateKeyboardFlags (modifiers);

        if (isDown)
            desktop.keysDown.insert (keyCode);
        else
            desktop.keysDown.erase (keyCode);

        auto* peer = desktop.focusedPeer != nullptr ? desktop.focusedPeer : desktop.mainPeer;

        if (peer == nullptr)
            return false;

        WeakReference<Component> checker (&peer->getComponent());
        auto used = peer->handleKeyUpOrDown (isDown);

        if (isDown && checker != nullptr && keyCode != 0)
            used = peer->handleKeyPress (keyCode, textCharacter) || used;

        return used;
    }

    void focus (bool hasFocus)
    {
        auto& desktop = WasmDesktop::get();

        if (! hasFocus)
        {
            desktop.keysDown.clear();
            desktop.setFocus (nullptr);
        }
        else if (desktop.focusedPeer == nullptr && desktop.mainPeer != nullptr)
        {
            desktop.setFocus (desktop.mainPeer);
        }
    }

    void setClipboardText (const String& text)
    {
        WasmDesktop::get().clipboard = text;
    }
}

} // namespace juce
