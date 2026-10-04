// src/pages/CheckoutPage.jsx
import { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import { authFetch } from "../utils/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import AddressSelector from "../components/address/AddressSelector";

function CheckoutPage() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const uploadOrderId = searchParams.get("upload_order_id");
    const isUploadedCake = !!uploadOrderId;
    const { clearCart } = useCart();
    const [useProfileAddress, setUseProfileAddress] = useState(true);
    const [profileAddress, setProfileAddress] = useState({
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
        full_name: "",
        phone: "",
    });

    const [customAddress, setCustomAddress] = useState({
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
    });

    const [deliveryDate, setDeliveryDate] = useState("");
    const [deliveryTime, setDeliveryTime] = useState("");
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        async function fetchProfile() {
            const res = await authFetch(`${BASEURL}/api/profile/`);
            const data = await res.json();
            setProfileAddress({
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
                full_name: `${data.user.first_name} ${data.user.last_name}`.trim(),
                phone: data.phone || "",
            });
        }
        fetchProfile();
    }, [BASEURL]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage("");

        const selectedAddress = useProfileAddress
            ? profileAddress
            : customAddress;

        if (!selectedAddress.street) {
            setMessage("Please enter your house, unit, street, or subdivision.");
            return;
        }

        if (!selectedAddress.region_code) {
            setMessage("Please select a valid region.");
            return;
        }

        if (!selectedAddress.city_code) {
            setMessage("Please select a valid city or municipality.");
            return;
        }

        if (!selectedAddress.barangay_code) {
            setMessage("Please select a valid barangay.");
            return;
        }

        if (!/^\d{4}$/.test(selectedAddress.postal_code)) {
            setMessage("Postal code must contain exactly 4 digits.");
            return;
        }

        setLoading(true);

        const payload = {
            ...(useProfileAddress ? profileAddress : customAddress),
            delivery_date: deliveryDate,
            delivery_time: deliveryTime,
            notes,
        };

        if (uploadOrderId) {

            try {

                const res = await authFetch(
                    `${BASEURL}/api/orders/${uploadOrderId}/update-upload-order/`,
                    {
                        method: "POST",
                        body: JSON.stringify(payload),
                    }
                );

                const data = await res.json();

                if (res.ok) {

                    setMessage("Sweet! Order submitted for review! 🎂");

                    setTimeout(() => {
                        navigate(`/orders/${uploadOrderId}`);
                    }, 1500);

                } else {

                    setMessage(data.error || "Unable to continue.");

                }

            } catch {

                setMessage("Server error. Please try again.");

            } finally {

                setLoading(false);

            }

            return;
        }

        try {
            const res = await authFetch(`${BASEURL}/api/orders/create/`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage("Sweet! Order submitted for review! 🎂");
                clearCart();
                const orderId = data.order_id;
                setTimeout(() => {
                    navigate(`/orders/${orderId}`);
                }, 2000);
            } else {
                setMessage(data.error || "Failed to place order.");
            }
        } catch (err) {
            setMessage("Server error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#fffdf9] text-stone-800 antialiased py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-center">
            <div className="max-w-3xl w-full mx-auto">
                <form onSubmit={handleSubmit} className="bg-white border border-[#f3e1c6] rounded-3xl p-6 sm:p-10 shadow-sm space-y-8">

                    <header className="text-center pb-4 border-b border-stone-100">
                        <h1 className="text-3xl font-black text-[#844414] tracking-tight">Finalize Your Order</h1>
                        <div className="w-12 h-1 bg-[#d67b27] mx-auto rounded-full mt-3" />
                    </header>

                    {/* Delivery Address Section */}
                    <section className="space-y-4">
                        <h2 className="text-xl font-bold text-[#844414] flex items-center gap-2">
                            <span>📍</span> Delivery Address
                        </h2>

                        <div className="space-y-3">
                            {/* Saved Address Selection */}
                            <label className={`flex items-start gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${useProfileAddress
                                ? "border-[#d67b27] bg-[#fdf2e2]/40"
                                : "border-stone-200 hover:border-stone-300"
                                }`}>
                                <input
                                    type="radio"
                                    checked={useProfileAddress}
                                    onChange={() => setUseProfileAddress(true)}
                                    className="mt-1 accent-[#d67b27]"
                                />
                                <div className="flex-1 text-sm">
                                    <span className="font-bold text-stone-800 block mb-2">Use Saved Profile Address</span>

                                    {useProfileAddress && (
                                        <div className="bg-white border border-[#fdf2e2] rounded-xl p-3 mt-1 space-y-1 shadow-inner text-stone-600">
                                            <strong className="text-[#844414]">
                                                {profileAddress.full_name}
                                            </strong>

                                            <p>
                                                {profileAddress.street || "No street address"}
                                            </p>

                                            {profileAddress.barangay && (
                                                <p>{profileAddress.barangay}</p>
                                            )}

                                            <p>
                                                {profileAddress.city}
                                                {profileAddress.province ? `, ${profileAddress.province}` : ""}
                                                {profileAddress.postal_code ? ` ${profileAddress.postal_code}` : ""}
                                            </p>

                                            {profileAddress.region && (
                                                <p className="text-xs">{profileAddress.region}</p>
                                            )}

                                            <p className="text-xs font-bold text-[#d67b27] mt-1">
                                                📞 {profileAddress.phone}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </label>

                            {/* Custom Address Selection */}
                            <label className={`flex items-center gap-3 p-4 border rounded-2xl cursor-pointer transition-all ${!useProfileAddress
                                ? "border-[#d67b27] bg-[#fdf2e2]/40"
                                : "border-stone-200 hover:border-stone-300"
                                }`}>
                                <input
                                    type="radio"
                                    checked={!useProfileAddress}
                                    onChange={() => setUseProfileAddress(false)}
                                    className="accent-[#d67b27]"
                                />
                                <span className="text-sm font-bold text-stone-800">Deliver to a New Address</span>
                            </label>
                        </div>

                        {/* Custom Address */}
                        {!useProfileAddress && (
                            <div className="p-5 bg-[#fffdf9] border border-[#f3e1c6] rounded-2xl animate-fadeIn">
                                <AddressSelector
                                    value={customAddress}
                                    onChange={setCustomAddress}
                                />
                            </div>
                        )}
                    </section>

                    {/* Schedule Section */}
                    <section className="space-y-4">
                        <h2 className="text-xl font-bold text-[#844414] flex items-center gap-2">
                            <span>⏰</span> Schedule Delivery
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col">
                                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Date *</label>
                                <input
                                    type="date"
                                    value={deliveryDate}
                                    onChange={(e) => setDeliveryDate(e.target.value)}
                                    required
                                    className="w-full bg-white border border-stone-200 focus:border-[#d67b27] focus:ring-1 focus:ring-[#d67b27] rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                                />
                            </div>
                            <div className="flex flex-col">
                                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Preferred Time *</label>
                                <input
                                    type="time"
                                    value={deliveryTime}
                                    onChange={(e) => setDeliveryTime(e.target.value)}
                                    required
                                    className="w-full bg-white border border-stone-200 focus:border-[#d67b27] focus:ring-1 focus:ring-[#d67b27] rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Notes Section */}
                    <section className="space-y-4">
                        <h2 className="text-xl font-bold text-[#844414] flex items-center gap-2">
                            <span>📝</span> Special Instructions
                        </h2>
                        <textarea
                            placeholder="Add a message for the baker or delivery rider..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-white border border-stone-200 focus:border-[#d67b27] focus:ring-1 focus:ring-[#d67b27] rounded-xl px-4 py-2.5 text-sm outline-none transition-all resize-none"
                        />
                    </section>

                    {/* Form Submit Button */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#d67b27] hover:bg-[#b56219] disabled:bg-stone-300 text-white font-black py-4 px-6 rounded-full transition-colors duration-200 text-sm uppercase tracking-wider shadow-sm text-center cursor-pointer disabled:cursor-not-allowed"
                        >
                            {loading ? "Sending Order..." : "Confirm & Place Order"}
                        </button>
                    </div>

                    {/* Status Feedback Message Handling */}
                    {message && (
                        <div className={`p-4 rounded-xl text-sm font-bold text-center border transition-all ${message.includes("Sweet")
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-rose-50 border-rose-200 text-rose-700"
                            }`}>
                            {message}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}

export default CheckoutPage;