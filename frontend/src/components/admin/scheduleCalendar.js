// Date-only order fields must never be shifted through UTC.
export function dateKey(value) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function dateFromKey(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function deliveryToday() {
    const parts = new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const part = (name) => parts.find((item) => item.type === name).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function calendarDays(month) {
    const first = dateFromKey(`${month}-01`);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    const length = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
    return Array.from({ length }, (_, index) => {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        return { key: dateKey(day), day: day.getDate(), inMonth: dateKey(day).startsWith(month) };
    });
}

export function moveMonth(selected, amount) {
    const current = dateFromKey(selected);
    const target = new Date(current.getFullYear(), current.getMonth() + amount, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(current.getDate(), last));
    return dateKey(target);
}

export function deliveryWindow(value) {
    if (!value) return "Time not scheduled";
    const [hours, minutes] = value.split(":").map(Number);
    const label = (total) => {
        const hour = Math.floor(total / 60) % 24;
        return `${hour % 12 || 12}:${String(total % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
    };
    return `${label(hours * 60 + minutes)} – ${label(hours * 60 + minutes + 30)}`;
}
