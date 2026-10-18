// src/pages/ForgotPassword.jsx

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Cake, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";

function ForgotPassword() {
    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [username, setUsername] = useState("");
    const [code, setCode] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const requestCode = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);

        try {
            const response = await fetch(
                `${BASE}/api/password-reset/request/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: username.trim() }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Unable to request a recovery code.");
                return;
            }

            setMessage(
                data.message ||
                "If your account has a registered mobile number, a recovery code will be sent."
            );
            setStep(2);
        } catch {
            setError("Unable to connect to the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);

        try {
            const response = await fetch(
                `${BASE}/api/password-reset/verify/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: username.trim(),
                        code: code.trim(),
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Unable to verify the recovery code.");
                return;
            }

            setResetToken(data.reset_token);
            setStep(3);
        } catch {
            setError("Unable to connect to the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");

        if (newPassword !== confirmPassword) {
            setError("The passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(
                `${BASE}/api/password-reset/confirm/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: username.trim(),
                        reset_token: resetToken,
                        new_password: newPassword,
                        confirm_password: confirmPassword,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                const details = [
                    data.error,
                    ...(Array.isArray(data.new_password) ? data.new_password : []),
                    ...(Array.isArray(data.confirm_password) ? data.confirm_password : []),
                ].filter(Boolean);

                setError(details.join(" ") || "Unable to reset your password.");
                return;
            }

            setMessage(data.message || "Password reset successfully.");
            setStep(4);
            setCode("");
            setResetToken("");
            setNewPassword("");
            setConfirmPassword("");
        } catch {
            setError("Unable to connect to the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const goBack = () => {
        setError("");
        setMessage("");
        setStep((current) => Math.max(1, current - 1));
    };

    return (
        <div className="min-h-[calc(100vh-5rem)] bg-[#FCF8EE] flex items-start sm:items-center justify-center px-4 py-8 font-sans">
            <div className="w-full max-w-md bg-white border border-[#E6CCA2] rounded-2xl shadow-md p-6 sm:p-8 flex flex-col gap-6">
                <div className="text-center flex flex-col items-center gap-2">
                    <Cake className="w-10 h-10 text-[#C05A11]" />
                    <h1 className="text-2xl font-black text-[#6E473B]">
                        Forgot Password?
                    </h1>
                    <p className="text-sm text-[#A07060]">
                        {step === 1 && "Enter your username to start account recovery."}
                        {step === 2 && "Enter the six-digit code sent to your registered mobile number."}
                        {step === 3 && "Choose a new password for your account."}
                        {step === 4 && "Your password has been updated."}
                    </p>
                </div>

                {message && (
                    <div className="p-3 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm flex gap-2 items-start">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{message}</span>
                    </div>
                )}

                {error && (
                    <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm flex gap-2 items-start">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {step === 1 && (
                    <form onSubmit={requestCode} className="flex flex-col gap-4">
                        <label className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase">
                            Username
                            <input
                                className="mt-1 w-full px-4 py-3 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                                required
                            />
                        </label>

                        <button
                            disabled={loading}
                            className="w-full py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl disabled:opacity-50"
                        >
                            {loading ? "Requesting..." : "Continue"}
                        </button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={verifyCode} className="flex flex-col gap-4">
                        <label className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase">
                            Six-digit recovery code
                            <input
                                className="mt-1 w-full px-4 py-3 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="000000"
                                required
                            />
                        </label>

                        <button
                            disabled={loading || code.length !== 6}
                            className="w-full py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl disabled:opacity-50"
                        >
                            {loading ? "Verifying..." : "Verify Code"}
                        </button>

                        <button type="button" onClick={goBack} className="text-sm text-[#A05A2C] hover:underline">
                            Back
                        </button>
                    </form>
                )}

                {step === 3 && (
                    <form onSubmit={resetPassword} className="flex flex-col gap-4">
                        <label className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase">
                            New password
                            <input
                                type="password"
                                className="mt-1 w-full px-4 py-3 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                required
                            />
                        </label>

                        <label className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase">
                            Confirm new password
                            <input
                                type="password"
                                className="mt-1 w-full px-4 py-3 text-sm rounded-xl bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                required
                            />
                        </label>

                        <button
                            disabled={loading}
                            className="w-full py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl disabled:opacity-50"
                        >
                            {loading ? "Resetting..." : "Reset Password"}
                        </button>
                    </form>
                )}

                {step === 4 && (
                    <button
                        onClick={() => navigate("/login")}
                        className="w-full py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl"
                    >
                        Return to Login
                    </button>
                )}

                {step !== 4 && (
                    <div className="text-center text-sm border-t border-[#E6CCA2]/40 pt-4">
                        <Link to="/login" className="inline-flex items-center gap-2 text-[#C05A11] font-bold hover:underline">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Login
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ForgotPassword;
