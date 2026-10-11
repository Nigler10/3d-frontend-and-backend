import { useEffect, useRef, useState } from "react";
import { authFetch, getAccessToken } from "../../utils/auth";
import QuotationCard from "./QuotationCard";
import { useUnread } from "../../context/UnreadContext";
import { X, MessageSquare, Check } from "lucide-react";

export default function ChatBox({
    orderId,
    isAdmin,
    quotations = [],
    onQuotationAccepted,
    onRefreshOrder,
}) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const WSURL = BASEURL
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const socket = useRef(null);
    const bottomRef = useRef(null);
    const isOpenRef = useRef(false);
    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    const { fetchUnread } = useUnread();
    const currentQuotation = quotations.length
        ? quotations[quotations.length - 1]
        : null;

    const previousQuotation = quotations.length > 1
        ? quotations[quotations.length - 2]
        : null;

    const [socketStatus, setSocketStatus] = useState("connecting");

    const reconnectTimerRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const shouldReconnectRef = useRef(true);
    const activeOrderIdRef = useRef(orderId);

    const [isSending, setIsSending] = useState(false);

    const pendingMessageRef = useRef(null);
    const sendTimeoutRef = useRef(null);

    useEffect(() => {
        setMessages([]);
        loadConversation();

        activeOrderIdRef.current = orderId;
        shouldReconnectRef.current = true;
        reconnectAttemptsRef.current = 0;

        connectSocket();

        return () => {
            shouldReconnectRef.current = false;

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }

            if (sendTimeoutRef.current) {
                clearTimeout(sendTimeoutRef.current);
                sendTimeoutRef.current = null;
            }

            if (socket.current) {
                socket.current.onclose = null;
                socket.current.onerror = null;
                socket.current.close();
                socket.current = null;
            }
        };
    }, [orderId]);

    const firstLoad = useRef(true);

    useEffect(() => {
        if (firstLoad.current) {
            firstLoad.current = false;
            return;
        }

        bottomRef.current?.scrollIntoView({
            behavior: "smooth"
        });
    }, [messages]);

    async function markConversationRead() {
        await authFetch(
            `${BASEURL}/api/chat/orders/${orderId}/read/`,
            {
                method: "POST",
            }
        );
        fetchUnread();
    }

    async function loadConversation() {
        try {
            const res = await authFetch(
                `${BASEURL}/api/chat/orders/${orderId}/`
            );

            if (!res.ok) {
                console.error("Failed to load conversation.");
                return;
            }

            const data = await res.json();
            const loadedMessages = Array.isArray(data.messages)
                ? data.messages
                : [];

            setMessages((prev) => {
                const merged = new Map();

                prev.forEach((msg) => {
                    merged.set(msg.id, msg);
                });

                loadedMessages.forEach((msg) => {
                    merged.set(msg.id, msg);
                });

                return Array.from(merged.values()).sort(
                    (a, b) =>
                        new Date(a.created_at) -
                        new Date(b.created_at)
                );
            });
        } catch (error) {
            console.error(
                "Failed to load conversation:",
                error
            );
        }
    }

    function connectSocket() {
        const token = getAccessToken();
        const socketOrderId = orderId;

        if (!token) {
            setSocketStatus("disconnected");
            return;
        }

        if (
            socket.current &&
            (
                socket.current.readyState === WebSocket.OPEN ||
                socket.current.readyState === WebSocket.CONNECTING
            )
        ) {
            return;
        }

        setSocketStatus("connecting");

        const ws = new WebSocket(
            `${WSURL}/ws/chat/orders/${socketOrderId}/?token=${token}`
        );

        socket.current = ws;

        ws.onopen = () => {
            console.log("Chat WebSocket connected");

            reconnectAttemptsRef.current = 0;
            setSocketStatus("connected");
        };

        ws.onmessage = (event) => {
            let data;

            try {
                data = JSON.parse(event.data);
            } catch (error) {
                console.error(
                    "Invalid chat WebSocket payload:",
                    error
                );
                return;
            }

            const incomingMessage = {
                id: data.id,
                sender_type: data.sender_type,
                message_type: data.message_type || "text",
                content: data.message || "",
                metadata: data.metadata || {},
                attachment: data.attachment || null,
                created_at: data.created_at,
            };

            const expectedSender = isAdmin ? "admin" : "customer";

            if (
                pendingMessageRef.current &&
                incomingMessage.sender_type === expectedSender &&
                incomingMessage.content === pendingMessageRef.current
            ) {
                const confirmedMessage = pendingMessageRef.current;

                pendingMessageRef.current = null;
                setIsSending(false);

                if (sendTimeoutRef.current) {
                    clearTimeout(sendTimeoutRef.current);
                    sendTimeoutRef.current = null;
                }

                setMessage((current) =>
                    current.trim() === confirmedMessage ? "" : current
                );
            }

            setMessages((prev) => {
                const alreadyExists = prev.some(
                    (msg) => msg.id === incomingMessage.id
                );

                if (alreadyExists) {
                    return prev;
                }

                return [
                    ...prev,
                    incomingMessage,
                ];
            });

            if (isOpenRef.current) {
                markConversationRead();
            } else {
                fetchUnread();
            }
        };

        ws.onerror = (error) => {
            console.error(
                "Chat WebSocket error:",
                error
            );
        };

        ws.onclose = (event) => {
            console.warn(
                "Chat WebSocket disconnected:",
                event.code,
                event.reason
            );

            if (socket.current === ws) {
                socket.current = null;
            }

            setSocketStatus("disconnected");

            if (!shouldReconnectRef.current) {
                return;
            }

            if (activeOrderIdRef.current !== socketOrderId) {
                return;
            }

            const attempt = reconnectAttemptsRef.current;

            const delay = Math.min(
                1000 * Math.pow(2, attempt),
                10000
            );

            reconnectAttemptsRef.current += 1;

            clearTimeout(reconnectTimerRef.current);

            reconnectTimerRef.current = setTimeout(() => {
                connectSocket();
            }, delay);
        };
    }

    function sendMessage() {
        const trimmedMessage = message.trim();

        if (!trimmedMessage || isSending) {
            return;
        }

        if (
            !socket.current ||
            socket.current.readyState !== WebSocket.OPEN
        ) {
            console.warn(
                "Chat WebSocket is not connected. Reconnecting..."
            );

            setSocketStatus("connecting");
            connectSocket();

            return;
        }

        try {
            pendingMessageRef.current = trimmedMessage;
            setIsSending(true);

            socket.current.send(
                JSON.stringify({
                    message: trimmedMessage,
                })
            );

            if (sendTimeoutRef.current) {
                clearTimeout(sendTimeoutRef.current);
            }

            sendTimeoutRef.current = setTimeout(() => {
                if (
                    pendingMessageRef.current === trimmedMessage
                ) {
                    console.warn(
                        "Chat message was not confirmed by the server."
                    );

                    pendingMessageRef.current = null;
                    setIsSending(false);

                    if (socket.current) {
                        socket.current.close();
                    }
                }
            }, 8000);

        } catch (error) {
            console.error(
                "Failed to send chat message:",
                error
            );

            pendingMessageRef.current = null;
            setIsSending(false);
            setSocketStatus("disconnected");

            try {
                socket.current?.close();
            } catch {
                // Ignore close error.
            }

            socket.current = null;
            connectSocket();
        }
    }

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={async () => {
                    const opening = !isOpen;
                    setIsOpen(opening);
                    if (opening) {
                        await markConversationRead();
                        await onRefreshOrder?.();
                        await loadConversation();
                    }
                }}
                className={`fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-orange-500 text-white shadow-lg flex items-center justify-center hover:bg-orange-600 transition ${isOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
            </button>

            <div
                className={`fixed top-20 bottom-0 right-0 bg-white border-l shadow-2xl z-30 flex flex-col transition-transform duration-300 ${isOpen ? "translate-x-0 w-full md:w-[380px]" : "translate-x-full w-full md:w-[380px]"}`}
            >
                <div className="flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
                        <h3 className="font-bold text-stone-700">Order Chat</h3>

                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-2xl leading-none text-stone-500 hover:text-orange-500 transition"
                        >
                            ×
                        </button>
                    </div>
                    {currentQuotation && (
                        <QuotationCard
                            quotation={currentQuotation}
                            previousQuotation={previousQuotation}
                            isAdmin={isAdmin}
                            onAccepted={async () => {
                                await onQuotationAccepted?.();
                                await loadConversation();
                            }}
                        />
                    )}
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                        {messages
                            .filter((msg) => msg.message_type !== "quotation")
                            .map((msg) => {
                                const isSystemMessage =
                                    msg.message_type === "system" ||
                                    msg.sender_type === "system";

                                if (isSystemMessage) {
                                    const systemContent =
                                        msg.metadata?.event === "quotation_accepted" ||
                                            msg.metadata?.is_quotation_acceptance
                                            ? `Quotation accepted · ₱${Number(
                                                msg.metadata?.amount || 0
                                            ).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}`
                                            : msg.content;

                                    return (
                                        <div
                                            key={msg.id}
                                            className="flex justify-center py-0.5"
                                        >
                                            <div
                                                className="
                            max-w-[92%]
                            rounded-full
                            border border-orange-200
                            bg-orange-50
                            px-2.5 py-1
                            text-center
                            text-[11px]
                            font-semibold
                            leading-tight
                            text-orange-700
                        "
                                            >
                                                <Check className="w-3.5 h-3.5 mr-1 inline" />

                                                {systemContent}
                                            </div>
                                        </div>
                                    );
                                }

                                const isOwnMessage =
                                    msg.sender_type ===
                                    (isAdmin ? "admin" : "customer");

                                return (
                                    <div
                                        key={msg.id}
                                        className={
                                            isOwnMessage
                                                ? "text-right"
                                                : "text-left"
                                        }
                                    >
                                        <div
                                            className={`inline-block max-w-[80%] break-words rounded-lg px-3 py-2 ${isOwnMessage
                                                ? "bg-orange-500 text-white"
                                                : "bg-stone-100 text-stone-800"
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                );
                            })}
                        <div ref={bottomRef}></div>
                    </div>

                    {socketStatus !== "connected" && (
                        <div className="px-4 pt-2 text-xs font-semibold text-amber-600 bg-white">
                            {socketStatus === "connecting"
                                ? "Connecting to chat..."
                                : "Chat disconnected. Reconnecting..."}
                        </div>
                    )}

                    <div className="flex gap-2 p-4 border-t bg-white">
                        <input
                            value={message}
                            maxLength={2000}
                            aria-label="Chat message"
                            placeholder="Type a message..."
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            className="flex-1 border rounded-lg px-3 py-2 outline-none focus:border-orange-500"
                        />

                        <button
                            onClick={sendMessage}
                            disabled={
                                socketStatus !== "connected" ||
                                isSending
                            }
                            className="px-4 rounded-lg bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {socketStatus !== "connected"
                                ? "Connecting..."
                                : isSending
                                    ? "Sending..."
                                    : "Send"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}