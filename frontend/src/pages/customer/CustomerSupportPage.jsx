// src/pages/customer/CustomerSupportPage.jsx
import { useCallback, useEffect, useState } from "react";
import { Headset, Image as ImageIcon, LockKeyhole, MessageCircle, RefreshCw } from "lucide-react";
import { authFetch } from "../../utils/auth";
import { useUnread } from "../../context/UnreadContext";
import SupportChatPanel from "../../components/support/SupportChatPanel";
import SupportMediaPanel from "../../components/support/SupportMediaPanel";

const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

export default function CustomerSupportPage() {
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [mobileView, setMobileView] = useState("chat");
    const { fetchSupportUnread } = useUnread();

    const loadSupportConversation = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await authFetch(`${BASEURL}/api/chat/support/`);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data?.detail || data?.error || "Unable to open Customer Support.");
            }

            setConversation(data);
            setMessages(Array.isArray(data.messages) ? data.messages : []);
            await fetchSupportUnread?.();
        } catch (err) {
            console.error("Failed to open customer support:", err);
            setError(err.message || "Unable to open Customer Support. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [fetchSupportUnread]);

    useEffect(() => {
        void loadSupportConversation();
    }, [loadSupportConversation]);

    const updateConversation = (updates) => {
        if (!updates) return;
        setConversation((previous) => previous ? { ...previous, ...updates } : updates);
    };

    if (loading) {
        return (
            <main className="flex h-[calc(100dvh-5rem)] min-h-0 items-center justify-center overflow-hidden bg-[#fffaf4] px-4">
                <div className="flex items-center gap-3 rounded-2xl border border-[#f0dfca] bg-white px-5 py-4 text-sm font-medium text-stone-600 shadow-sm">
                    <RefreshCw className="animate-spin text-[#a85d29]" size={18} />
                    Opening your support conversation...
                </div>
            </main>
        );
    }

    if (error || !conversation) {
        return (
            <main className="flex h-[calc(100dvh-5rem)] min-h-0 items-center justify-center overflow-hidden bg-[#fffaf4] px-4">
                <div className="max-w-md rounded-2xl border border-[#f0dfca] bg-white p-7 text-center shadow-sm">
                    <Headset className="mx-auto mb-3 text-[#a85d29]" size={34} />
                    <h1 className="text-lg font-bold text-stone-800">Customer Support</h1>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{error || "Your support conversation could not be loaded."}</p>
                    <button onClick={() => void loadSupportConversation()} className="mt-5 rounded-xl bg-[#a85d29] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#88471f]">
                        Try again
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-[#fffaf4] p-2 sm:p-3">
            {/* Mobile navigation: the desktop side panels become separate views. */}
            <div className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-[#f0dfca] bg-white p-1 lg:hidden">
                <button
                    type="button"
                    aria-pressed={mobileView === "chat"}
                    onClick={() => setMobileView("chat")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition ${mobileView === "chat" ? "bg-[#a85d29] text-white shadow-sm" : "text-stone-500 hover:bg-[#fff5e9]"}`}
                >
                    <MessageCircle size={15} /> Chat
                </button>
                <button
                    type="button"
                    aria-pressed={mobileView === "media"}
                    onClick={() => setMobileView("media")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold transition ${mobileView === "media" ? "bg-[#a85d29] text-white shadow-sm" : "text-stone-500 hover:bg-[#fff5e9]"}`}
                >
                    <ImageIcon size={15} /> Media
                </button>
            </div>

            <div className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(190px,0.8fr)_minmax(0,2.2fr)_minmax(230px,0.95fr)]">
                {/* Left information panel */}
                <aside className="hidden h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain lg:flex">
                    <section className="rounded-2xl border border-[#f0dfca] bg-white p-5 shadow-sm">
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff1e2] text-[#a85d29]">
                            <Headset size={22} />
                        </div>
                        <h1 className="text-lg font-black text-stone-800">Need a hand?</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500">
                            Talk to the Smiley Page Corner team about cake designs, flavors, pricing, or your order questions.
                        </p>
                    </section>

                    <section className="rounded-2xl border border-[#f0dfca] bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-2 text-stone-700">
                            <LockKeyhole size={17} className="text-[#a85d29]" />
                            <h2 className="text-sm font-bold">Private conversation</h2>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-stone-500">
                            This chat is visible to you and authorized store administrators. Your messages and shared images stay in this conversation.
                        </p>
                        <div className="mt-4 border-t border-stone-100 pt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Conversation status</p>
                            <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${conversation.status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                {conversation.status || "open"}
                            </span>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-[#f0dfca] bg-[#fff3e5] p-5">
                        <div className="flex items-center gap-2 text-[#89501f]">
                            <MessageCircle size={17} />
                            <h2 className="text-sm font-bold">A little tip</h2>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#8d6848]">
                            You can attach a cake inspiration photo with the paperclip button. Add a message too, so the team knows what details to look at.
                        </p>
                    </section>
                </aside>

                {/* Dominant middle chat column */}
                <div className={`${mobileView === "chat" ? "flex" : "hidden"} h-full min-h-0 min-w-0 lg:flex`}>
                    <SupportChatPanel
                        conversationId={conversation.id}
                        status={conversation.status}
                        isAdmin={false}
                        onMessagesChange={setMessages}
                        onConversationUpdate={updateConversation}
                    />
                </div>

                {/* Three-column image gallery */}
                <div className={`${mobileView === "media" ? "flex" : "hidden"} h-full min-h-0 min-w-0 lg:flex`}>
                    <SupportMediaPanel messages={messages} />
                </div>
            </div>
        </main>
    );
}
