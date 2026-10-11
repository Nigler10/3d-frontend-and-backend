import { useState, useEffect, useRef, useCallback } from "react";
import { useCart } from "../context/CartContext";
import { authFetch } from "../utils/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import AddressSelector from "../components/address/AddressSelector";
import { MapPin, Phone, Clock, FileText, ChevronDown } from "lucide-react";

/**
 * Format a 24-hour "HH:MM" string into a 12-hour display like "01:00 PM".
 */
function formatSlotLabel(slot24) {
    const [h, m] = slot24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(display).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

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

    // ── Delivery time‑slot state ──
    const [availableSlots, setAvailableSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [slotsError, setSlotsError] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Today's date in YYYY-MM-DD for the date input min value
    const todayISO = new Date().toLocaleDateString("en-CA");

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

    // ── Fetch available delivery slots when the date changes ──
    const fetchDeliverySlots = useCallback(
        async (date) => {
            if (!date) {
                setAvailableSlots([]);
                setSlotsError("");
                return;
            }

            setSlotsLoading(true);
            setSlotsError("");

            try {
                const res = await authFetch(
                    `${BASEURL}/api/delivery-slots/?date=${date}`
                );
                const data = await res.json();

                if (!res.ok) {
                    setSlotsError(data.error || "Unable to load time slots.");
                    setAvailableSlots([]);
                    return;
                }

                setAvailableSlots(data.slots || []);

                if ((data.slots || []).length === 0) {
                    setSlotsError(
                        "No available time slots. Please select another date."
                    );
                }

                // If the currently selected time is no longer available, clear it.
                if (
                    deliveryTime &&
                    !(data.slots || []).includes(deliveryTime)
                ) {
                    setDeliveryTime("");
                }
            } catch {
                setSlotsError("Failed to load time slots. Please try again.");
                setAvailableSlots([]);
            } finally {
                setSlotsLoading(false);
            }
        },
        [BASEURL, deliveryTime]
    );

    useEffect(() => {
        fetchDeliverySlots(deliveryDate);
    }, [deliveryDate, fetchDeliverySlots]);

    // ── Close dropdown when clicking outside ──
    useEffect(() => {
        function handleClickOutside(event) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target)
            ) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleDateChange = (e) => {
        const newDate = e.target.value;

        // Prevent past dates
        if (newDate < todayISO) {
            setMessage("Please select today or a future date.");
            return;
        }

        setMessage("");
        setDeliveryDate(newDate);
        setDeliveryTime(""); // reset time when date changes
        setIsDropdownOpen(false);
    };

    const handleTimeSelect = (slot) => {
        setDeliveryTime(slot);
        setIsDropdownOpen(false);
    };

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

        if (!deliveryDate) {
            setMessage("Please select a delivery date.");
            return;
        }

        if (deliveryDate < todayISO) {
            setMessage("Delivery date cannot be in the past.");
            return;
        }

        if (!deliveryTime) {
            setMessage("Please select a preferred delivery time.");
            return;
        }

        // Re-validate that the selected slot is still available
        if (!availableSlots.includes(deliveryTime)) {
            setMessage(
                "The selected time slot is no longer available. Please choose another."
            );
            setDeliveryTime("");
            fetchDeliverySlots(deliveryDate);
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

                    setMessage("Sweet! Order submitted for review!");

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
                setMessage("Sweet! Order submitted for review!");
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
                            <MapPin className="w-5 h-5 text-[#844414]" /> Delivery Address
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

                                            <p className="text-xs font-bold text-[#d67b27] mt-1 flex items-center gap-1">
                                                <Phone className="w-3.5 h-3.5" /> {profileAddress.phone}
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
                            <Clock className="w-5 h-5 text-[#844414]" /> Schedule Delivery
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex flex-col">
                                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Date *</label>
                                <input
                                    type="date"
                                    value={deliveryDate}
                                    min={todayISO}
                                    onChange={handleDateChange}
                                    required
                                    className="w-full bg-white border border-stone-200 focus:border-[#d67b27] focus:ring-1 focus:ring-[#d67b27] rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
                                />
                            </div>

                            {/* ── Preferred Time Dropdown ── */}
                            <div className="flex flex-col" ref={dropdownRef}>
                                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Preferred Time *</label>

                                <div className="relative">
                                    {/* Trigger button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!deliveryDate) {
                                                setMessage("Please select a delivery date first.");
                                                return;
                                            }
                                            if (availableSlots.length > 0) {
                                                setIsDropdownOpen((prev) => !prev);
                                            }
                                        }}
                                        disabled={slotsLoading}
                                        className={`w-full flex items-center justify-between bg-white border rounded-xl px-4 py-2.5 text-sm outline-none transition-all cursor-pointer ${isDropdownOpen
                                            ? "border-[#d67b27] ring-1 ring-[#d67b27]"
                                            : "border-stone-200 hover:border-stone-300"
                                            } ${!deliveryDate ? "text-stone-400" : "text-stone-800"}`}
                                    >
                                        <span>
                                            {slotsLoading
                                                ? "Loading slots..."
                                                : deliveryTime
                                                    ? formatSlotLabel(deliveryTime)
                                                    : deliveryDate
                                                        ? "Select a time"
                                                        : "Pick a date first"}
                                        </span>
                                        <ChevronDown
                                            className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>

                                    {/* Dropdown list – max 6 items visible */}
                                    {isDropdownOpen && (
                                        <ul
                                            className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-y-auto"
                                            style={{ maxHeight: `${6 * 40}px` }}
                                        >
                                            {availableSlots.length === 0 ? (
                                                <li className="px-4 py-3 text-sm text-stone-400 text-center">
                                                    No available time slots.
                                                </li>
                                            ) : (
                                                availableSlots.map((slot) => (
                                                    <li key={slot}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTimeSelect(slot)}
                                                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${deliveryTime === slot
                                                                ? "bg-[#fdf2e2] text-[#844414] font-bold"
                                                                : "text-stone-700 hover:bg-[#fffaf2]"
                                                                }`}
                                                        >
                                                            {formatSlotLabel(slot)}
                                                        </button>
                                                    </li>
                                                ))
                                            )}
                                        </ul>
                                    )}
                                </div>

                                {/* Error / empty-state message below the dropdown */}
                                {slotsError && !slotsLoading && (
                                    <p className="mt-1.5 text-xs font-semibold text-rose-500">
                                        {slotsError}
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Notes Section */}
                    <section className="space-y-4">
                        <h2 className="text-xl font-bold text-[#844414] flex items-center gap-2">
                            <FileText className="w-5 h-5 text-[#844414]" /> Special Instructions
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