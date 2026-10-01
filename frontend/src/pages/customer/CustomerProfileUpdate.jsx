// src/pages/customer/CustomerProfileUpdate.jsx
import { getMediaUrl } from "../../utils/media";
import { useState, useEffect } from "react";
import { authFetch } from "../../utils/auth";
import { useNavigate } from "react-router-dom";
import AddressSelector from "../../components/address/AddressSelector";

function CustomerProfileUpdate() {
    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();

    const [form, setForm] = useState({
        first_name: "",
        middle_name: "",
        last_name: "",
        email: "",
        phone: "",

        street: "",
        region: "",
        region_code: "",
        province: "",
        province_code: "",
        city: "",
        city_code: "",
        barangay: "",
        barangay_code: "",
        postal_code: "",

        profile_picture: null
    });

    const [preview, setPreview] = useState(null);
    const [msg, setMsg] = useState("");

    useEffect(() => {
        const fetchProfile = async () => {
            const res = await authFetch(`${BASE}/api/profile/`);
            const data = await res.json();

            setForm({
                first_name: data.user.first_name || "",
                middle_name: data.middle_name || "",
                last_name: data.user.last_name || "",
                email: data.user.email || "",
                phone: data.phone || "",

                street: data.street || "",
                region: data.region || "",
                region_code: data.region_code || "",
                province: data.province || "",
                province_code: data.province_code || "",
                city: data.city || "",
                city_code: data.city_code || "",
                barangay: data.barangay || "",
                barangay_code: data.barangay_code || "",
                postal_code: data.postal_code || "",

                profile_picture: null
            });

            if (data.profile_picture) {
                setPreview(getMediaUrl(data.profile_picture, BASE));
            }
        };
        fetchProfile();
    }, [BASE]);

    const handleChange = (e) => {
        const { name, value, files } = e.target;
        if (files) {
            setForm({ ...form, [name]: files[0] });
            setPreview(URL.createObjectURL(files[0]));
        } else {
            setForm({ ...form, [name]: value });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMsg("");
        const hasAddress =
            form.street ||
            form.region_code ||
            form.city_code ||
            form.barangay_code ||
            form.postal_code;

        if (hasAddress) {
            if (!form.street) {
                setMsg("Please enter your house, unit, street, or subdivision.");
                return;
            }

            if (!form.region_code) {
                setMsg("Please select a valid region from the suggestions.");
                return;
            }

            if (!form.city_code) {
                setMsg("Please select a valid city or municipality from the suggestions.");
                return;
            }

            if (!form.barangay_code) {
                setMsg("Please select a valid barangay from the suggestions.");
                return;
            }

            if (!/^\d{4}$/.test(form.postal_code)) {
                setMsg("Postal code must contain exactly 4 digits.");
                return;
            }
        }
        const formData = new FormData();
        for (const key in form) {
            if (form[key] !== null) {
                formData.append(key, form[key]);
            }
        }

        const res = await authFetch(`${BASE}/api/profile/`, {
            method: "PUT",
            body: formData
        });

        if (res.ok) {
            navigate("/profile");
        } else {
            const data = await res.json();
            setMsg(data.detail || "Update failed. Please check your info.");
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] bg-[#FCF8EE] py-10 px-4 antialiased font-sans flex items-center justify-center">
            <div className="max-w-2xl w-full bg-white border border-[#E6CCA2] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 md:p-8 flex flex-col gap-6">
                    <h2 className="text-2xl font-black text-[#6E473B]">Edit Your Profile</h2>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

                        {/* Profile Photo Section */}
                        <div className="flex flex-col sm:flex-row items-center gap-5 bg-[#FCF8EE]/40 border border-[#E6CCA2]/40 rounded-xl p-4">
                            <div className="w-20 h-20 rounded-full overflow-hidden bg-[#FCF8EE] border border-[#E6CCA2] shrink-0 flex items-center justify-center">
                                {preview ? (
                                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-3xl text-[#CBB294]">👤</span>
                                )}
                            </div>
                            <div className="flex flex-col items-center sm:items-start gap-2">
                                <label
                                    htmlFor="profile_picture"
                                    className="px-4 py-2 bg-white hover:bg-[#FCF8EE] text-[#A05A2C] text-xs font-bold rounded-xl border border-[#E6CCA2] transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                                >
                                    Change Photo
                                </label>
                                <input
                                    id="profile_picture"
                                    type="file"
                                    name="profile_picture"
                                    onChange={handleChange}
                                    className="hidden"
                                    accept="image/*"
                                />
                                <p className="text-[11px] font-medium text-[#A07060]">JPG or PNG, max 2MB</p>
                            </div>
                        </div>

                        {/* Personal Info Section */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-xs font-black tracking-wider text-[#A05A2C] uppercase border-b border-[#E6CCA2]/30 pb-1">
                                Personal Information
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">First Name</label>
                                    <input
                                        name="first_name"
                                        value={form.first_name}
                                        onChange={handleChange}
                                        placeholder="First Name"
                                        required
                                        className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Middle Name</label>
                                    <input
                                        name="middle_name"
                                        value={form.middle_name}
                                        onChange={handleChange}
                                        placeholder="Optional"
                                        className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Last Name</label>
                                    <input
                                        name="last_name"
                                        value={form.last_name}
                                        onChange={handleChange}
                                        placeholder="Last Name"
                                        required
                                        className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Email Address</label>
                                    <input
                                        name="email"
                                        type="email"
                                        value={form.email}
                                        onChange={handleChange}
                                        placeholder="Email"
                                        required
                                        className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">Phone Number</label>
                                    <input
                                        name="phone"
                                        value={form.phone}
                                        onChange={handleChange}
                                        placeholder="09XX XXX XXXX"
                                        required
                                        className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Address Section */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-xs font-black tracking-wider text-[#A05A2C] uppercase border-b border-[#E6CCA2]/30 pb-1">
                                Default Delivery Address
                            </h3>

                            <AddressSelector
                                value={form}
                                onChange={(address) => setForm((prev) => ({
                                    ...prev,
                                    street: address.street,
                                    region: address.region,
                                    region_code: address.region_code,
                                    province: address.province,
                                    province_code: address.province_code,
                                    city: address.city,
                                    city_code: address.city_code,
                                    barangay: address.barangay,
                                    barangay_code: address.barangay_code,
                                    postal_code: address.postal_code
                                }))}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-3 border-t border-[#E6CCA2]/30 pt-4 mt-2">
                            <button
                                type="button"
                                onClick={() => navigate("/profile")}
                                className="px-5 py-2.5 text-sm font-bold text-[#A07060] hover:text-[#6E473B] transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2.5 bg-[#C05A11] hover:bg-[#A84E0E] text-white text-sm font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.99] cursor-pointer"
                            >
                                Save Changes
                            </button>
                        </div>

                        {msg && (
                            <p className="w-full p-3 text-xs font-semibold rounded-xl bg-rose-50 text-rose-800 border border-rose-200">
                                {msg}
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}

export default CustomerProfileUpdate;