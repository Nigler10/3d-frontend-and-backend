// src/pages/admin/AdminSupportPage.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, MessageCircle, RefreshCw, Search, Users } from "lucide-react";
import { authFetch, getAccessToken } from "../../utils/auth";
import SupportChatPanel from "../../components/support/SupportChatPanel";
import SupportMediaPanel from "../../components/support/SupportMediaPanel";

const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
const WSURL = BASEURL
    .replace("http://", "ws://")
    .replace("https://", "wss://");

function initials(name = "Customer") {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "C";
}

function timeLabel(value) {
    if (!value) return "";
    const date = new Date(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    return sameDay
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function AdminSupportPage() {
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [filter, setFilter] = useState("open");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [mobileView, setMobileView] = useState("inbox");

    const fetchInbox = useCallback(async () => {
        try {
            const query = filter === "all" ? "" : `?status=${filter}`;
            const response = await authFetch(`${BASEURL}/api/chat/support/inbox/${query}`);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data?.detail || data?.error || "Unable to load the support inbox.");
            }

            const rows = Array.isArray(data.results) ? data.results : [];
            setConversations(rows);
            setError("");

            setActiveConversation((previous) => {
                if (!previous) return previous;
                const refreshed = rows.find((item) => item.id === previous.id);
                return refreshed ? { ...previous, ...refreshed } : previous;
            });
        } catch (err) {
            console.error("Failed to load support inbox:", err);
            setError(err.message || "Unable to load the support inbox.");
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        void fetchInbox();
    }, [fetchInbox]);

    // The inbox WebSocket only sends lightweight conversation-update events.
    // Refreshing the list keeps preview text, timestamps and unread counts accurate.
    useEffect(() => {
        let active = true;
        let socket = null;
        let reconnectTimer = null;
        let startupTimer = null;
        let attempts = 0;

        const connect = () => {
            if (!active) return;
            const token = getAccessToken();
            if (!token) return;

            socket = new WebSocket(
                `${WSURL}/ws/chat/support/inbox/?token=${encodeURIComponent(token)}`
            );

            socket.onopen = () => {
                attempts = 0;
                console.info("Support inbox WebSocket connected.");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === "support_inbox_update") {
                        void fetchInbox();
                    }
                } catch (err) {
                    console.error("Invalid support inbox WebSocket payload:", err);
                }
            };

            socket.onerror = (event) => {
                console.warn("Support inbox WebSocket error:", event);
            };

            socket.onclose = (event) => {
                if (!active) return;
                console.warn("Support inbox WebSocket closed:", event.code, event.reason);
                if ([4001, 4003, 4401].includes(event.code)) return;
                const delay = Math.min(1000 * (2 ** attempts), 10000);
                attempts += 1;
                reconnectTimer = setTimeout(connect, delay);
            };
        };

        // Deferring the first connection avoids opening a socket that React StrictMode
        // immediately tears down during its development-only effect check.
        startupTimer = setTimeout(connect, 0);
        // Poll as a fallback if the inbox WebSocket is temporarily unavailable.
        const poll = setInterval(() => void fetchInbox(), 30000);

        return () => {
            active = false;
            clearInterval(poll);
            if (startupTimer) clearTimeout(startupTimer);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (socket) {
                socket.onclose = null;
                socket.close();
            }
        };
    }, [fetchInbox]);

    const filteredConversations = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return conversations;
        return conversations.filter((conversation) => {
            const name = `${conversation.customer_name || ""} ${conversation.customer_username || ""} ${conversation.customer_email || ""}`.toLowerCase();
            return name.includes(term);
        });
    }, [conversations, search]);

    const changeStatus = async () => {
        if (!activeConversation) return;
        const nextStatus = activeConversation.status === "resolved" ? "open" : "resolved";

        try {
            const response = await authFetch(
                `${BASEURL}/api/chat/support/${activeConversation.id}/status/`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ status: nextStatus }),
                }
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.detail || data?.status?.[0] || "Unable to update conversation status.");
            }

            setActiveConversation((previous) => previous ? { ...previous, status: data.status } : previous);
            await fetchInbox();
        } catch (err) {
            console.error("Failed to update support status:", err);
            setError(err.message || "Unable to update conversation status.");
        }
    };

    const updateActiveConversation = (updates) => {
        if (!updates) return;
        setActiveConversation((previous) => previous ? { ...previous, ...updates } : updates);
        if (updates.status) void fetchInbox();
    };

    return (
        <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-[#fffaf4] p-2 sm:p-3">
            {/* Mobile navigation: show one workspace panel at a time. */}
            <div className="mb-2 grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-[#f0dfca] bg-white p-1 lg:hidden">
                <button
                    type="button"
                    aria-pressed={mobileView === "inbox"}
                    onClick={() => setMobileView("inbox")}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-bold transition ${mobileView === "inbox" ? "bg-[#a85d29] text-white shadow-sm" : "text-stone-500 hover:bg-[#fff5e9]"}`}
                >
                    <Users size={14} /> Customers
                </button>
                <button
                    type="button"
                    aria-pressed={mobileView === "chat"}
                    onClick={() => setMobileView("chat")}
                    disabled={!activeConversation}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${mobileView === "chat" ? "bg-[#a85d29] text-white shadow-sm" : "text-stone-500 hover:bg-[#fff5e9]"}`}
                >
                    <MessageCircle size={14} /> Chat
                </button>
                <button
                    type="button"
                    aria-pressed={mobileView === "media"}
                    onClick={() => setMobileView("media")}
                    disabled={!activeConversation}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${mobileView === "media" ? "bg-[#a85d29] text-white shadow-sm" : "text-stone-500 hover:bg-[#fff5e9]"}`}
                >
                    <ImageIcon size={14} /> Media
                </button>
            </div>

            <div className="mx-auto grid min-h-0 w-full max-w-[1900px] flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(235px,0.9fr)_minmax(0,2.3fr)_minmax(230px,0.95fr)]">
                {/* Left: customer list */}
                <aside className={`${mobileView === "inbox" ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#f0dfca] bg-white shadow-sm lg:flex`}>
                    <div className="border-b border-[#f2e5d6] p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-lg font-black text-stone-800">Support inbox</h1>
                                <p className="mt-0.5 text-xs text-stone-500">Customer conversations</p>
                            </div>
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff1e2] text-[#a85d29]">
                                <Users size={18} />
                            </span>
                        </div>
                        <div className="relative mt-4">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search customers..."
                                className="h-10 w-full rounded-xl border border-[#ead9c7] bg-[#fffdfa] pl-9 pr-3 text-xs outline-none focus:border-[#bd7945]"
                            />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1">
                            {[
                                { value: "open", label: "Open" },
                                { value: "resolved", label: "Resolved" },
                                { value: "all", label: "All" },
                            ].map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFilter(option.value)}
                                    className={`rounded-lg px-2 py-2 text-[11px] font-bold transition ${filter === option.value ? "bg-white text-[#96511e] shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-stone-500">
                                <RefreshCw size={15} className="animate-spin" /> Loading conversations...
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <MessageCircle className="mx-auto mb-3 text-stone-300" size={28} />
                                <p className="text-sm font-semibold text-stone-600">No conversations found</p>
                                <p className="mt-1 text-xs text-stone-400">New customer messages will appear here.</p>
                            </div>
                        ) : (
                            filteredConversations.map((conversation) => {
                                const isSelected = activeConversation?.id === conversation.id;
                                const customerName = conversation.customer_name || conversation.customer_username || "Customer";
                                const preview = conversation.last_message_type === "image"
                                    ? "Shared an image"
                                    : (conversation.last_message_content || "No messages yet");

                                return (
                                    <button
                                        key={conversation.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveConversation(conversation);
                                            setMessages([]);
                                            setMobileView("chat");
                                        }}
                                        className={`flex w-full items-center gap-2.5 border-b border-stone-100 px-3 py-2.5 text-left transition hover:bg-[#fff8ef] ${isSelected ? "bg-[#fff2e4]" : "bg-white"}`}
                                    >
                                        {conversation.customer_profile_picture ? (
                                            <img
                                                src={conversation.customer_profile_picture}
                                                alt={customerName}
                                                className="h-9 w-9 shrink-0 rounded-full bg-stone-100 object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3dfca] text-[11px] font-black text-[#89501f]">
                                                {initials(customerName)}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="truncate text-xs font-bold text-stone-800">{customerName}</p>
                                                <span className="shrink-0 text-[9px] text-stone-400">{timeLabel(conversation.last_message_at)}</span>
                                            </div>
                                            <p className="mt-1 truncate text-[11px] text-stone-500">{preview}</p>
                                            <div className="mt-1.5 flex items-center justify-between">
                                                <span className={`text-[9px] font-bold uppercase tracking-wide ${conversation.status === "resolved" ? "text-emerald-600" : "text-amber-600"}`}>
                                                    {conversation.status}
                                                </span>
                                                {Number(conversation.unread_count) > 0 && (
                                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d67b27] px-1 text-[10px] font-black text-white">
                                                        {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Middle: dominant conversation column */}
                <div className={`${mobileView === "chat" ? "flex" : "hidden"} h-full min-h-0 min-w-0 lg:flex`}>
                    {activeConversation ? (
                        <SupportChatPanel
                            key={activeConversation.id}
                            conversationId={activeConversation.id}
                            status={activeConversation.status}
                            isAdmin
                            customerName={activeConversation.customer_name || activeConversation.customer_username || "Customer"}
                            onMessagesChange={setMessages}
                            onConversationUpdate={updateActiveConversation}
                            onToggleStatus={changeStatus}
                            onRead={fetchInbox}
                        />
                    ) : (
                        <section className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#e8d4bf] bg-white/80 px-6 text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fff1e2] text-[#a85d29]">
                                <MessageCircle size={28} />
                            </div>
                            <h2 className="text-lg font-bold text-stone-800">Select a conversation</h2>
                            <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500">
                                Choose a customer from the left to view the conversation, reply, and review their shared cake references.
                            </p>
                        </section>
                    )}
                </div>

                {/* Right: three-column image gallery */}
                <div className={`${mobileView === "media" ? "flex" : "hidden"} h-full min-h-0 min-w-0 lg:flex`}>
                    <SupportMediaPanel messages={messages} />
                </div>
            </div>

            {error && (
                <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-lg">
                    {error}
                    <button type="button" onClick={() => setError("")} className="ml-3 font-bold">Dismiss</button>
                </div>
            )}
        </main>
    );
}
