// src/pages/customer/CustomerProfile.jsx
import { getMediaUrl } from "../../utils/media";
import { useEffect, useState } from "react";
import { authFetch } from "../../utils/auth";
import { Link } from "react-router-dom";

function CustomerProfile() {
    const [profile, setProfile] = useState(null);
    const [msg, setMsg] = useState("");
    const BASE = import.meta.env.VITE_DJANGO_BASE_URL;

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await authFetch(`${BASE}/api/profile/`, { method: "GET" });
                if (res.ok) {
                    const data = await res.json();
                    setProfile(data);
                } else {
                    setMsg("Failed to load profile");
                }
            } catch (err) {
                console.error(err);
                setMsg("Error fetching profile");
            }
        };
        fetchProfile();
    }, [BASE]);

    if (!profile) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-[#C05A11]">
                <div className="w-8 h-8 border-4 border-[#E6CCA2] border-t-[#C05A11] rounded-full animate-spin"></div>
                <p className="font-bold text-sm tracking-wide">Opening your profile...</p>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-64px)] bg-[#FCF8EE] py-10 px-4 antialiased font-sans flex justify-center">
            <div className="max-w-xl w-full bg-white border border-[#E6CCA2] rounded-2xl shadow-sm p-6 md:p-10 flex flex-col gap-8">

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-[#FCF8EE] border-4 border-[#E6CCA2] flex items-center justify-center shrink-0 shadow-inner">
                        {profile.profile_picture ? (
                            <img
                                src={getMediaUrl(profile.profile_picture, BASE)}
                                alt="Profile"
                                className="w-full h-full object-cover"
                                decoding="async"
                                width="96"
                                height="96"
                            />
                        ) : (
                            <span className="text-4xl font-black text-[#E6CCA2]">
                                {profile.user.username[0].toUpperCase()}
                            </span>
                        )}
                    </div>

                    <div className="text-center sm:text-left flex flex-col gap-1">
                        <h2 className="text-2xl font-black text-[#6E473B]">
                            {profile.user.first_name} {profile.middle_name ? `${profile.middle_name} ` : ""}{profile.user.last_name}
                        </h2>
                        <p className="text-sm font-medium text-[#A07060]">{profile.user.email}</p>
                        <span className="inline-block mt-2 px-3 py-1 bg-[#FCF8EE] border border-[#E6CCA2] text-[#A05A2C] text-[10px] font-black uppercase tracking-widest rounded-full">
                            Loyal Customer
                        </span>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-[#FCF8EE]/30 border border-[#E6CCA2]/40 rounded-2xl">
                        <h3 className="text-xs font-black text-[#A05A2C] uppercase tracking-wider mb-2 flex items-center gap-2">
                            📞 Contact Details
                        </h3>
                        <p className="text-sm text-[#6E473B] font-medium">{profile.phone || "No phone number added"}</p>
                    </div>

                    <div className="p-5 bg-[#FCF8EE]/30 border border-[#E6CCA2]/40 rounded-2xl">
                        <h3 className="text-xs font-black text-[#A05A2C] uppercase tracking-wider mb-2 flex items-center gap-2">
                            🏠 Default Delivery Address
                        </h3>
                        <p className="text-sm text-[#6E473B] leading-relaxed">
                            {profile.street ? (
                                <>
                                    {profile.street}<br />

                                    {profile.barangay && (
                                        <>
                                            {profile.barangay}<br />
                                        </>
                                    )}

                                    {profile.city}
                                    {profile.province ? `, ${profile.province}` : ""}
                                    {profile.postal_code ? ` ${profile.postal_code}` : ""}

                                    {profile.region && (
                                        <>
                                            <br />
                                            {profile.region}
                                        </>
                                    )}
                                </>
                            ) : (
                                "No address set"
                            )}
                        </p>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="flex flex-col gap-4 border-t border-[#E6CCA2]/30 pt-6">
                    <Link
                        to="/profile/edit"
                        className="w-full py-3 bg-[#C05A11] hover:bg-[#A84E0E] text-white text-center text-sm font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.99]"
                    >
                        Edit Profile Settings
                    </Link>
                    {msg && (
                        <p className="text-center text-xs font-bold text-rose-600 bg-rose-50 p-2 rounded-lg">
                            {msg}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CustomerProfile;