export type CommandIntent =
  | "HELP"
  | "ASK_TIME"
  | "PRAYER_SCHEDULE"
  | "QIBLA"
  | "TEST_NOTIFICATION"
  | "TEST_AI_VOICE"
  | "ENABLE_PRAYER_NOTIFICATIONS"
  | "DISABLE_PRAYER_NOTIFICATIONS"
  | "ENABLE_STRONG_REMINDER"
  | "DISABLE_STRONG_REMINDER"
  | "CREATE_EXACT_TIME_REMINDER"
  | "START_RAKAAT_DETECTION"
  | "FALLBACK_MANUAL_RAKAAT"
  | "UNKNOWN";

export type ParsedCommand = {
  intent: CommandIntent;
  raw: string;
  reminderText?: string;
  suggestions: string[];
};

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

export function parseVoiceCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const text = raw.toLowerCase().replace(/\s+/g, " ");
  const baseSuggestions = ["Buka Bantuan", "Jadwal sholat hari ini", "Ingatkan aku 17:46"];

  if (!text) return { intent: "UNKNOWN", raw, suggestions: baseSuggestions };
  if (includesAny(text, ["aku bingung", "cara pakainya", "ini buat apa", "bisa apa aja", "tolong jelasin", "command apa aja", "aku ga ngerti", "bantuan", "help"])) {
    return { intent: "HELP", raw, suggestions: [] };
  }
  if (includesAny(text, ["jam berapa", "waktu sekarang"])) return { intent: "ASK_TIME", raw, suggestions: [] };
  if (includesAny(text, ["jadwal sholat", "waktu sholat"])) return { intent: "PRAYER_SCHEDULE", raw, suggestions: [] };
  if (includesAny(text, ["arah kiblat", "kiblat"])) return { intent: "QIBLA", raw, suggestions: [] };
  if (includesAny(text, ["tes notifikasi", "kirim notifikasi tes"])) return { intent: "TEST_NOTIFICATION", raw, suggestions: [] };
  if (includesAny(text, ["tes suara", "tes suara ai"])) return { intent: "TEST_AI_VOICE", raw, suggestions: [] };
  if (includesAny(text, ["aktifkan notifikasi sholat", "aktifkan notifikasi isya", "nyalakan notifikasi sholat"])) {
    return { intent: "ENABLE_PRAYER_NOTIFICATIONS", raw, suggestions: [] };
  }
  if (includesAny(text, ["matikan semua notifikasi", "matikan notifikasi sholat"])) {
    return { intent: "DISABLE_PRAYER_NOTIFICATIONS", raw, suggestions: [] };
  }
  if (includesAny(text, ["aktifkan pengingat kuat", "pengingatnya yang sering", "mode kuat"])) {
    return { intent: "ENABLE_STRONG_REMINDER", raw, suggestions: [] };
  }
  if (includesAny(text, ["matikan pengingat berulang", "pengingat berulang off", "mode pengingat off"])) {
    return { intent: "DISABLE_STRONG_REMINDER", raw, suggestions: [] };
  }
  if (/\b([01]?\d|2[0-3]):([0-5]\d)\b/.test(text) || includesAny(text, ["ingatkan", "reminder", "bangunin", "alarm"])) {
    return { intent: "CREATE_EXACT_TIME_REMINDER", raw, reminderText: raw, suggestions: [] };
  }
  if (includesAny(text, ["mulai deteksi rakaat", "deteksi rakaat", "kamera rakaat"])) {
    return { intent: "START_RAKAAT_DETECTION", raw, suggestions: [] };
  }
  if (includesAny(text, ["kamera tidak bisa", "pakai hitung manual", "hitung manual"])) {
    return { intent: "FALLBACK_MANUAL_RAKAAT", raw, suggestions: [] };
  }
  return { intent: "UNKNOWN", raw, suggestions: baseSuggestions };
}
