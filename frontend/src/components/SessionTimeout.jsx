// src/components/SessionTimeout.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clearTokens, hasSessionTimedOut, updateLastActivity } from "../utils/auth";

const CHECK_INTERVAL_MS = 15000;
const ACTIVITY_WRITE_INTERVAL_MS = 5000;

export default function SessionTimeout() {
    const navigate = useNavigate();

    useEffect(() => {
        let lastActivityWrite = 0;

        const logoutIfExpired = () => {
            const hasToken =
                !!localStorage.getItem(
                    "access_token"
                );

            if (!hasToken) {
                return false;
            }

            if (!hasSessionTimedOut()) {
                return false;
            }

            clearTokens();

            navigate("/login", {
                replace: true,
            });

            return true;
        };

        const recordActivity = () => {
            const hasToken =
                !!localStorage.getItem(
                    "access_token"
                );

            if (!hasToken) {
                return;
            }

            // Very important:
            // check expiration BEFORE recording activity.
            //
            // Otherwise reopening the browser after
            // several hours could accidentally revive
            // the old session.
            if (logoutIfExpired()) {
                return;
            }

            const now = Date.now();

            if (
                now - lastActivityWrite <
                ACTIVITY_WRITE_INTERVAL_MS
            ) {
                return;
            }

            lastActivityWrite = now;
            updateLastActivity();
        };

        const handleVisibilityChange = () => {
            if (
                document.visibilityState ===
                "visible"
            ) {
                if (!logoutIfExpired()) {
                    recordActivity();
                }
            }
        };

        const handleWindowFocus = () => {
            if (!logoutIfExpired()) {
                recordActivity();
            }
        };

        // Check immediately when the app loads.
        logoutIfExpired();

        const interval = window.setInterval(
            logoutIfExpired,
            CHECK_INTERVAL_MS
        );

        const activityEvents = [
            "mousedown",
            "mousemove",
            "keydown",
            "scroll",
            "touchstart",
            "pointerdown",
        ];

        activityEvents.forEach((eventName) => {
            window.addEventListener(
                eventName,
                recordActivity,
                {
                    passive: true,
                }
            );
        });

        window.addEventListener(
            "focus",
            handleWindowFocus
        );

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );

        return () => {
            window.clearInterval(interval);

            activityEvents.forEach(
                (eventName) => {
                    window.removeEventListener(
                        eventName,
                        recordActivity
                    );
                }
            );

            window.removeEventListener(
                "focus",
                handleWindowFocus
            );

            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
        };
    }, [navigate]);

    return null;
}