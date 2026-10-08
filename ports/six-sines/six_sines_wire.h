/*
    Six Sines over the WebCLAP webview channel: the frames both modules exchange.

    Six Sines' editor does not talk to the engine through parameters of a processor. It edits a main-thread
    patch (Synth::patchMain) and pushes Synth::MainToAudioMsg into a queue; the engine answers with
    Synth::AudioToMainMsg (host automation echoes, meters, sample rate). The port carries exactly that: the
    UI module runs the editor against a stand-in Synth, the DSP module runs the real one, and the queues
    cross over as frames. What the editor writes to patchMain beside parameters (name, macro names,
    wavetables, the session state) travels as a patchMeta frame.

    Kit frames (juce_webclap_protocol.h):

        hello     UI -> DSP   u32 protocol version; the DSP answers with a snapshot
        snapshot  DSP -> UI   u32 0 (no parameter list), u32 size, the patch as Six Sines streams it
        state     DSP -> UI   the patch, after the host or a preset loaded one
        resize    UI -> DSP   u32 width, u32 height

    Port frames:

        toAudio   UI -> DSP   u32 count, count * MainToAudioMsg
        toMain    DSP -> UI   u32 count, count * AudioToMainMsg
        patchMeta UI -> DSP   the non-parameter patch and session state, see PatchMeta
        scope     UI -> DSP   u8 1 = send the output audio, 0 = stop (the spectrum analyzer is open)
        audio     DSP -> UI   u32 frames, frames * (f32 left, f32 right)

    Both modules are wasm, so structs are written field by field in little endian (no padding, no pointers).
*/

#pragma once

#include <juce_webclap/juce_webclap_protocol.h>

#include "synth/synth.h"

#include <array>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace six_sines_webclap::wire
{
namespace proto = juce::webclap::protocol;
namespace ss = baconpaul::six_sines;

enum Frame : std::uint8_t
{
    toAudio = proto::firstPluginType,
    toMain,
    patchMeta,
    scope,
    audio
};

inline void putString(proto::Writer &w, const std::string &s)
{
    w.u32((std::uint32_t)s.size());
    w.put(s.data(), s.size());
}

inline std::string getString(proto::Reader &r)
{
    auto n = r.get<std::uint32_t>();
    if (!r.ok || !r.has(n))
    {
        r.ok = false;
        r.p = r.end;
        return {};
    }
    std::string s(reinterpret_cast<const char *>(r.p), n);
    r.p += n;
    return s;
}

// ------------------------------------------------------------------------------------------------------------
// Queue messages

inline void put(proto::Writer &w, const ss::Synth::MainToAudioMsg &m)
{
    w.u32((std::uint32_t)m.action);
    w.u32(m.paramId);
    w.f32(m.value);
    w.u8(m.audioDawState.mpeActive ? 1 : 0);
    w.u32((std::uint32_t)m.audioDawState.mpeBendRange);
    w.f32(m.audioDawState.midiCCSmoothingTimeMs);
    w.f32(m.audioDawState.paramAutomationSmoothingTimeMs);
}

inline ss::Synth::MainToAudioMsg getMainToAudio(proto::Reader &r)
{
    ss::Synth::MainToAudioMsg m{(ss::Synth::MainToAudioMsg::Action)r.get<std::uint32_t>()};
    m.paramId = r.get<std::uint32_t>();
    m.value = r.get<float>();
    m.audioDawState.mpeActive = r.get<std::uint8_t>() != 0;
    m.audioDawState.mpeBendRange = (int)r.get<std::uint32_t>();
    m.audioDawState.midiCCSmoothingTimeMs = r.get<float>();
    m.audioDawState.paramAutomationSmoothingTimeMs = r.get<float>();
    return m;
}

// The pointer (MTS_POINTER) does not cross: an MTS-ESP client lives in one module only.
inline void put(proto::Writer &w, const ss::Synth::AudioToMainMsg &m)
{
    w.u32((std::uint32_t)m.action);
    w.u32(m.paramId);
    w.f32(m.value);
    w.f32(m.value2);
}

inline ss::Synth::AudioToMainMsg getAudioToMain(proto::Reader &r)
{
    ss::Synth::AudioToMainMsg m{(ss::Synth::AudioToMainMsg::Action)r.get<std::uint32_t>()};
    m.paramId = r.get<std::uint32_t>();
    m.value = r.get<float>();
    m.value2 = r.get<float>();
    return m;
}

// ------------------------------------------------------------------------------------------------------------
// Patch meta: what the editor writes to patchMain and dawStateMain.main besides parameter values. The audio part
// of the session state (MPE, smoothing) travels as SET_AUDIO_DAW_STATE in toAudio.

/** Changes whenever a field of the meta changes. Wavetables count by hash, their bytes are not read. */
inline std::size_t metaFingerprint(const ss::Patch &patch, const ss::Synth::MainDawState &main)
{
    std::string key;
    key.reserve(1024);
    key.append(patch.name).push_back(0);
    key.append(patch.author).push_back(0);
    key.push_back(patch.dirty ? 1 : 0);
    for (const auto &m : patch.macroNames)
        key.append(m.data()).push_back(0);
    for (const auto &sn : patch.sourceNodes)
        key.append(std::to_string(sn.wavetableBlobIndex)).push_back(0);
    for (const auto &b : patch.wavetableBlobs)
        key.append(std::to_string(b.hash)).append(b.name).push_back(0);
    key.append(main.colorMapXml).push_back(0);
    key.append(main.presetKind).push_back(0);
    key.append(main.presetCategory).push_back(0);
    key.append(main.presetPath).push_back(0);
    return std::hash<std::string>{}(key);
}

/** Hash of the wavetable list, to send the bytes only when the tables changed. */
inline std::size_t blobsFingerprint(const ss::Patch &patch)
{
    std::string key;
    for (const auto &b : patch.wavetableBlobs)
        key.append(std::to_string(b.hash)).push_back(0);
    return std::hash<std::string>{}(key);
}

inline void putPatchMeta(proto::Writer &w, const ss::Patch &patch, const ss::Synth::MainDawState &main,
                         bool withBlobs)
{
    putString(w, patch.name);
    putString(w, patch.author);
    w.u8(patch.dirty ? 1 : 0);
    for (const auto &m : patch.macroNames)
        putString(w, m.data());
    for (const auto &sn : patch.sourceNodes)
        w.u32((std::uint32_t)sn.wavetableBlobIndex);
    putString(w, main.colorMapXml);
    putString(w, main.presetKind);
    putString(w, main.presetCategory);
    putString(w, main.presetPath);

    // 0xffffffff: the tables are the ones sent before
    if (!withBlobs)
    {
        w.u32(0xffffffffu);
        return;
    }
    w.u32((std::uint32_t)patch.wavetableBlobs.size());
    for (const auto &b : patch.wavetableBlobs)
    {
        w.put(&b.hash, sizeof(b.hash));
        putString(w, b.name);
        putString(w, path_to_string(b.sourcePath));
        w.u32((std::uint32_t)b.sourceBytes.size());
        w.put(b.sourceBytes.data(), b.sourceBytes.size());
    }
}

/** Applies a patchMeta frame to the patch. Returns false if the frame was malformed (nothing is applied). */
inline bool applyPatchMeta(proto::Reader &r, ss::Patch &patch, ss::Synth::MainDawState &main)
{
    auto name = getString(r);
    auto author = getString(r);
    auto dirty = r.get<std::uint8_t>() != 0;
    std::array<std::string, ss::numMacros> macros;
    for (auto &m : macros)
        m = getString(r);
    std::array<int, ss::numOps> blobIndex{};
    for (auto &b : blobIndex)
        b = (int)r.get<std::uint32_t>();
    ss::Synth::MainDawState m;
    m.colorMapXml = getString(r);
    m.presetKind = getString(r);
    m.presetCategory = getString(r);
    m.presetPath = getString(r);
    m.mpeFromExtraState = main.mpeFromExtraState;

    auto blobCount = r.get<std::uint32_t>();
    std::vector<ss::Patch::WavetableBlob> blobs;
    if (blobCount != 0xffffffffu)
    {
        for (std::uint32_t i = 0; i < blobCount && r.ok; ++i)
        {
            ss::Patch::WavetableBlob b;
            b.hash = r.get<std::uint64_t>();
            b.name = getString(r);
            b.sourcePath = string_to_path(getString(r));
            auto n = r.get<std::uint32_t>();
            if (!r.ok || !r.has(n))
                return false;
            b.sourceBytes.assign(r.p, r.p + n);
            r.p += n;
            blobs.push_back(std::move(b));
        }
    }

    if (!r.ok)
        return false;

    auto copy = [](char *dest, std::size_t size, const std::string &s)
    {
        std::memset(dest, 0, size);
        std::strncpy(dest, s.c_str(), size - 1);
    };
    copy(patch.name, sizeof(patch.name), name);
    copy(patch.author, sizeof(patch.author), author);
    patch.dirty = dirty;
    for (std::size_t i = 0; i < ss::numMacros; ++i)
        copy(patch.macroNames[i].data(), patch.macroNames[i].size(), macros[i]);
    if (blobCount != 0xffffffffu)
        patch.wavetableBlobs = std::move(blobs);
    for (std::size_t i = 0; i < ss::numOps; ++i)
        patch.sourceNodes[i].wavetableBlobIndex = blobIndex[i];
    main = std::move(m);
    return true;
}
} // namespace six_sines_webclap::wire
