// src/pages/Signup.jsx
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

function Signup() {
    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;
    const [step, setStep] = useState(1);
    const [otp, setOtp] = useState("");
    const [otpTimer, setOtpTimer] = useState(300);
    const [resendTimer, setResendTimer] = useState(0);
    const [form, setForm] = useState({
        username: "",
        phone: "",
        first_name: "",
        middle_name: "",
        last_name: "",
        password: "",
        password2: ""
    });
    const [msg, setMsg] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const nav = useNavigate();
    const [showPasswordHints, setShowPasswordHints] = useState(false);
    const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

    const passwordValid = form.password.length >= 8;

    const passwordsMatch =
        form.password2.length > 0 &&
        form.password === form.password2;

    useEffect(() => {
        if (step !== 2 || (otpTimer <= 0 && resendTimer <= 0)) return;

        const interval = setInterval(() => {
            setOtpTimer(prev => Math.max(prev - 1, 0));
            setResendTimer(prev => Math.max(prev - 1, 0));
        }, 1000);

        return () => clearInterval(interval);
    }, [step, otpTimer, resendTimer]);

    const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

    const sendOtp = async () => {
        setMsg("");
        setIsLoading(true);

        try {
            const res = await fetch(`${BASE}/api/send-code/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: form.phone,
                }),
            });

            const data = await res.json();

            if (data.code === "unsupported_sms_prefix") {
                setMsg(
                    data.error ||
                    "OTP delivery is unavailable for this number."
                );
                return;
            }

            if (res.ok) {
                setMsg("✅ OTP sent to your phone");
                setOtp("");
                setOtpTimer(data.expires_in ?? 300);
                setResendTimer(data.resend_after ?? 60);
                setStep(2);
            } else {
                if (res.status === 429 && data.retry_after) {
                    setResendTimer(data.retry_after);
                }

                setMsg(
                    data.error ||
                    "Failed to send OTP"
                );
            }
        } catch (error) {
            console.error(error);
            setMsg("Unable to connect to the server.");
        } finally {
            setIsLoading(false);
        }
    };

    const verifyOtp = async () => {
        setIsLoading(true);

        try {
            const res = await fetch(`${BASE}/api/verify-code/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: form.phone,
                    code: otp
                })
            });

            const data = await res.json();

            if (res.ok) {
                setMsg("✅ Phone verified!");
                setOtp("");
                setStep(3);
            } else {
                setMsg(data.error || "Invalid OTP");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async e => {
        e.preventDefault();

        if (step !== 3) return;

        if (form.password.length < 8) {
            setMsg("Password must contain at least 8 characters.");
            return;
        }

        if (form.password !== form.password2) {
            setMsg("Passwords do not match.");
            return;
        }

        setIsLoading(true);

        try {
            const res = await fetch(`${BASE}/api/register/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            });

            const data = await res.json();

            if (res.ok) {
                setMsg("Account created! Redirecting...");
                setTimeout(() => nav("/login"), 1500);
            } else {
                setMsg(data.error || "Registration failed");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] bg-[#FCF8EE] flex items-center justify-center p-4 antialiased font-sans">
            <div className="w-full max-w-md bg-white border border-[#E6CCA2] rounded-2xl shadow-sm p-6 md:p-8 flex flex-col gap-6">

                {/* Header */}
                <div className="text-center flex flex-col items-center">
                    <span className="text-3xl mb-2">✨</span>
                    <h2 className="text-2xl font-black text-[#6E473B]">Join the Bakery</h2>
                    <p className="text-xs text-[#A07060] mt-1">Create an account to start designing your own cakes.</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Username</label>
                        <input
                            name="username"
                            onChange={handleChange}
                            value={form.username}
                            placeholder="Username"
                            disabled={isLoading}
                            required
                            className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all disabled:opacity-60"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Phone Number</label>
                        <input
                            name="phone"
                            type="tel"
                            onChange={handleChange}
                            value={form.phone}
                            placeholder="09XXXXXXXXX"
                            disabled={isLoading || step > 1}
                            required
                            className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all disabled:opacity-60"
                        />
                        <p className="text-xs text-[#A07060] leading-relaxed">
                            OTP verification currently supports Globe/TM and DITO numbers.
                            Smart/TNT numbers and legacy Sun prefixes are not supported.
                            Please use a supported number to receive your verification code.
                        </p>
                    </div>

                    {/* Name Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1 flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">First Name</label>
                            <input name="first_name" onChange={handleChange} value={form.first_name} placeholder="First" disabled={isLoading} required className="w-full px-3 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all disabled:opacity-60" />
                        </div>
                        <div className="col-span-1 flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">M.I.</label>
                            <input name="middle_name" onChange={handleChange} value={form.middle_name} placeholder="N/A" disabled={isLoading} className="w-full px-3 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all disabled:opacity-60" />
                        </div>
                        <div className="col-span-1 flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Last Name</label>
                            <input name="last_name" onChange={handleChange} value={form.last_name} placeholder="Last" disabled={isLoading} required className="w-full px-3 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all disabled:opacity-60" />
                        </div>
                    </div>


                    <div className="flex flex-col gap-1.5 relative">
                        <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">
                            Password
                        </label>

                        <input name="password" type="password" onChange={handleChange} onFocus={() => setShowPasswordHints(true)} onBlur={() => setShowPasswordHints(false)} value={form.password} placeholder="••••••••" disabled={isLoading} required minLength={8} aria-describedby="password-hints" className={`w-full px-4 py-2.5 bg-[#FCF8EE]/50 border rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:bg-white transition-all disabled:opacity-60 ${form.password.length > 0 && !passwordValid ? "border-rose-400 focus:border-rose-500" : "border-[#E6CCA2] focus:border-[#C05A11]"}`} />

                        {showPasswordHints && (
                            <div
                                id="password-hints"
                                className="mt-1 p-3 rounded-xl border border-[#E6CCA2] bg-[#FFFCF5] shadow-sm"
                            >
                                <p className="text-xs font-bold text-[#6E473B] mb-2">
                                    Password requirements
                                </p>

                                <div className="flex items-center gap-2 text-xs">
                                    <span className={passwordValid ? "text-emerald-600" : "text-[#A07060]"}>
                                        {passwordValid ? "✓" : "○"}
                                    </span>

                                    <span className={passwordValid ? "text-emerald-700" : "text-[#A07060]"}>
                                        At least 8 characters
                                    </span>
                                </div>
                            </div>
                        )}

                        {form.password.length > 0 && !passwordValid && (
                            <p className="text-xs text-rose-600">
                                Password must contain at least 8 characters.
                            </p>
                        )}
                    </div>



                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">
                            Confirm Password
                        </label>

                        <input
                            name="password2"
                            type="password"
                            onChange={(e) => {
                                handleChange(e);
                                setConfirmPasswordTouched(true);
                            }}
                            onBlur={() => setConfirmPasswordTouched(true)}
                            value={form.password2}
                            placeholder="••••••••"
                            disabled={isLoading}
                            required
                            minLength={8}
                            aria-describedby="confirm-password-message"
                            className={`w-full px-4 py-2.5 bg-[#FCF8EE]/50 border rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:bg-white transition-all disabled:opacity-60 ${confirmPasswordTouched && form.password2.length > 0
                                ? passwordsMatch
                                    ? "border-emerald-400 focus:border-emerald-500"
                                    : "border-rose-400 focus:border-rose-500"
                                : "border-[#E6CCA2] focus:border-[#C05A11]"
                                }`}
                        />

                        <div id="confirm-password-message" aria-live="polite">
                            {confirmPasswordTouched && form.password2.length > 0 && (
                                passwordsMatch ? (
                                    <p className="text-xs text-emerald-600">
                                        ✓ Passwords match.
                                    </p>
                                ) : (
                                    <p className="text-xs text-rose-600">
                                        ✕ Passwords do not match.
                                    </p>
                                )
                            )}
                        </div>
                    </div>

                    {step === 1 && (
                        <button
                            type="button"
                            onClick={sendOtp}
                            disabled={isLoading}
                            className="w-full mt-2 py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white text-sm font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
                        >
                            {isLoading ? "Sending..." : "Send OTP"}
                        </button>
                    )}

                    {step === 2 && (
                        <div className="flex flex-col gap-4 border-t border-[#E6CCA2]/40 pt-4 mt-2">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">OTP Code</label>
                                <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit OTP" inputMode="numeric" maxLength={6} disabled={isLoading || otpTimer === 0} className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all disabled:opacity-60" />
                                <p className={`text-xs font-medium mt-1 ${otpTimer === 0 ? "text-rose-600" : "text-[#A05A2C]"}`}>
                                    {otpTimer > 0 ? (
                                        <>
                                            OTP expires in:{" "}
                                            <span className="font-bold font-mono">
                                                {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, "0")}
                                            </span>
                                        </>
                                    ) : (
                                        "OTP expired. Please request a new code."
                                    )}
                                </p>
                            </div>

                            <button type="button" onClick={verifyOtp} disabled={isLoading || otp.length !== 6 || otpTimer === 0} className="w-full py-3 bg-[#A05A2C] hover:bg-[#864A22] text-white text-sm font-bold rounded-xl shadow-md transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                {isLoading ? "Verifying..." : "Verify OTP"}
                            </button>

                            <button type="button" onClick={sendOtp} disabled={isLoading || resendTimer > 0} className="w-full py-2.5 bg-white hover:bg-[#FCF8EE] text-[#A05A2C] border border-[#E6CCA2] text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : "Resend OTP"}
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full mt-2 py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white text-sm font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.99] cursor-pointer disabled:opacity-50"
                        >
                            {isLoading ? "Creating..." : "Create Account"}
                        </button>
                    )}
                </form>

                {/* Status Messages */}
                {msg && (
                    <div className={`w-full p-3 text-xs font-semibold rounded-xl border ${msg.includes('✅')
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                        {msg}
                    </div>
                )}

                {/* Footer */}
                <div className="text-center text-xs text-[#A07060] border-t border-[#E6CCA2]/30 pt-4">
                    Already have an account?{" "}
                    <Link to="/login" className="font-bold text-[#C05A11] hover:text-[#A84E0E] hover:underline transition-all">
                        Log in
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default Signup;