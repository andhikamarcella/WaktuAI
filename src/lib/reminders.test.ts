import { describe, expect, it } from "vitest";
import { parseReminderInput } from "./reminders";

describe("parseReminderInput exact local time", () => {
  it("parses bare 17:46 exactly today when not passed", () => {
    const now = new Date("2026-05-24T10:00:00+07:00");
    const result = parseReminderInput("17:46", { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const date = new Date(result.reminder.dateTime);
    expect(date.getHours()).toBe(17);
    expect(date.getMinutes()).toBe(46);
    expect(result.response).toBe("Siap, aku akan ingatkan jam 17:46.");
  });

  it("parses reminder 17:46 exactly without treating it as duration", () => {
    const now = new Date("2026-05-24T15:30:00+07:00");
    const result = parseReminderInput("ingatkan aku 17:46", { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const date = new Date(result.reminder.dateTime);
    expect(date.getHours()).toBe(17);
    expect(date.getMinutes()).toBe(46);
  });

  it("rolls exact 17:46 to tomorrow when today has passed", () => {
    const now = new Date("2026-05-24T18:00:00+07:00");
    const result = parseReminderInput("reminder 17:46", { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const date = new Date(result.reminder.dateTime);
    expect(date.getDate()).toBe(25);
    expect(date.getHours()).toBe(17);
    expect(date.getMinutes()).toBe(46);
    expect(result.response).toBe("Jam 17:46 hari ini sudah lewat, jadi aku ingatkan besok jam 17:46.");
  });

  it("supports alarm wording for exact time", () => {
    const now = new Date("2026-05-24T03:00:00+07:00");
    const result = parseReminderInput("bangunin aku jam 04:30", { now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reminder.alarmMode).toBe(true);
    const date = new Date(result.reminder.dateTime);
    expect(date.getHours()).toBe(4);
    expect(date.getMinutes()).toBe(30);
  });
});
