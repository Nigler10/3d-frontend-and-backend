import { createElement, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import { getAccessToken } from "../utils/auth";

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
        let reconnectTimer;
        let shouldReconnect = true;

        const handleMessage = (event) => {
            try {
                const update = JSON.parse(event.data);
                if (update?.type !== "order_status") return;
                if (isAdmin && update.status !== "cancelled") return;
                showOrderStatusToast(update);
            } catch (error) {
                console.error("Invalid order status websocket payload:", error);
            }
        };

        const connect = () => {
            if (!shouldReconnect) return;

            socket = new WebSocket(`${socketUrl}?token=${encodeURIComponent(accessToken)}`);
            socket.addEventListener("message", handleMessage);
            socket.addEventListener("close", () => {
                if (shouldReconnect) reconnectTimer = window.setTimeout(connect, 3000);
            });
        };

        connect();

        return () => {
            shouldReconnect = false;
            window.clearTimeout(reconnectTimer);
            socket?.close();
        };
    }, [accessToken]);
}