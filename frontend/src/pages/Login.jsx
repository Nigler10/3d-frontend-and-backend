import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { saveTokens } from "../utils/auth";
import { useCart } from "../context/CartContext";
import { Cake, CheckCircle2, AlertTriangle } from "lucide-react";

function Login() {
    const { fetchCart } = useCart();

    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;
    const [form, setForm] = useState({ username: "", password: "" });
    const [msg, setMsg] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const nav = useNavigate();

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
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
            } else {
                setIsSuccess(false);
                setMsg(data.detail || "Login Failed. Invalid credentials.");
            }
        } catch (error) {
            console.error(error);
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
                            required
                            className="w-full px-4 py-2.5 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] placeholder-[#CBB294] focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full mt-2 py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-sm text-center"
                    >
                        {isLoading ? "Logging in..." : "Login to my Account"}
                    </button>
                </form>

                {/* Alert Message Popup box */}
                {msg && (
                    <div className={`p-3.5 rounded-xl border text-xs font-medium text-center shadow-inner animate-fadeIn flex items-center justify-center gap-1.5 ${isSuccess
                            ? 'bg-[#2E7D32]/10 border-[#2E7D32]/20 text-[#2E7D32]'
                            : 'bg-red-50 border-red-100 text-red-600'
                        }`}>
                        {isSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                        {msg}
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