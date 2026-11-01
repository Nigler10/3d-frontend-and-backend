// src/context/UnreadContext.jsx
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from "react";
import { authFetch, getAccessToken } from "../utils/auth";

const UnreadContext = createContext();

export function UnreadProvider({ children }) {
    const [unreadMessages, setUnreadMessages] = useState(0);

    const fetchUnread = useCallback(async () => {
        if (!getAccessToken()) {
            setUnreadMessages(0);
            return;
        }

        try {
            const res = await authFetch(
                `${import.meta.env.VITE_DJANGO_BASE_URL}/api/chat/unread/`
            );

            if (!res.ok) {
                return;
            }

            const data = await res.json();

            setUnreadMessages(
                Number(data.total_unread) || 0
            );
        } catch (err) {
            console.error(
                "Failed to fetch unread messages:",
                err
            );
        }
    }, []);

    useEffect(() => {
        fetchUnread();

        const interval = setInterval(
            fetchUnread,
            10000
        );

        return () => {
            clearInterval(interval);
        };
    }, [fetchUnread]);

    return (
        <UnreadContext.Provider
            value={{
                unreadMessages,
                setUnreadMessages,
                fetchUnread,
            }}
        >
            {children}
        </UnreadContext.Provider>
    );
}

export function useUnread() {
    return useContext(UnreadContext);
}