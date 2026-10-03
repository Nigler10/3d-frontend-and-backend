// src/utils/auth.js
const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

export const saveTokens = (tokens) => {
    localStorage.setItem("access_token", tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    window.dispatchEvent(new Event("auth:changed"));
};

export const clearTokens = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.dispatchEvent(new Event("auth:changed"));
};

export const getAccessToken = () => localStorage.getItem("access_token");
export const getRefreshToken = () => localStorage.getItem("refresh_token");
export const isLoggedIn = () => !!getAccessToken();

let isRefreshing = false;
let refreshQueue = []; // callbacks waiting for the new token

const notifyQueue = (newToken) => {
    refreshQueue.forEach((cb) => cb(newToken));
    refreshQueue = [];
};

export const refreshAccessToken = async () => {
    const refresh = getRefreshToken();

    if (!refresh) {
        clearTokens();
        window.dispatchEvent(new Event("auth:logout"));
        return null;
    }

    try {
        const res = await fetch(`${BASEURL}/api/token/refresh/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
        });

        if (!res.ok) {
            clearTokens();
            window.dispatchEvent(new Event("auth:logout"));
            return null;
        }

        const data = await res.json();
        localStorage.setItem("access_token", data.access);

        if (data.refresh) {
            localStorage.setItem("refresh_token", data.refresh);
        }

        window.dispatchEvent(new Event("auth:changed"));
        return data.access;
    } catch (err) {
        console.error("Token refresh error:", err);
        clearTokens();
        window.dispatchEvent(new Event("auth:logout"));
        return null;
    }
};

export const authFetch = async (url, options = {}) => {
    let token = getAccessToken();

    const buildHeaders = (tkn) => {
        const headers = { ...(options.headers || {}) };
        if (tkn) headers["Authorization"] = `Bearer ${tkn}`;
        if (!(options.body instanceof FormData)) {
            headers["Content-Type"] = "application/json";
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
                refreshQueue.push(async (newToken) => {
                    resolve(
                        await fetch(url, {
                            ...options,
                            headers: buildHeaders(newToken),
                        })
                    );
                });
            });
        }

        isRefreshing = true;
        const newToken = await refreshAccessToken();
        isRefreshing = false;

        if (newToken) {
            notifyQueue(newToken);
            
            res = await fetch(url, {
                ...options,
                headers: buildHeaders(newToken),
            });
        }
    }

    return res;
};