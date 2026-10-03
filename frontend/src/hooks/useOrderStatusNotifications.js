import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { jwtDecode } from "jwt-decode";
import { getAccessToken } from "../utils/auth";
import { getOrderStatusLabel } from "../utils/orderStatus";

const STATUS_TOASTS = {
    pending_review: { label: "Pending Review", method: "info" },
    cancelled: { label: "Cancelled", method: "error" },
    awaiting_downpayment: {
        label: "Awaiting for Downpayment",
        method: "warning",
    },
    processing: { label: "Processing", method: "info" },
    delivered: { label: "Delivered", method: "success" },
};

function showOrderStatusToast(update) {
    const status = STATUS_TOASTS[update?.status];
    if (!status) return;

    const orderLabel = update.order_id ? `Order #${update.order_id}` : "Your order";
    const message = update.message
        || `${orderLabel}: ${status.label}. Your order status is now ${getOrderStatusLabel(update.status)}.`;

    toast[status.method](message);
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

        try {
            const user = jwtDecode(accessToken);
            if (user.is_staff || user.is_superuser) return undefined;
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
                if (update?.type === "order_status") showOrderStatusToast(update);
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