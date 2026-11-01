import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { authFetch, getAccessToken } from "../utils/auth";

const UnreadContext = createContext(null);
const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

export function UnreadProvider({ children }) {
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [supportUnreadMessages, setSupportUnreadMessages] = useState(0);

    const fetchUnread = useCallback(async () => {
        if (!getAccessToken()) {
            setUnreadMessages(0);
            return;
        }

        try {
            const response = await authFetch(`${BASEURL}/api/chat/unread/`);
            if (!response.ok) return;
            const data = await response.json();
            setUnreadMessages(Number(data.total_unread) || 0);
        } catch (error) {
            console.error("Failed to fetch order-chat unread count:", error);
        }
    }, []);

    const fetchSupportUnread = useCallback(async () => {
        if (!getAccessToken()) {
            setSupportUnreadMessages(0);
            return;
        }

        try {
            const response = await authFetch(`${BASEURL}/api/chat/support/unread/`);
            if (!response.ok) return;
            const data = await response.json();
            setSupportUnreadMessages(Number(data.total_unread) || 0);
        } catch (error) {
            console.error("Failed to fetch support unread count:", error);
        }
    }, []);

    useEffect(() => {
        void fetchUnread();
        void fetchSupportUnread();

        const interval = setInterval(() => {
            void fetchUnread();
            void fetchSupportUnread();
        }, 10000);

        const handleAuthChange = () => {
            void fetchUnread();
            void fetchSupportUnread();
        };

        window.addEventListener("auth:changed", handleAuthChange);
        window.addEventListener("auth:logout", handleAuthChange);

        return () => {
            clearInterval(interval);
            window.removeEventListener("auth:changed", handleAuthChange);
            window.removeEventListener("auth:logout", handleAuthChange);
        };
    }, [fetchUnread, fetchSupportUnread]);

    return (
        <UnreadContext.Provider
            value={{
                unreadMessages,
                setUnreadMessages,
                fetchUnread,
                supportUnreadMessages,
                setSupportUnreadMessages,
                fetchSupportUnread,
            }}
        >
            {children}
        </UnreadContext.Provider>
    );
}

export function useUnread() {
    const context = useContext(UnreadContext);
    if (!context) {
        throw new Error("useUnread must be used within an UnreadProvider.");
    }
    return context;
}
