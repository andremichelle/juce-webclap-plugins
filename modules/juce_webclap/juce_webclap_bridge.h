/*
    juce_webclap: the UI side of the split-UI message protocol (see PLAN.md, "Message protocol").

    The editor talks to a stand-in AudioProcessor in the UI module. ProcessorBridge listens to that processor
    and turns parameter changes, gestures and state changes into binary frames for the DSP side, and applies
    frames from the DSP side (automation, preset loads) back to the stand-in, so attachments update the editor.

    Frames are little endian: u8 type, u8 flags, u16 reserved, payload.

        hello     UI -> DSP   u32 protocol version
        snapshot  DSP -> UI   u32 count, count * (u32 clapId, f64 value), u32 stateSize, state bytes
        param     both        u32 clapId, f64 value (normalised 0..1)
        gesture   UI -> DSP   u32 clapId, u8 1 = begin, 0 = end
        state     both        opaque blob (AudioProcessor::getStateInformation)
        stream    DSP -> UI   u16 streamId, samples
        resize    UI -> DSP   u32 width, u32 height (logical pixels)

    Parameter ids are CLAP ids. For JUCE parameters with an id this is the id's String::hashCode(), which is
    what clap-juce-extensions uses, so a host that automates CLAP ids talks about the same parameters.

    Depends on juce_audio_processors. Header-only, include it in the app.
*/

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <cstring>
#include <functional>
#include <map>
#include <unordered_map>
#include <vector>

namespace juce::webclap
{

namespace protocol
{
    enum Type : uint8
    {
        hello    = 1,
        snapshot = 2,
        param    = 3,
        gesture  = 4,
        state    = 5,
        stream   = 6,
        resize   = 7
    };

    constexpr uint32 version = 1;

    /** Set on param/state frames the UI sends to seed a DSP side that has no values yet (empty snapshot). */
    constexpr uint8 flagSync = 1;

    struct Writer
    {
        explicit Writer (Type type, uint8 flags = 0) { u8 (type); u8 (flags); u16 (0); }

        void u8 (uint8 v)   { bytes.push_back (v); }
        void u16 (uint16 v) { put (&v, sizeof (v)); }
        void u32 (uint32 v) { put (&v, sizeof (v)); }
        void f64 (double v) { put (&v, sizeof (v)); }

        // wasm is little endian, so memcpy produces the wire format
        void put (const void* data, size_t size)
        {
            const auto* p = static_cast<const uint8*> (data);
            bytes.insert (bytes.end(), p, p + size);
        }

        std::vector<uint8> bytes;
    };

    struct Reader
    {
        Reader (const void* data, size_t size) : p (static_cast<const uint8*> (data)), end (p + size) {}

        bool has (size_t n) const { return (size_t) (end - p) >= n; }

        template <typename T>
        T get()
        {
            T v {};

            if (has (sizeof (T)))
            {
                std::memcpy (&v, p, sizeof (T));
                p += sizeof (T);
            }
            else
            {
                p = end;
                ok = false;
            }

            return v;
        }

        const uint8* p;
        const uint8* end;
        bool ok = true;
    };
}

//==============================================================================
class ProcessorBridge final : private AudioProcessorListener
{
public:
    using Sender = std::function<void (const void* data, size_t size)>;

    ProcessorBridge (AudioProcessor& p, Sender sender)
        : processor (p), send (std::move (sender))
    {
        for (auto* parameter : processor.getParameters())
            parametersById[clapIdFor (*parameter)] = parameter;

        processor.addListener (this);
    }

    ~ProcessorBridge() override
    {
        processor.removeListener (this);
    }

    static uint32 clapIdFor (const AudioProcessorParameter& parameter)
    {
        if (const auto* withId = dynamic_cast<const AudioProcessorParameterWithID*> (&parameter))
            return (uint32) withId->paramID.hashCode();

        return (uint32) parameter.getParameterIndex();
    }

    AudioProcessorParameter* findParameter (uint32 clapId) const
    {
        const auto it = parametersById.find (clapId);
        return it != parametersById.end() ? it->second : nullptr;
    }

    /** Starts the session: the DSP side answers with a snapshot. */
    void sendHello()
    {
        protocol::Writer w (protocol::hello);
        w.u32 (protocol::version);
        emit (w);
    }

    void sendResize (int width, int height)
    {
        protocol::Writer w (protocol::resize);
        w.u32 ((uint32) width);
        w.u32 ((uint32) height);
        emit (w);
    }

    /** A frame from the DSP side. */
    void receive (const void* data, size_t size)
    {
        protocol::Reader r (data, size);
        const auto type = r.get<uint8>();
        r.get<uint8>();
        r.get<uint16>();

        if (! r.ok)
            return;

        const ScopedValueSetter<bool> applying (applyingRemote, true);

        switch (type)
        {
            case protocol::param:
            {
                const auto id = r.get<uint32>();
                const auto value = r.get<double>();

                if (r.ok)
                    applyValue (id, value);

                break;
            }

            case protocol::state:
                applyState (r.p, (size_t) (r.end - r.p));
                break;

            case protocol::snapshot:
            {
                const auto count = r.get<uint32>();

                for (uint32 i = 0; i < count && r.ok; ++i)
                {
                    const auto id = r.get<uint32>();
                    const auto value = r.get<double>();

                    if (r.ok)
                        applyValue (id, value);
                }

                const auto stateSize = r.get<uint32>();

                if (r.ok && stateSize > 0 && r.has (stateSize))
                    applyState (r.p, stateSize);

                if (count == 0 && stateSize == 0)
                    needsSync = true; // the DSP side knows nothing yet: seed it from the stand-in

                ++snapshotsReceived;
                break;
            }

            default:
                break; // stream frames are for meters, which this bridge does not handle yet
        }
    }

    /** Sends what changed since the last call. Call once per UI frame: at most one value per parameter goes
        out per frame, gestures keep their order relative to the values. */
    void flush()
    {
        if (std::exchange (needsSync, false))
        {
            sendState (protocol::flagSync);

            for (auto& [id, parameter] : parametersById)
            {
                remoteValues[id] = parameter->getValue();
                protocol::Writer w (protocol::param, protocol::flagSync);
                w.u32 (id);
                w.f64 (parameter->getValue());
                emit (w);
            }
        }

        for (const auto& event : pending)
        {
            if (event.isGesture)
            {
                protocol::Writer w (protocol::gesture);
                w.u32 (event.id);
                w.u8 (event.begin ? 1 : 0);
                emit (w);
            }
            else
            {
                // Plugins often re-apply values they were just given (deferred patch application, attachments
                // syncing). Values the DSP side already has are not news.
                if (const auto known = remoteValues.find (event.id);
                    known != remoteValues.end() && approximatelyEqual ((float) known->second, (float) event.value))
                    continue;

                remoteValues[event.id] = event.value;
                protocol::Writer w (protocol::param);
                w.u32 (event.id);
                w.f64 (event.value);
                emit (w);
            }
        }

        pending.clear();
        pendingValue.clear();

        if (std::exchange (stateChanged, false))
            sendState (0);
    }

    int getSnapshotsReceived() const noexcept { return snapshotsReceived; }

    std::function<void (uint32 id, double value)> onRemoteValue;
    std::function<void()> onRemoteState;

private:
    struct Event
    {
        uint32 id;
        double value;
        bool isGesture, begin;
    };

    void emit (const protocol::Writer& w)
    {
        if (send)
            send (w.bytes.data(), w.bytes.size());
    }

    void sendState (uint8 flags)
    {
        MemoryBlock block;
        processor.getStateInformation (block);

        if (block == remoteState)
            return;

        remoteState = block;

        protocol::Writer w (protocol::state, flags);
        w.put (block.getData(), block.getSize());
        emit (w);
    }

    void applyValue (uint32 id, double value)
    {
        if (auto* parameter = findParameter (id))
        {
            const auto v = (float) jlimit (0.0, 1.0, value);
            remoteValues[id] = v;

            if (! approximatelyEqual (parameter->getValue(), v))
            {
                // What JUCE's plugin wrappers do for host automation: set, then tell listeners (attachments).
                parameter->setValue (v);
                parameter->sendValueChangedMessageToListeners (v);
            }

            if (onRemoteValue)
                onRemoteValue (id, value);
        }
    }

    void applyState (const void* data, size_t size)
    {
        remoteState = MemoryBlock (data, size);
        processor.setStateInformation (data, (int) size);

        if (onRemoteState)
            onRemoteState();
    }

    //==============================================================================
    void audioProcessorParameterChanged (AudioProcessor*, int index, float newValue) override
    {
        if (applyingRemote)
            return;

        if (auto* parameter = processor.getParameters()[index])
        {
            const auto id = clapIdFor (*parameter);
            const auto it = pendingValue.find (id);

            if (it != pendingValue.end())
            {
                pending[it->second].value = newValue;
            }
            else
            {
                pendingValue[id] = pending.size();
                pending.push_back ({ id, newValue, false, false });
            }
        }
    }

    void gesture (int index, bool begin)
    {
        if (applyingRemote)
            return;

        if (auto* parameter = processor.getParameters()[index])
        {
            const auto id = clapIdFor (*parameter);
            pendingValue.erase (id); // later values must follow this gesture event
            pending.push_back ({ id, 0.0, true, begin });
        }
    }

    void audioProcessorParameterChangeGestureBegin (AudioProcessor*, int index) override { gesture (index, true); }
    void audioProcessorParameterChangeGestureEnd (AudioProcessor*, int index) override   { gesture (index, false); }

    void audioProcessorChanged (AudioProcessor*, const ChangeDetails& details) override
    {
        if (! applyingRemote && details.nonParameterStateChanged)
            stateChanged = true;
    }

    AudioProcessor& processor;
    Sender send;
    std::unordered_map<uint32, AudioProcessorParameter*> parametersById;
    std::vector<Event> pending;
    std::map<uint32, size_t> pendingValue;
    std::unordered_map<uint32, double> remoteValues; // what the DSP side has, as far as we know
    MemoryBlock remoteState;
    bool applyingRemote = false, stateChanged = false, needsSync = false;
    int snapshotsReceived = 0;
};

} // namespace juce::webclap
