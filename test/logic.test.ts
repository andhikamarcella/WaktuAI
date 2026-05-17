import { describe, expect, it } from "vitest";
import { findNextPrayer, normalizePrayerTimes } from "../lib/prayer";
import { parseIndonesianTimePhrase } from "../lib/reminders";
import { formatClock, getGreeting } from "../lib/time";
import { parseVoiceCommand } from "../lib/voiceCommands";

describe("voiceCommands", () => {
  it("parses time and date commands", () => {
    expect(parseVoiceCommand("sekarang jam berapa").type).toBe("GET_CURRENT_TIME");
    expect(parseVoiceCommand("tanggal berapa hari ini").type).toBe("GET_CURRENT_DATE");
  });
  it("parses prayer commands and unknown fallback", () => {
    expect(parseVoiceCommand("isya jam berapa")).toMatchObject({ type: "GET_PRAYER_TIME", prayerName: "Isya" });
    expect(parseVoiceCommand("jadwal solat dong").type).toBe("GET_ALL_PRAYER_TIMES");
    expect(parseVoiceCommand("buka pintu garasi").type).toBe("UNKNOWN");
  });
  it("parses reminder and pre-adzan", () => {
    expect(parseVoiceCommand("reminder jam 8 malam", new Date("2026-05-17T10:00:00")).type).toBe("CREATE_REMINDER");
    expect(parseVoiceCommand("ingatkan aku 10 menit sebelum Isya")).toMatchObject({ type: "ENABLE_ADZAN_NOTIFICATION", prayerName: "Isya", leadMinutes: 10 });
  });
});

describe("time and reminders", () => {
  it("formats and greets", () => {
    expect(formatClock(new Date("2026-05-17T07:05:09"))).toContain("07");
    expect(getGreeting(new Date("2026-05-17T16:00:00"))).toBe("Sore");
  });
  it("parses Indonesian time phrases", () => {
    const date = parseIndonesianTimePhrase("ingatkan aku jam 7 malam", new Date("2026-05-17T10:00:00"));
    expect(date?.getHours()).toBe(19);
  });
});

describe("prayer", () => {
  it("normalizes prayer times and finds next prayer", () => {
    const prayers = normalizePrayerTimes({ Fajr: "04:30 (WIB)", Dhuhr: "11:50", Asr: "15:10", Maghrib: "17:45", Isha: "19:00" }, new Date("2026-05-17T08:00:00"));
    expect(prayers[0]).toMatchObject({ name: "Subuh", time: "04:30" });
    expect(findNextPrayer(prayers, new Date("2026-05-17T12:00:00"))?.prayer.name).toBe("Ashar");
  });
});
