/*
    juce_webclap_ui: message loop for the wasm platform layer.

    There is no message thread to block on. Posted messages wait in a queue that the page drains once per
    animation frame (see webclap::tick). Timers are advanced in the same call (patched juce_Timer.cpp).

    Included at the end of juce_events_wasm.cpp, inside the juce_events translation unit.
*/

namespace juce
{

class WasmMessageQueue
{
public:
    static WasmMessageQueue& get()
    {
        static WasmMessageQueue instance;
        return instance;
    }

    void post (MessageManager::MessageBase* message) { queue.push_back (message); }

    // Returns false if the queue was empty.
    bool dispatchNext()
    {
        if (queue.empty())
            return false;

        MessageManager::MessageBase::Ptr message (std::move (queue.front()));
        queue.pop_front();

        JUCE_TRY
        {
            message->messageCallback();
        }
        JUCE_CATCH_EXCEPTION

        return true;
    }

    // Dispatches what is queued now. Messages posted by these callbacks wait for the next frame, so a message
    // that keeps re-posting itself cannot hang the page.
    int dispatchPending()
    {
        auto count = (int) queue.size();
        int dispatched = 0;

        while (count-- > 0 && dispatchNext())
            ++dispatched;

        return dispatched;
    }

    void clear() { queue.clear(); }

private:
    std::deque<MessageManager::MessageBase::Ptr> queue;
};

void MessageManager::doPlatformSpecificInitialisation() {}

void MessageManager::doPlatformSpecificShutdown()
{
    WasmMessageQueue::get().clear();
}

bool MessageManager::postMessageToSystemQueue (MessageManager::MessageBase* const message)
{
    WasmMessageQueue::get().post (message);
    return true;
}

void MessageManager::broadcastMessage (const String&) {}

namespace detail
{
bool dispatchNextMessageOnSystemQueue (bool)
{
    // Never blocks: a wasm module that waits for messages would freeze the page.
    return WasmMessageQueue::get().dispatchNext();
}
} // namespace detail

namespace webclap
{
    int dispatchPendingMessages()
    {
        return WasmMessageQueue::get().dispatchPending();
    }
}

} // namespace juce
