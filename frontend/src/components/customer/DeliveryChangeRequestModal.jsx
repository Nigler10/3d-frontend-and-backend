// src/components/customer/DeliveryChangeRequestModal.jsx
import { useEffect, useState } from "react";
import {
    CalendarClock,
    Clock,
    MapPin,
    Phone,
    User,
    X,
} from "lucide-react";

import { authFetch } from "../../utils/auth";
import AddressSelector from "../address/AddressSelector";

function getLocalDateISO() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatSlotLabel(slot) {
    const [hours, minutes] = slot.split(":").map(Number);

    const period = hours >= 12 ? "PM" : "AM";
    const display = hours === 0
        ? 12
        : hours > 12
            ? hours - 12
            : hours;

    return `${String(display).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

function buildInitialForm(order) {
    return {
        full_name: order.full_name || "",
        phone: order.phone || "",

        street: order.street || "",
        region: order.region || "",
        region_code: order.region_code || "",

        province: order.province || "",
        province_code: order.province_code || "",

        city: order.city || "",
        city_code: order.city_code || "",

        barangay: order.barangay || "",
        barangay_code: order.barangay_code || "",

        postal_code: order.postal_code || "",

        delivery_date: order.delivery_date || "",
        delivery_time: order.delivery_time
            ? order.delivery_time.slice(0, 5)
            : "",
    };
}

export default function DeliveryChangeRequestModal({
    isOpen,
    order,
    onClose,
    onSubmitted,
}) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const [form, setForm] = useState(() => buildInitialForm(order));

    const [availableSlots, setAvailableSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!isOpen || !order) return;

        setForm(buildInitialForm(order));
        setMessage("");
        setAvailableSlots([]);
    }, [isOpen, order]);

    useEffect(() => {
        if (!isOpen || !form.delivery_date || !order?.id) {
            setAvailableSlots([]);
            return;
        }

        let active = true;

        const fetchSlots = async () => {
            setSlotsLoading(true);

            try {
                const params = new URLSearchParams({
                    date: form.delivery_date,
                    order_id: String(order.id),
                });

                const res = await authFetch(
                    `${BASEURL}/api/delivery-slots/?${params.toString()}`
                );

                const data = await res.json();

                if (!active) return;

                if (!res.ok) {
                    setAvailableSlots([]);
                    setMessage(
                        data.error || "Unable to load available time slots."
                    );
                    return;
                }

                const slots = data.slots || [];

                setAvailableSlots(slots);

                setForm((current) => ({
                    ...current,
                    delivery_time: slots.includes(current.delivery_time)
                        ? current.delivery_time
                        : "",
                }));

            } catch {
                if (active) {
                    setAvailableSlots([]);
                    setMessage("Unable to load delivery time slots.");
                }
            } finally {
                if (active) {
                    setSlotsLoading(false);
                }
            }
        };

        fetchSlots();

        return () => {
            active = false;
        };
    }, [isOpen, form.delivery_date, order?.id, BASEURL]);

    if (!isOpen || !order) return null;

    const updateField = (field, value) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleDateChange = (event) => {
        setForm((current) => ({
            ...current,
            delivery_date: event.target.value,
            delivery_time: "",
        }));

        setMessage("");
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (loading) return;

        setMessage("");

        if (form.delivery_date < getLocalDateISO()) {
            setMessage("Delivery date cannot be in the past.");
            return;
        }

        if (!availableSlots.includes(form.delivery_time)) {
            setMessage(
                "Please select a currently available delivery time slot."
            );
            return;
        }

        setLoading(true);

        try {
            const res = await authFetch(
                `${BASEURL}/api/orders/customer/orders/${order.id}/delivery-change-requests/`,
                {
                    method: "POST",
                    body: JSON.stringify(form),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                setMessage(
                    data.error || "Unable to submit your delivery change request."
                );
                return;
            }

            await onSubmitted?.(data.request);

        } catch {
            setMessage(
                "Unable to connect to the server. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[180] flex items-center justify-center bg-black/60 p-3 sm:p-5"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !loading) {
                    onClose();
                }
            }}
        >
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#f3e1c6] bg-white shadow-2xl">

                <header className="flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4 sm:px-7">
                    <div>
                        <h2 className="text-lg font-black text-[#844414] sm:text-xl">
                            Request Delivery Changes
                        </h2>

                        <p className="mt-1 text-xs text-stone-500">
                            Order #{order.id}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <form
                    onSubmit={handleSubmit}
                    className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-7"
                >
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-bold text-amber-900">
                            Important
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-amber-800">
                            Your current delivery information will remain
                            unchanged until the bakery reviews and approves
                            your request.
                        </p>
                    </div>

                    {/* Recipient */}
                    <section className="space-y-4">
                        <h3 className="flex items-center gap-2 font-black text-[#844414]">
                            <User className="h-5 w-5" />
                            Recipient Information
                        </h3>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">
                                    Recipient Name *
                                </label>

                                <input
                                    type="text"
                                    value={form.full_name}
                                    onChange={(e) =>
                                        updateField("full_name", e.target.value)
                                    }
                                    required
                                    maxLength={150}
                                    className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-[#d67b27]"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">
                                    Contact Number *
                                </label>

                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />

                                    <input
                                        type="tel"
                                        value={form.phone}
                                        onChange={(e) =>
                                            updateField(
                                                "phone",
                                                e.target.value.replace(/\D/g, "").slice(0, 11)
                                            )
                                        }
                                        required
                                        maxLength={11}
                                        pattern="09[0-9]{9}"
                                        placeholder="09XXXXXXXXX"
                                        className="w-full rounded-xl border border-stone-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#d67b27]"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Address */}
                    <section className="space-y-4">
                        <h3 className="flex items-center gap-2 font-black text-[#844414]">
                            <MapPin className="h-5 w-5" />
                            Delivery Address
                        </h3>

                        <AddressSelector
                            value={form}
                            onChange={(changes) => {
                                setForm((current) => ({
                                    ...current,
                                    ...changes,
                                }));
                            }}
                        />
                    </section>

                    {/* Delivery Schedule */}
                    <section className="space-y-4">
                        <h3 className="flex items-center gap-2 font-black text-[#844414]">
                            <CalendarClock className="h-5 w-5" />
                            Delivery Schedule
                        </h3>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">
                                    Delivery Date *
                                </label>

                                <input
                                    type="date"
                                    value={form.delivery_date}
                                    min={getLocalDateISO()}
                                    onChange={handleDateChange}
                                    required
                                    className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-[#d67b27]"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone-500">
                                    Delivery Time *
                                </label>

                                <div className="relative">
                                    <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />

                                    <select
                                        value={form.delivery_time}
                                        onChange={(e) =>
                                            updateField("delivery_time", e.target.value)
                                        }
                                        disabled={
                                            !form.delivery_date ||
                                            slotsLoading ||
                                            availableSlots.length === 0
                                        }
                                        required
                                        className="w-full appearance-none rounded-xl border border-stone-200 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#d67b27] disabled:bg-stone-50 disabled:text-stone-400"
                                    >
                                        <option value="">
                                            {slotsLoading
                                                ? "Loading available slots..."
                                                : !form.delivery_date
                                                    ? "Select a date first"
                                                    : "Choose a delivery time"}
                                        </option>

                                        {availableSlots.map((slot) => (
                                            <option key={slot} value={slot}>
                                                {formatSlotLabel(slot)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {form.delivery_date && !slotsLoading && availableSlots.length === 0 && (
                            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                                No available time slots for this date. Please select another date.
                            </p>
                        )}
                    </section>

                    {message && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                            {message}
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-3 border-t border-stone-100 pt-5 sm:flex-row">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="w-full rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-bold text-stone-600 transition hover:bg-stone-50 disabled:opacity-50 sm:w-auto"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={
                                loading ||
                                slotsLoading ||
                                !form.delivery_date ||
                                !form.delivery_time
                            }
                            className="w-full flex-1 rounded-xl bg-[#d67b27] px-5 py-3 text-sm font-black text-white transition hover:bg-[#b56219] disabled:cursor-not-allowed disabled:bg-stone-300"
                        >
                            {loading
                                ? "Submitting Request..."
                                : "Submit Change Request"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}