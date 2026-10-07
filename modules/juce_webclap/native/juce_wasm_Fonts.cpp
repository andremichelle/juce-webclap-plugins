/*
    juce_webclap: fonts for the wasm platform layer.

    There are no system fonts in a browser sandbox. Every typeface comes from memory: fonts registered by the
    kit at start (a default sans-serif) and fonts the editor creates with Typeface::createSystemTypefaceFor.
    Shaping and outlines go through JUCE's bundled HarfBuzz, so text renders like on desktop.

    Included at the end of juce_graphics_wasm.cpp, inside the juce_graphics translation unit.
*/

namespace juce
{

//==============================================================================
class WasmFontRegistry final : public DeletedAtShutdown
{
public:
    struct Entry
    {
        String family, style;
        std::shared_ptr<const MemoryBlock> data;
        unsigned int index = 0;
    };

    ~WasmFontRegistry() override { clearSingletonInstance(); }

    void add (Span<const std::byte> bytes)
    {
        auto data = std::make_shared<const MemoryBlock> (bytes.data(), bytes.size());
        HbBlob blob { hb_blob_create_or_fail (static_cast<const char*> (data->getData()),
                                              (unsigned int) data->getSize(),
                                              HB_MEMORY_MODE_READONLY, nullptr, nullptr),
                      IncrementRef::no };

        if (blob == nullptr)
            return;

        const auto count = hb_face_count (blob.get());

        for (unsigned int i = 0; i < count; ++i)
        {
            HbFace face { hb_face_create (blob.get(), i), IncrementRef::no };
            const auto family = readName (face.get(), HB_OT_NAME_ID_FONT_FAMILY);
            const auto style = readName (face.get(), HB_OT_NAME_ID_FONT_SUBFAMILY);

            if (family.isEmpty() || find (family, style, true) != nullptr)
                continue;

            entries.push_back ({ family, style, data, i });

            if (defaultFamily.isEmpty())
                defaultFamily = family;
        }
    }

    const Entry* find (const String& family, const String& style, bool exactStyle) const
    {
        for (const auto& e : entries)
            if (e.family.equalsIgnoreCase (family) && e.style.equalsIgnoreCase (style))
                return &e;

        if (exactStyle)
            return nullptr;

        // Prefer the regular face of the family, so bold/italic can be synthesised from it.
        const Entry* firstOfFamily = nullptr;

        for (const auto& e : entries)
        {
            if (! e.family.equalsIgnoreCase (family))
                continue;

            if (e.style.equalsIgnoreCase ("Regular") || e.style.equalsIgnoreCase ("Book"))
                return &e;

            if (firstOfFamily == nullptr)
                firstOfFamily = &e;
        }

        return firstOfFamily;
    }

    StringArray getFamilies() const
    {
        StringArray result;

        for (const auto& e : entries)
            result.addIfNotAlreadyThere (e.family);

        return result;
    }

    StringArray getStyles (const String& family) const
    {
        StringArray result;

        for (const auto& e : entries)
            if (e.family.equalsIgnoreCase (family))
                result.addIfNotAlreadyThere (e.style);

        return result;
    }

    String getDefaultFamily() const { return defaultFamily; }
    void setDefaultFamily (const String& family) { defaultFamily = family; }

    static String readName (hb_face_t* face, hb_ot_name_id_t nameId)
    {
        unsigned int size = 0;
        size = hb_ot_name_get_utf8 (face, nameId, HB_LANGUAGE_INVALID, &size, nullptr);
        std::vector<char> text (size + 1, 0);
        size = (unsigned int) text.size();
        hb_ot_name_get_utf8 (face, nameId, HB_LANGUAGE_INVALID, &size, text.data());
        return String::fromUTF8 (text.data());
    }

    JUCE_DECLARE_SINGLETON_INLINE (WasmFontRegistry, false)

private:
    std::vector<Entry> entries;
    String defaultFamily;
};

//==============================================================================
class WasmTypeface final : public Typeface
{
public:
    static Typeface::Ptr fromEntry (const WasmFontRegistry::Entry& entry, const Font* fontForSynthetics)
    {
        auto face = FontStyleHelpers::getFaceForBlob ({ static_cast<const char*> (entry.data->getData()),
                                                        entry.data->getSize() },
                                                      entry.index);

        if (face == nullptr)
            return {};

        HbFont font { hb_font_create (face.get()), IncrementRef::no };

        if (fontForSynthetics != nullptr)
            FontStyleHelpers::initSynthetics (font.get(), *fontForSynthetics);

        return new WasmTypeface (std::move (font), entry.family, entry.style);
    }

    static Typeface::Ptr from (const Font& font)
    {
        auto* registry = WasmFontRegistry::getInstance();

        if (const auto* entry = registry->find (font.getTypefaceName(), font.getTypefaceStyle(), false))
            return fromEntry (*entry, &font);

        // Unknown family: fall back to the default face rather than drawing nothing.
        if (const auto* entry = registry->find (registry->getDefaultFamily(), font.getTypefaceStyle(), false))
            return fromEntry (*entry, &font);

        return {};
    }

    static Typeface::Ptr from (Span<const std::byte> data)
    {
        auto* registry = WasmFontRegistry::getInstance();
        registry->add (data);

        auto face = FontStyleHelpers::getFaceForBlob ({ reinterpret_cast<const char*> (data.data()), data.size() }, 0);

        if (face == nullptr)
            return {};

        const auto family = WasmFontRegistry::readName (face.get(), HB_OT_NAME_ID_FONT_FAMILY);
        const auto style = WasmFontRegistry::readName (face.get(), HB_OT_NAME_ID_FONT_SUBFAMILY);

        if (const auto* entry = registry->find (family, style, true))
            return fromEntry (*entry, nullptr);

        return {};
    }

    Typeface::Ptr createSystemFallback (const String& text, const String&) const override
    {
        auto* registry = WasmFontRegistry::getInstance();

        for (const auto& family : registry->getFamilies())
        {
            if (family == getName())
                continue;

            if (const auto* entry = registry->find (family, getStyle(), false))
            {
                auto candidate = fromEntry (*entry, nullptr);

                if (candidate != nullptr && (text.isEmpty() || candidate->getNominalGlyphForCodepoint (*text.getCharPointer()).has_value()))
                    return candidate;
            }
        }

        return {};
    }

    const Native* getNativeDetails() const override { return native.get(); }

private:
    WasmTypeface (HbFont font, const String& name, const String& style)
        : Typeface (name, style),
          native (std::make_unique<Native> (TypefaceNativeOptions { font, metricsFor (font.get()) }))
    {
    }

    static TypefaceAscentDescent metricsFor (hb_font_t* font)
    {
        hb_font_extents_t extents {};

        if (! hb_font_get_h_extents (font, &extents))
            return { 0.8f, 0.2f };

        const auto upem = (float) hb_face_get_upem (hb_font_get_face (font));
        return { std::abs ((float) extents.ascender) / upem, std::abs ((float) extents.descender) / upem };
    }

    std::unique_ptr<Native> native;
};

//==============================================================================
Typeface::Ptr Typeface::createSystemTypefaceFor (const Font& font)                 { return WasmTypeface::from (font); }
Typeface::Ptr Typeface::createSystemTypefaceFor (Span<const std::byte> data)       { return WasmTypeface::from (data); }

Typeface::Ptr Typeface::findSystemTypeface()
{
    return WasmTypeface::from (Font (FontOptions { WasmFontRegistry::getInstance()->getDefaultFamily(), 15.0f, Font::plain }));
}

void Typeface::scanFolderForFonts (const File& folder)
{
    for (const auto& file : folder.findChildFiles (File::findFiles, true, "*.ttf;*.otf;*.ttc"))
    {
        MemoryBlock block;

        if (file.loadFileAsData (block))
            WasmFontRegistry::getInstance()->add ({ static_cast<const std::byte*> (block.getData()), block.getSize() });
    }
}

StringArray Font::findAllTypefaceNames()                      { return WasmFontRegistry::getInstance()->getFamilies(); }
StringArray Font::findAllTypefaceStyles (const String& family) { return WasmFontRegistry::getInstance()->getStyles (family); }

Typeface::Ptr Font::Native::getDefaultPlatformTypefaceForFont (const Font& font)
{
    Font f (font);

    if (FontStyleHelpers::isPlaceholderFamilyName (font.getTypefaceName()))
        f.setTypefaceName (WasmFontRegistry::getInstance()->getDefaultFamily());

    return Typeface::createSystemTypefaceFor (f);
}

//==============================================================================
// No native bitmap type in a browser: images are plain software pixel data, like on Linux.
ImagePixelData::Ptr NativeImageType::create (Image::PixelFormat format, int width, int height, bool clearImage) const
{
    return new SoftwarePixelData (format, width, height, clearImage);
}

Image JUCE_API getIconFromApplication (const String&, int);
Image JUCE_API getIconFromApplication (const String&, int) { return {}; }

//==============================================================================
namespace webclap
{
    void registerFont (const void* data, size_t numBytes, bool makeDefault)
    {
        auto* registry = WasmFontRegistry::getInstance();
        const auto before = registry->getFamilies();
        registry->add ({ static_cast<const std::byte*> (data), numBytes });

        if (makeDefault)
            for (const auto& family : registry->getFamilies())
                if (! before.contains (family))
                    registry->setDefaultFamily (family);
    }
}

} // namespace juce
