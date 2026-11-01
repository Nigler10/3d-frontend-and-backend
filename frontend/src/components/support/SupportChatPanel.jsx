// src/components/support/SupportChatPanel.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CheckCircle2,
    Image as ImageIcon,
    LoaderCircle,
    Paperclip,
    RotateCcw,
    Send,
    Wifi,
    WifiOff,
    X,
} from "lucide-react";
import { authFetch, getAccessToken } from "../../utils/auth";
import { useUnread } from "../../context/UnreadContext";

const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
const WSURL = BASEURL
    .replace("http://", "ws://")
    .replace("https://", "wss://");

const normalizeMessage = (message) => ({
    ...message,
    content: message.content ?? message.message ?? "",
    attachment: message.attachment || null,
});

function mergeMessages(previous, incoming) {
    const merged = new Map();
    [...previous, ...incoming].forEach((message) => {
        if (message?.id != null) merged.set(message.id, normalizeMessage(message));
    });
    return Array.from(merged.values()).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );
}

function formatTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function SupportChatPanel({
    conversationId,
    status = "open",
    isAdmin = false,
    onMessagesChange,
    onConversationUpdate,
    onToggleStatus,
    onRead,
    customerName = "Customer",
}) {
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreview, setFilePreview] = useState("");
    const [sending, setSending] = useState(false);
    const [socketStatus, setSocketStatus] = useState("connecting");
    const [error, setError] = useState("");
    const socketRef = useRef(null);
    const messagesScrollRef = useRef(null);
    const onMessagesChangeRef = useRef(onMessagesChange);
    const onConversationUpdateRef = useRef(onConversationUpdate);
    const onReadRef = useRef(onRead);
    const reconnectTimerRef = useRef(null);
    const { fetchSupportUnread } = useUnread();

    useEffect(() => {
        onMessagesChangeRef.current = onMessagesChange;
    }, [onMessagesChange]);

    useEffect(() => {
        onConversationUpdateRef.current = onConversationUpdate;
    }, [onConversationUpdate]);

    useEffect(() => {
        onReadRef.current = onRead;
    }, [onRead]);

    useEffect(() => {
        if (!selectedFile) {
            setFilePreview("");
            return undefined;
        }

        const objectUrl = URL.createObjectURL(selectedFile);
        setFilePreview(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    useEffect(() => {
        onMessagesChangeRef.current?.(messages);
    }, [messages]);

    useEffect(() => {
        const container = messagesScrollRef.current;
        if (!container) return;
        container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
        });
    }, [messages]);

    const markRead = useCallback(async () => {
        if (!conversationId) return;
        try {
            await authFetch(`${BASEURL}/api/chat/support/${conversationId}/read/`, {
                method: "POST",
            });
            await fetchSupportUnread?.();
            onReadRef.current?.();
        } catch (err) {
            console.error("Failed to mark support messages as read:", err);
        }
    }, [conversationId, fetchSupportUnread]);

    const loadConversation = useCallback(async () => {
        if (!conversationId) return;

        try {
            const response = await authFetch(
                `${BASEURL}/api/chat/support/${conversationId}/`
            );

            if (!response.ok) {
                throw new Error("Unable to load this support conversation.");
            }

            const data = await response.json();
            setMessages((previous) => mergeMessages(previous, data.messages || []));
            onConversationUpdateRef.current?.({
                id: data.id,
                status: data.status,
                customer_id: data.customer_id,
                customer_name: data.customer_name,
            });
            await markRead();
        } catch (err) {
            console.error("Failed to load support conversation:", err);
            setError(err.message || "Unable to load conversation.");
        }
    }, [conversationId, markRead]);

    useEffect(() => {
        if (!conversationId) return undefined;

        let active = true;
        let reconnectAttempts = 0;
        let currentSocket = null;
        let startupTimer = null;

        const connect = () => {
            if (!active) return;

            const token = getAccessToken();
            if (!token) {
                setSocketStatus("disconnected");
                return;
            }

            setSocketStatus("connecting");
            const socket = new WebSocket(
                `${WSURL}/ws/chat/support/${conversationId}/?token=${encodeURIComponent(token)}`
            );
            currentSocket = socket;
            socketRef.current = socket;

            socket.onopen = () => {
                reconnectAttempts = 0;
                setSocketStatus("connected");
                console.info(`Support WebSocket connected for conversation ${conversationId}.`);
                void loadConversation();
            };

            socket.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (err) {
                    console.error("Invalid support WebSocket payload:", err);
                    return;
                }

                if (data.type === "support_message" && data.message) {
                    const incoming = normalizeMessage(data.message);
                    setMessages((previous) => mergeMessages(previous, [incoming]));
                    if (incoming.sender_type !== (isAdmin ? "admin" : "customer")) {
                        void markRead();
                    }
                }

                if (data.type === "conversation_update") {
                    onConversationUpdateRef.current?.({
                        id: data.conversation_id,
                        status: data.status,
                    });
                }
            };

            socket.onerror = (event) => {
                console.warn("Support WebSocket error:", event);
            };

            socket.onclose = (event) => {
                if (socketRef.current === socket) socketRef.current = null;
                if (!active) return;

                console.warn("Support WebSocket closed:", event.code, event.reason);
                setSocketStatus("disconnected");
                // Auth/permission close codes should not reconnect forever.
                if (event.code === 4001 || event.code === 4003 || event.code === 4401) {
                    return;
                }

                const delay = Math.min(1000 * (2 ** reconnectAttempts), 10000);
                reconnectAttempts += 1;
                reconnectTimerRef.current = setTimeout(connect, delay);
            };
        };

        void loadConversation();
        // React StrictMode runs an extra setup/cleanup cycle in development.
        // Deferring socket creation prevents that first, immediately-cancelled connection.
        startupTimer = setTimeout(connect, 0);

        return () => {
            active = false;
            if (startupTimer) clearTimeout(startupTimer);
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (currentSocket) {
                currentSocket.onclose = null;
                currentSocket.close();
            }
            socketRef.current = null;
        };
    }, [conversationId, isAdmin, loadConversation, markRead]);

    const canSend = useMemo(
        () => Boolean(draft.trim() || selectedFile) && !sending,
        [draft, selectedFile, sending]
    );

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setError("Please choose an image file.");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("Images must be 5 MB or smaller.");
            return;
        }

        setError("");
        setSelectedFile(file);
    };

    const sendMessage = async () => {
        const content = draft.trim();
        if ((!content && !selectedFile) || sending) return;

        setSending(true);
        setError("");

        try {
            const body = new FormData();
            if (content) body.append("content", content);
            if (selectedFile) body.append("attachment", selectedFile);

            const response = await authFetch(
                `${BASEURL}/api/chat/support/${conversationId}/send/`,
                {
                    method: "POST",
                    body,
                }
            );

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = data?.attachment?.[0] || data?.content?.[0] || data?.detail;
                throw new Error(detail || "Message could not be sent.");
            }

            setMessages((previous) => mergeMessages(previous, [data]));
            setDraft("");
            setSelectedFile(null);

            // The backend automatically reopens a resolved conversation
            // when its customer sends a new message. Keep the customer UI in sync.
            if (!isAdmin) {
                onConversationUpdateRef.current?.({
                    id: conversationId,
                    status: "open",
                });
            }

            await markRead();
        } catch (err) {
            console.error("Failed to send support message:", err);
            setError(err.message || "Message could not be sent. Please try again.");
        } finally {
            setSending(false);
        }
    };

    const ownSenderType = isAdmin ? "admin" : "customer";

    return (
        <section className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#f0dfca] bg-white shadow-sm">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#f2e5d6] px-4 py-3 sm:px-5">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-bold text-stone-800">
                            {isAdmin ? customerName : "Customer Support"}
                        </h2>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status === "resolved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                            {status || "open"}
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                        {isAdmin ? "Private customer conversation" : "Your private conversation with Smiley Page Corner"}
                    </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <span className={`hidden items-center gap-1 text-[11px] font-medium sm:flex ${socketStatus === "connected" ? "text-emerald-600" : "text-amber-600"}`}>
                        {socketStatus === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}
                        {socketStatus === "connected" ? "Live" : "Reconnecting"}
                    </span>
                    {isAdmin && onToggleStatus && (
                        <button
                            type="button"
                            onClick={onToggleStatus}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${status === "resolved" ? "bg-[#fff3e5] text-[#96511e] hover:bg-[#ffe8ce]" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                        >
                            {status === "resolved" ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                            {status === "resolved" ? "Reopen" : "Resolve"}
                        </button>
                    )}
                </div>
            </header>

            <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#fffdf9] px-3 py-4 sm:px-5"
            >
                {messages.length === 0 ? (
                    <div className="flex min-h-full flex-col items-center justify-center py-6 text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff1e2] text-[#a45b24]">
                            <ImageIcon size={25} />
                        </div>
                        <h3 className="font-bold text-stone-800">Start a conversation</h3>
                        <p className="mt-1 text-sm leading-6 text-stone-500">
                            Ask us about cake designs, flavors, customizations, or anything you need help with.
                        </p>
                    </div>
                ) : (
                    <div className="flex min-h-full flex-col justify-end space-y-4">
                        {messages.map((message) => {
                            const isOwn = message.sender_type === ownSenderType;
                            const isSystem = message.sender_type === "system" || message.message_type === "system";

                            if (isSystem) {
                                return (
                                    <div key={message.id} className="flex justify-center">
                                        <span className="rounded-full bg-stone-100 px-3 py-1 text-center text-[11px] text-stone-500">
                                            {message.content}
                                        </span>
                                    </div>
                                );
                            }

                            return (
                                <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[86%] sm:max-w-[76%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                                        <span className="mb-1 px-1 text-[10px] font-semibold text-stone-400">
                                            {isOwn ? "You" : (message.sender_name || (isAdmin ? "Customer" : "Smiley Page Corner"))}
                                        </span>
                                        <div className={`overflow-hidden rounded-2xl ${isOwn ? "rounded-br-md bg-[#a85d29] text-white" : "rounded-bl-md border border-[#eee1d3] bg-white text-stone-800"}`}>
                                            {message.attachment && (
                                                <a href={message.attachment} target="_blank" rel="noreferrer" className="block">
                                                    <img
                                                        src={message.attachment}
                                                        alt="Shared cake reference"
                                                        loading="lazy"
                                                        className="max-h-72 w-full max-w-[300px] object-cover"
                                                    />
                                                </a>
                                            )}
                                            {message.content && (
                                                <p className="whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-6">
                                                    {message.content}
                                                </p>
                                            )}
                                        </div>
                                        <span className="mt-1 px-1 text-[10px] text-stone-400">
                                            {formatTime(message.created_at)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-start justify-between gap-3 border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError("")} aria-label="Dismiss error">
                        <X size={14} />
                    </button>
                </div>
            )}

            {filePreview && (
                <div className="flex items-center gap-3 border-t border-[#f2e5d6] bg-[#fffaf4] px-4 py-2">
                    <img src={filePreview} alt="Selected upload preview" className="h-12 w-12 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-stone-700">{selectedFile?.name}</p>
                        <p className="text-[10px] text-stone-500">Ready to send · maximum 5 MB</p>
                    </div>
                    <button type="button" onClick={() => setSelectedFile(null)} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Remove selected image">
                        <X size={16} />
                    </button>
                </div>
            )}

            <footer className="shrink-0 border-t border-[#f2e5d6] bg-white p-3 sm:p-4">
                <div className="flex items-end gap-2">
                    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#ead9c7] text-[#9a5a2b] transition hover:bg-[#fff5e9]" title="Attach an image">
                        <Paperclip size={19} />
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                    <textarea
                        value={draft}
                        rows={1}
                        maxLength={2000}
                        placeholder="Write a message..."
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void sendMessage();
                            }
                        }}
                        className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-[#ead9c7] px-3.5 py-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-[#bd7945] focus:ring-2 focus:ring-[#bd7945]/10"
                    />
                    <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={!canSend}
                        className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#a85d29] px-4 text-sm font-bold text-white transition hover:bg-[#88471f] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {sending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={16} />}
                        <span className="hidden sm:inline">Send</span>
                    </button>
                </div>
                <p className="mt-2 pl-1 text-[10px] text-stone-400">Images only · 5 MB maximum · Press Enter to send, Shift + Enter for a new line</p>
            </footer>
        </section>
    );
}
