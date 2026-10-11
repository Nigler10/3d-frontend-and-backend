// src/hooks/userOrderStatusNotification.js
import { createElement, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import { getAccessToken } from "../utils/auth";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const STABLE_CONNECTION_DURATION = 30000;
const AUTHENTICATION_CLOSE_CODE = 4401;

const STATUS_TOASTS = {
    pending_review: { label: "Pending Review", tone: "success", icon: CircleCheck },
    cancelled: { label: "Cancelled", tone: "error", icon: CircleAlert },
    rejected: { label: "Order Rejected", tone: "error", icon: CircleAlert },
    awaiting_downpayment: {
        label: "Awaiting for your Downpayment",
        tone: "pending",
        icon: LoaderCircle,
    },
    processing: { label: "Processing", tone: "pending", icon: LoaderCircle },
    delivered: { label: "Delivered", tone: "success", icon: CircleCheck },
};

function showOrderStatusToast(update) {
    const status = STATUS_TOASTS[update?.status];
    if (!status) return;

    const StatusIcon = status.icon;
    const orderLabel = update.order_id ? `Order #${update.order_id}` : "Your order";
    const rejectionReason = update.status === "rejected"
        ? String(update.rejection_reason || "").trim()
        : "";
    const message = update.status === "rejected"
        ? createElement(
            "div",
            { className: "order-status-toast__content" },
            createElement("strong", null, `${orderLabel}: ${status.label}`),
            rejectionReason && createElement(
                "p",
                { className: "order-status-toast__reason" },
                `Reason: ${rejectionReason}`,
            ),
        )
        : update.message || `${orderLabel}: ${status.label}`;

    toast(message, {
        type: status.tone === "pending" ? "default" : status.tone,
        icon: createElement(StatusIcon, {
            "aria-hidden": true,
            className: status.tone === "pending" ? "order-status-toast__spinner" : "",
        }),
        className: `order-status-toast order-status-toast--${status.tone}`,
        progressClassName: `order-status-toast__progress--${status.tone}`,
        hideProgressBar: status.tone === "pending",
        autoClose: 6000,
    });
}

export default function useOrderStatusNotifications() {
    const [accessToken, setAccessToken] = useState(getAccessToken);

    useEffect(() => {
        const updateToken = () => setAccessToken(getAccessToken());
        window.addEventListener("auth:changed", updateToken);
        return () => window.removeEventListener("auth:changed", updateToken);
    }, []);

    useEffect(() => {
        if (!accessToken) return undefined;

        let isAdmin;
        try {
            const user = jwtDecode(accessToken);
            if (user.exp && user.exp * 1000 <= Date.now()) return undefined;
            isAdmin = Boolean(user.is_staff || user.is_superuser);
        } catch {
            return undefined;
        }

        const configuredUrl = import.meta.env.VITE_ORDER_STATUS_WS_URL;
        const djangoBaseUrl = import.meta.env.VITE_DJANGO_BASE_URL;
        const defaultBaseUrl = `${window.location.protocol}//${window.location.host}`;
        const baseUrl = djangoBaseUrl || defaultBaseUrl;
        const socketUrl = configuredUrl || `${baseUrl.replace(/^http/, "ws").replace(/\/$/, "")}/ws/orders/status/`;

        let socket;
        let startTimer;
        let reconnectTimer;
        let stableTimer;
        let disposed = false;
        let reconnectAttempts = 0;

        const handleMessage = (event) => {
            if (disposed) return;

            try {
                const update = JSON.parse(event.data);
                if (update?.type !== "order_status") return;
                if (isAdmin && update.status !== "cancelled") return;
                showOrderStatusToast(update);
                window.dispatchEvent(new CustomEvent("order:status", { detail: update }));
            } catch (error) {
                console.error("Invalid order status websocket payload:", error);
            }
        };

        const scheduleReconnect = () => {
            if (disposed || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

            const delay = Math.min(
                RECONNECT_BASE_DELAY * (2 ** reconnectAttempts),
                RECONNECT_MAX_DELAY,
            );
            reconnectAttempts += 1;
            reconnectTimer = window.setTimeout(connect, delay);
        };

        const connect = () => {
            if (disposed) return;

            try {
                const nextSocket = new WebSocket(
                    `${socketUrl}?token=${encodeURIComponent(accessToken)}`,
                );
                socket = nextSocket;

                nextSocket.addEventListener("open", () => {
                    if (disposed) {
                        nextSocket.close(1000, "No active notification listener");
                        return;
                    }

                    stableTimer = window.setTimeout(() => {
                        reconnectAttempts = 0;
                    }, STABLE_CONNECTION_DURATION);
                });
                nextSocket.addEventListener("message", handleMessage);
                nextSocket.addEventListener("error", () => {
                    if (!disposed) {
                        console.warn("Order status WebSocket connection failed.");
                    }
                });
                nextSocket.addEventListener("close", (event) => {
                    window.clearTimeout(stableTimer);
                    if (
                        disposed ||
                        event.code === 1000 ||
                        event.code === AUTHENTICATION_CLOSE_CODE
                    ) return;

                    scheduleReconnect();
                });
            } catch {
                scheduleReconnect();
            }
        };

        // Deferring setup lets React Strict Mode cancel its development-only first effect.
        startTimer = window.setTimeout(connect, 0);

        return () => {
            disposed = true;
            window.clearTimeout(startTimer);
            window.clearTimeout(reconnectTimer);
            window.clearTimeout(stableTimer);
            if (socket?.readyState === WebSocket.OPEN) {
                socket.close(1000, "Notification listener removed");
            }
        };
    }, [accessToken]);
}