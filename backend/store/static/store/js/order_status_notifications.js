(() => {
    let socket;
    let reconnectTimer;
    let reconnect = true;

    function showCancellationToast(orderId) {
        let container = document.getElementById("order-status-toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "order-status-toast-container";
            container.setAttribute("aria-live", "polite");
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = "order-status-admin-toast";
        toast.setAttribute("role", "status");

        const icon = document.createElement("span");
        icon.className = "order-status-admin-toast__icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "!";

        const message = document.createElement("span");
        message.className = "order-status-admin-toast__message";
        message.textContent = `Order #${orderId}: Cancelled`;

        const close = document.createElement("button");
        close.className = "order-status-admin-toast__close";
        close.type = "button";
        close.setAttribute("aria-label", "Dismiss notification");
        close.textContent = "×";
        close.addEventListener("click", () => toast.remove());

        const progress = document.createElement("span");
        progress.className = "order-status-admin-toast__progress";

        toast.append(icon, message, close, progress);
        container.appendChild(toast);
        window.setTimeout(() => toast.remove(), 6000);
    }

    function connect() {
        if (!reconnect) return;

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/orders/status/`);
        socket.addEventListener("message", (event) => {
            try {
                const update = JSON.parse(event.data);
                if (update.type === "order_status" && update.status === "cancelled") {
                    showCancellationToast(update.order_id);
                }
            } catch (error) {
                console.error("Invalid order status websocket payload:", error);
            }
        });
        socket.addEventListener("close", () => {
            if (reconnect) reconnectTimer = window.setTimeout(connect, 3000);
        });
    }

    connect();
    window.addEventListener("beforeunload", () => {
        reconnect = false;
        window.clearTimeout(reconnectTimer);
        socket?.close();
    });
})();