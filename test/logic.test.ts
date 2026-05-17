import { describe, expect, it } from "vitest";
import { findNextPrayer, normalizePrayerTimes } from "../lib/prayer";
import { parseIndonesianTimePhrase } from "../lib/reminders";
import { formatClock, getGreeting } from "../lib/time";
import { parseVoiceCommand } from "../lib/voiceCommands";
import { calculateQiblaBearing } from "../src/lib/qibla";
import { advanceRakaatState, createInitialRakaatState, manualDecrement, manualIncrement, resetRakaatState } from "../src/lib/rakaatDetection";

describe("voiceCommands", () => {
  it("parses time and date commands", () => {
    expect(parseVoiceCommand("sekarang jam berapa").type).toBe("GET_CURRENT_TIME");
    expect(parseVoiceCommand("tanggal berapa hari ini").type).toBe("GET_CURRENT_DATE");
  });
  it("parses prayer commands and unknown fallback", () => {
    expect(parseVoiceCommand("isya jam berapa")).toMatchObject({ type: "GET_PRAYER_TIME", prayerName: "Isya" });
    expect(parseVoiceCommand("jadwal solat dong").type).toBe("GET_ALL_PRAYER_TIMES");
    expect(parseVoiceCommand("buka pintu garasi").type).toBe("UNKNOWN");
    expect(parseVoiceCommand("mulai deteksi rakaat").type).toBe("START_RAKAAT_DETECTION");
    expect(parseVoiceCommand("rakaat sekarang berapa").type).toBe("GET_RAKAAT_COUNT");
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


describe("rakaatDetection", () => {
  it("does not count first sujud as rakaat", () => {
    let state = createInitialRakaatState(4);
    state = advanceRakaatState(state, "Berdiri", 1000).state;
    state = advanceRakaatState(state, "Rukuk", 1500).state;
    const result = advanceRakaatState(state, "Sujud", 2000);
    expect(result.counted).toBe(false);
    expect(result.state.count).toBe(0);
  });

  it("does not count second sujud immediately as rakaat", () => {
    let state = createInitialRakaatState(4);
    for (const [posture, time] of [["Berdiri", 1000], ["Rukuk", 1500], ["Sujud", 2000], ["Duduk", 2500], ["Sujud", 3000]] as const) {
      state = advanceRakaatState(state, posture, time).state;
    }
    expect(state.count).toBe(0);
    expect(state.machineState).toBe("SECOND_SUJUD_DETECTED");
  });

  it("counts 1 rakaat only after complete movement sequence returns to standing", () => {
    let state = createInitialRakaatState(4);
    for (const [posture, time] of [["Berdiri", 1000], ["Rukuk", 1500], ["Sujud", 2000], ["Duduk", 2500], ["Sujud", 3000]] as const) {
      state = advanceRakaatState(state, posture, time).state;
    }
    const result = advanceRakaatState(state, "Berdiri", 5500);
    expect(result.counted).toBe(true);
    expect(result.state.count).toBe(1);
  });

  it("does not double count repeated Berdiri frames", () => {
    let state = createInitialRakaatState(4);
    for (const [posture, time] of [["Berdiri", 1000], ["Rukuk", 1500], ["Sujud", 2000], ["Duduk", 2500], ["Sujud", 3000], ["Berdiri", 5500]] as const) {
      state = advanceRakaatState(state, posture, time).state;
    }
    const repeated = advanceRakaatState(state, "Berdiri", 5600);
    expect(repeated.counted).toBe(false);
    expect(repeated.state.count).toBe(1);
  });

  it("supports reset and manual plus/minus correction", () => {
    let state = createInitialRakaatState(4);
    state = manualIncrement(state, 1000);
    state = manualIncrement(state, 1200);
    expect(state.count).toBe(2);
    state = manualDecrement(state);
    expect(state.count).toBe(1);
    expect(resetRakaatState(2).count).toBe(0);
  });

  it("ignores invalid sequence", () => {
    let state = createInitialRakaatState(4);
    state = advanceRakaatState(state, "Berdiri", 1000).state;
    state = advanceRakaatState(state, "Sujud", 1500).state;
    state = advanceRakaatState(state, "Berdiri", 4000).state;
    expect(state.count).toBe(0);
    expect(state.machineState).toBe("STANDING_STARTED");
  });
});


describe("qibla", () => {
  it.each([
    ["Jakarta", -6.2088, 106.8456, 295],
    ["Bekasi", -6.2383, 106.9756, 295],
    ["Bandung", -6.9175, 107.6191, 295],
    ["Surabaya", -7.2575, 112.7521, 294]
  ])("calculates qibla bearing for %s", (_city: string, latitude: number, longitude: number, expected: number) => {
    expect(calculateQiblaBearing(latitude, longitude)).toBeGreaterThanOrEqual(expected - 3);
    expect(calculateQiblaBearing(latitude, longitude)).toBeLessThanOrEqual(expected + 3);
  });
});
