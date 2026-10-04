// src/utils/auth.js
const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = "last_activity";

export const saveTokens = (tokens) => {
    localStorage.setItem("access_token", tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    window.dispatchEvent(new Event("auth:changed"));
};

export const clearTokens = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem(LAST_ACTIVITY_KEY);

    window.dispatchEvent(new Event("auth:changed"));
    window.dispatchEvent(new Event("auth:logout"));
};

export const getLastActivity = () => {
    const value = localStorage.getItem(LAST_ACTIVITY_KEY);
    return value ? Number(value) : 0;
};

export const hasSessionTimedOut = () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
        return false;
    }

    const lastActivity = getLastActivity();

    // Old session created before inactivity tracking existed.
    if (!lastActivity) {
        return true;
    }

    return Date.now() - lastActivity >= SESSION_TIMEOUT_MS;
};

export const updateLastActivity = () => {
    if (!localStorage.getItem("access_token")) {
        return;
    }

    localStorage.setItem(
        LAST_ACTIVITY_KEY,
        String(Date.now())
    );
};

export const getAccessToken = () => {
    const token = localStorage.getItem("access_token");

    if (!token) {
        return null;
    }

    if (hasSessionTimedOut()) {
        return null;
    }

    return token;
};

export const getRefreshToken = () =>
    localStorage.getItem("refresh_token");

export const isLoggedIn = () =>
    !!getAccessToken();

let isRefreshing = false;
let refreshQueue = [];

const notifyQueue = (newToken) => {
    refreshQueue.forEach((cb) => cb(newToken));
    refreshQueue = [];
};

export const refreshAccessToken = async () => {
    // Do not revive an account that already exceeded
    // the inactivity timeout.
    if (hasSessionTimedOut()) {
        clearTokens();
        return null;
    }

    const refresh = getRefreshToken();

    if (!refresh) {
        clearTokens();
        return null;
    }

    try {
        const res = await fetch(
            `${BASEURL}/api/token/refresh/`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ refresh }),
            }
        );

        if (!res.ok) {
            clearTokens();
            return null;
        }

        const data = await res.json();

        localStorage.setItem(
            "access_token",
            data.access
        );

        if (data.refresh) {
            localStorage.setItem(
                "refresh_token",
                data.refresh
            );
        }

        window.dispatchEvent(
            new Event("auth:changed")
        );

        return data.access;
    } catch (err) {
        console.error(
            "Token refresh error:",
            err
        );

        clearTokens();
        return null;
    }
};

export const authFetch = async (
    url,
    options = {}
) => {
    // Prevent API calls from refreshing a session
    // that already expired due to inactivity.
    if (hasSessionTimedOut()) {
        clearTokens();

        return new Response(
            JSON.stringify({
                detail: "Session expired due to inactivity.",
            }),
            {
                status: 401,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }

    let token = getAccessToken();

    const buildHeaders = (tkn) => {
        const headers = {
            ...(options.headers || {}),
        };

        if (tkn) {
            headers["Authorization"] =
                `Bearer ${tkn}`;
        }

        if (!(options.body instanceof FormData)) {
            headers["Content-Type"] =
                "application/json";
        }

        return headers;
    };

    let res = await fetch(url, {
        ...options,
        headers: buildHeaders(token),
    });

    if (res.status === 401) {
        if (isRefreshing) {
            return new Promise((resolve) => {
                refreshQueue.push(
                    async (newToken) => {
                        resolve(
                            await fetch(url, {
                                ...options,
                                headers:
                                    buildHeaders(
                                        newToken
                                    ),
                            })
                        );
                    }
                );
            });
        }

        isRefreshing = true;

        const newToken =
            await refreshAccessToken();

        isRefreshing = false;

        if (newToken) {
            notifyQueue(newToken);

            res = await fetch(url, {
                ...options,
                headers:
                    buildHeaders(newToken),
            });
        }
    }

    return res;
};