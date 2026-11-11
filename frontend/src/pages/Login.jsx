// src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { saveTokens } from "../utils/auth";
import { useCart } from "../context/CartContext";
import { Cake, CheckCircle2, AlertTriangle } from "lucide-react";

const LOGIN_LOCK_KEY = "loginLock";

function readLoginLock() {
    try {
        const lock = JSON.parse(sessionStorage.getItem(LOGIN_LOCK_KEY));
        if (typeof lock?.username === "string" && Number.isFinite(lock.until)) return lock;
    } catch {
        // A missing or unavailable storage entry does not affect the server lock.
    }
    return null;
}

function formatCountdown(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const remainder = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
}

function Login() {
    const { fetchCart } = useCart();

    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;
    const [loginLock, setLoginLock] = useState(readLoginLock);
    const [form, setForm] = useState(() => ({ username: loginLock?.username || "", password: "" }));
    const [now, setNow] = useState(Date.now);
    const [msg, setMsg] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const nav = useNavigate();
    const username = form.username.trim();
    const secondsRemaining = loginLock?.username === username
        ? Math.max(0, Math.ceil((loginLock.until - now) / 1000))
        : 0;
    const isLocked = secondsRemaining > 0;

    useEffect(() => {
        try {
            if (loginLock) sessionStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(loginLock));
            else sessionStorage.removeItem(LOGIN_LOCK_KEY);
        } catch {
            // The countdown can still run for the current page.
        }

        if (!loginLock) return;
        const interval = setInterval(() => {
            const currentTime = Date.now();
            setNow(currentTime);
            if (currentTime >= loginLock.until) {
                setLoginLock(current => current === loginLock ? null : current);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [loginLock]);

    useEffect(() => {
        if (!username || isLoading || isSuccess) return;

        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                const response = await fetch(`${BASE}/api/token/status/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username }),
                    signal: controller.signal,
                });
                if (!response.ok) return;

                const { retry_after } = await response.json();
                if (controller.signal.aborted || !Number.isInteger(retry_after)) return;

                if (retry_after > 0) {
                    const currentTime = Date.now();
                    setNow(currentTime);
                    setLoginLock({ username, until: currentTime + retry_after * 1000 });
                    setForm(current => ({ ...current, password: "" }));
                    setMsg("");
                } else {
                    setLoginLock(current => current?.username === username ? null : current);
                }
            } catch {
                // The login endpoint still enforces the lock if the status check fails.
            }
        }, 300);

        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [BASE, username, isLoading, isSuccess]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === "username") setMsg("");
        setForm({ ...form, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isLocked || isLoading || isSuccess) return;

        setMsg("");
        setIsSuccess(false);
        setIsLoading(true);

        try {
            const response = await fetch(`${BASE}/api/token/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });
            const data = await response.json();

            if (response.ok) {
                saveTokens(data);
                await fetchCart();
                setIsSuccess(true);
                setMsg("Login Successful! Redirecting...");

                let redirectPath = "/";
                try {
                    const decoded = jwtDecode(data.access);
                    if (decoded?.is_staff) {
                        redirectPath = "/admin";
                    }
                } catch (err) {
                    console.error("Token decode error:", err);
                }

                setTimeout(() => nav(redirectPath), 1200);
            } else if (response.status === 429 && data.retry_after > 0) {
                const currentTime = Date.now();
                setNow(currentTime);
                setLoginLock({ username, until: currentTime + data.retry_after * 1000 });
                setForm(current => ({ ...current, password: "" }));
            } else {
                const detail = data.detail || "Login Failed. Invalid credentials.";
                const remaining = data.attempts_remaining;
                const warning = Number.isInteger(remaining) && remaining > 0
                    ? ` ${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`
                    : "";
                setMsg(`${detail}${warning}`);
            }
        } catch {
            setIsSuccess(false);
            setMsg("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-5rem)] w-full bg-[#FCF8EE] flex items-start sm:items-center justify-center px-4 pt-5 pb-8 antialiased font-sans">
            <div className="w-full max-w-md bg-white border border-[#E6CCA2] rounded-2xl shadow-md p-6 sm:p-8 flex flex-col gap-6">

                {/* Brand Header */}
                <div className="text-center flex flex-col items-center gap-1.5">
                    <Cake className="w-10 h-10 text-[#C05A11] mb-1" />
                    <h2 className="text-2xl font-black text-[#6E473B]">Welcome Back</h2>
                    <p className="text-sm text-[#A07060]">
                        Log in to manage your cart and design cakes in 3D.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase">
                            Username
                        </label>
                        <input
                            name="username"
                            type="text"
                            onChange={handleChange}
                            value={form.username}
                            placeholder="Type your username"
                            disabled={isLoading}
                            required
                            className="w-full px-4 py-2.5 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] placeholder-[#CBB294] focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 transition-all"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase">
                            Password
                        </label>
                        <input
                            name="password"
                            type="password"
                            onChange={handleChange}
                            value={form.password}
                            placeholder="Type your password"
                            disabled={isLocked}
                            required
                            className="w-full px-4 py-2.5 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] placeholder-[#CBB294] focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 transition-all"
                        />
                    </div>

                    <div className="flex justify-end -mt-1">
                        <Link
                            to="/forgot-password"
                            className="text-xs font-bold text-[#C05A11] hover:underline"
                        >
                            Forgot Password?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || isLocked || isSuccess}
                        className="w-full mt-2 py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-sm text-center"
                    >
                        {isLoading ? "Logging in..." : "Login to my Account"}
                    </button>
                </form>

                {/* Alert Message Popup box */}
                {(msg || isLocked) && (
                    <div className={`p-3.5 rounded-xl border text-xs font-medium text-center shadow-inner animate-fadeIn flex items-center justify-center gap-1.5 ${isSuccess
                        ? 'bg-[#2E7D32]/10 border-[#2E7D32]/20 text-[#2E7D32]'
                        : 'bg-red-50 border-red-100 text-red-600'
                        }`}>
                        {isSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                        {isLocked ? (
                            <span>Too many login attempts. Try again in <span role="timer" className="tabular-nums">{formatCountdown(secondsRemaining)}</span>.</span>
                        ) : msg}
                    </div>
                )}

                {/* 🔗 Redirect Footer link */}
                <div className="text-center text-xs font-medium text-[#A07060] pt-2 border-t border-[#E6CCA2]/40">
                    Don't have an account yet?{" "}
                    <Link to="/signup" className="text-[#C05A11] font-bold hover:underline ml-1">
                        Create Account
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default Login;