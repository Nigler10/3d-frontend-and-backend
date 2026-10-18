// src/components/customer/ChangePasswordModal.jsx

import { useState } from "react";
import { authFetch } from "../../utils/auth";

function ChangePasswordModal({ onClose }) {
    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;

    const [form, setForm] = useState({
        current_password: "",
        new_password: "",
        confirm_password: "",
    });

    const [showPasswords, setShowPasswords] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const passwordValid = form.new_password.length >= 8;

    const passwordsMatch =
        form.confirm_password.length > 0 &&
        form.new_password === form.confirm_password;

    const handleChange = (e) => {
        const { name, value } = e.target;

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }));

        setError("");
        setSuccess("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError("");
        setSuccess("");

        if (!form.current_password) {
            setError("Please enter your current password.");
            return;
        }

        if (form.new_password.length < 8) {
            setError("Your new password must contain at least 8 characters.");
            return;
        }

        if (form.new_password !== form.confirm_password) {
            setError("Your new passwords do not match.");
            return;
        }

        if (form.current_password === form.new_password) {
            setError(
                "Your new password must be different from your current password."
            );
            return;
        }

        setIsLoading(true);

        try {
            const res = await authFetch(`${BASE}/api/change-password/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(form),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const details = [
                    data.detail,
                    ...(Array.isArray(data.current_password)
                        ? data.current_password
                        : []),
                    ...(Array.isArray(data.new_password)
                        ? data.new_password
                        : []),
                    ...(Array.isArray(data.confirm_password)
                        ? data.confirm_password
                        : []),
                ].filter(Boolean);

                setError(
                    details.join(" ") ||
                    "Unable to change your password. Please try again."
                );
                return;
            }

            setForm({
                current_password: "",
                new_password: "",
                confirm_password: "",
            });

            setSuccess("Your password has been changed successfully.");
        } catch (err) {
            console.error("Change password error:", err);
            setError(
                "Unable to connect to the server. Please try again."
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !isLoading) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="change-password-title"
                className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#E6CCA2] bg-white p-6 shadow-2xl sm:p-8"
            >
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h2
                            id="change-password-title"
                            className="text-xl font-black text-[#6E473B]"
                        >
                            Change Password
                        </h2>

                        <p className="mt-1 text-sm text-[#A07060]">
                            Update your account password securely.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        aria-label="Close change password dialog"
                        className="rounded-lg px-2 py-1 text-xl text-[#A07060] transition hover:bg-[#FCF8EE] hover:text-[#6E473B] disabled:opacity-50"
                    >
                        ×
                    </button>
                </div>

                {success ? (
                    <div className="flex flex-col gap-5">
                        <div
                            role="status"
                            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700"
                        >
                            ✓ {success}
                        </div>

                        <p className="text-xs leading-relaxed text-[#A07060]">
                            If you did not make this change, contact the
                            store administrator and secure your account.
                        </p>

                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full rounded-xl bg-[#C05A11] py-3 text-sm font-bold text-white transition hover:bg-[#A84E0E]"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="current_password"
                                className="text-xs font-bold uppercase tracking-wide text-[#6E473B]"
                            >
                                Current Password
                            </label>

                            <input
                                id="current_password"
                                name="current_password"
                                type={showPasswords ? "text" : "password"}
                                autoComplete="current-password"
                                value={form.current_password}
                                onChange={handleChange}
                                placeholder="Enter current password"
                                disabled={isLoading}
                                required
                                className="w-full rounded-xl border border-[#E6CCA2] bg-[#FCF8EE]/50 px-4 py-3 text-sm text-[#6E473B] outline-none transition focus:border-[#C05A11] focus:bg-white disabled:opacity-60"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="new_password"
                                className="text-xs font-bold uppercase tracking-wide text-[#6E473B]"
                            >
                                New Password
                            </label>

                            <input
                                id="new_password"
                                name="new_password"
                                type={showPasswords ? "text" : "password"}
                                autoComplete="new-password"
                                value={form.new_password}
                                onChange={handleChange}
                                placeholder="Enter new password"
                                disabled={isLoading}
                                required
                                minLength={8}
                                className={`w-full rounded-xl border bg-[#FCF8EE]/50 px-4 py-3 text-sm text-[#6E473B] outline-none transition focus:bg-white disabled:opacity-60 ${form.new_password.length > 0 && !passwordValid
                                        ? "border-rose-400 focus:border-rose-500"
                                        : "border-[#E6CCA2] focus:border-[#C05A11]"
                                    }`}
                            />

                            <p
                                className={`text-xs ${passwordValid
                                        ? "text-emerald-600"
                                        : "text-[#A07060]"
                                    }`}
                            >
                                {passwordValid ? "✓" : "○"} At least 8 characters
                            </p>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="confirm_password"
                                className="text-xs font-bold uppercase tracking-wide text-[#6E473B]"
                            >
                                Confirm New Password
                            </label>

                            <input
                                id="confirm_password"
                                name="confirm_password"
                                type={showPasswords ? "text" : "password"}
                                autoComplete="new-password"
                                value={form.confirm_password}
                                onChange={handleChange}
                                placeholder="Re-enter new password"
                                disabled={isLoading}
                                required
                                minLength={8}
                                className={`w-full rounded-xl border bg-[#FCF8EE]/50 px-4 py-3 text-sm text-[#6E473B] outline-none transition focus:bg-white disabled:opacity-60 ${form.confirm_password.length > 0
                                        ? passwordsMatch
                                            ? "border-emerald-400 focus:border-emerald-500"
                                            : "border-rose-400 focus:border-rose-500"
                                        : "border-[#E6CCA2] focus:border-[#C05A11]"
                                    }`}
                            />

                            {form.confirm_password.length > 0 && (
                                <p
                                    className={`text-xs ${passwordsMatch
                                            ? "text-emerald-600"
                                            : "text-rose-600"
                                        }`}
                                >
                                    {passwordsMatch
                                        ? "✓ Passwords match."
                                        : "✕ Passwords do not match."}
                                </p>
                            )}
                        </div>

                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#6E473B]">
                            <input
                                type="checkbox"
                                checked={showPasswords}
                                onChange={(e) =>
                                    setShowPasswords(e.target.checked)
                                }
                                disabled={isLoading}
                                className="accent-[#C05A11]"
                            />
                            Show passwords
                        </label>

                        <div className="rounded-xl border border-[#E6CCA2]/60 bg-[#FCF8EE]/60 p-3">
                            <p className="text-xs leading-relaxed text-[#8B6555]">
                                For your security, we will verify your current
                                password before saving the new one. No SMS OTP
                                is required.
                            </p>
                        </div>

                        {error && (
                            <p
                                role="alert"
                                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-600"
                            >
                                {error}
                            </p>
                        )}

                        <div className="mt-2 flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="flex-1 rounded-xl border border-[#E6CCA2] py-3 text-sm font-bold text-[#6E473B] transition hover:bg-[#FCF8EE] disabled:opacity-50"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="flex-1 rounded-xl bg-[#C05A11] py-3 text-sm font-bold text-white shadow-md shadow-[#C05A11]/20 transition hover:bg-[#A84E0E] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isLoading ? "Updating..." : "Update Password"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default ChangePasswordModal;
