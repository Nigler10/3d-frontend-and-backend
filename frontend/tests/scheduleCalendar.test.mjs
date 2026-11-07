import test from "node:test";
import assert from "node:assert/strict";
import { calendarDays, dateKey, dateFromKey, deliveryToday, deliveryWindow, moveMonth } from "../src/components/admin/scheduleCalendar.js";

test("April grid starts on Sunday and includes grey adjacent-month days", () => {
    const days = calendarDays("2026-04");
    assert.equal(days.length, 35);
    assert.equal(days[0].key, "2026-03-29");
    assert.equal(days.at(-1).key, "2026-05-02");
    assert.equal(days.filter((day) => day.inMonth).length, 30);
    assert.equal(dateFromKey(days[0].key).getDay(), 0);
});

test("calendar handles six-week months, leap February and year boundaries", () => {
    assert.equal(calendarDays("2026-08").length, 42);
    assert.equal(calendarDays("2028-02").filter((day) => day.inMonth).length, 29);
    assert.equal(calendarDays("2027-01")[0].key, "2026-12-27");
    assert.equal(calendarDays("2026-12").at(-1).key, "2027-01-02");
});

test("month navigation clamps the selected day and preserves date-only values", () => {
    assert.equal(moveMonth("2026-01-31", 1), "2026-02-28");
    assert.equal(moveMonth("2028-01-31", 1), "2028-02-29");
    assert.equal(moveMonth("2026-01-23", -1), "2025-12-23");
    assert.equal(moveMonth("2026-12-23", 1), "2027-01-23");
    assert.equal(dateKey(dateFromKey("2026-04-23")), "2026-04-23");
});

test("Today follows the delivery business timezone", () => {
    const expected = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    assert.equal(deliveryToday(), expected);
});

test("delivery windows follow the existing thirty-minute booking interval", () => {
    assert.equal(deliveryWindow("08:00:00"), "8:00 AM – 8:30 AM");
    assert.equal(deliveryWindow("11:45:00"), "11:45 AM – 12:15 PM");
    assert.equal(deliveryWindow("23:45:00"), "11:45 PM – 12:15 AM");
    assert.equal(deliveryWindow(null), "Time not scheduled");
});
