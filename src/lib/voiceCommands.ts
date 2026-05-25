export type CommandIntent =
  | "HELP"
  | "TROUBLESHOOT"
  | "TEST_NOTIFICATION"
  | "TEST_AI_VOICE"
  | "ENABLE_PRAYER_NOTIFICATIONS"
  | "DISABLE_PRAYER_NOTIFICATIONS"
  | "ENABLE_STRONG_REMINDER"
  | "DISABLE_STRONG_REMINDER"
  | "CREATE_REMINDER"
  | "START_RAKAAT_DETECTION"
  | "FALLBACK_MANUAL_RAKAAT"
  | "QIBLA"
  | "PRAYER_TIME"
  | "NEXT_PRAYER"
  | "MARK_PRAYER_DONE"
  | "TASBIH"
  | "RESET_TASBIH"
  | "DND_ON"
  | "DND_OFF"
  | "SAFE_MODE"
  | "RESET_APP"
  | "UNKNOWN";

export interface ParsedCommand {
  intent: CommandIntent;
  text: string;
  topic?: string;
}

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

export function parseCommand(raw: string): ParsedCommand {
  const text = raw.trim().toLowerCase();
  if (!text) return { intent: "UNKNOWN", text };

  if (includesAny(text, ["aku bingung", "cara pakainya", "bisa apa aja", "tolong jelasin", "command apa", "aku ga ngerti"])) {
    return { intent: "HELP", text };
  }
  if (includesAny(text, ["notifikasi tidak masuk", "suara tidak bunyi", "kiblat salah", "kamera tidak bisa", "mic tidak bisa", "jadwal sholat salah", "kenapa error", "tolong perbaiki"])) {
    return { intent: "TROUBLESHOOT", text };
  }
  if (includesAny(text, ["tes notifikasi", "kirim notifikasi tes"])) return { intent: "TEST_NOTIFICATION", text };
  if (includesAny(text, ["tes suara", "tes suara ai"])) return { intent: "TEST_AI_VOICE", text };
  if (includesAny(text, ["aktifkan notifikasi", "aktifin notif"])) return { intent: "ENABLE_PRAYER_NOTIFICATIONS", text };
  if (includesAny(text, ["matikan notifikasi", "matiin notif"])) return { intent: "DISABLE_PRAYER_NOTIFICATIONS", text };
  if (includesAny(text, ["aktifkan pengingat kuat", "pengingatnya yang sering"])) return { intent: "ENABLE_STRONG_REMINDER", text };
  if (includesAny(text, ["matikan pengingat berulang"])) return { intent: "DISABLE_STRONG_REMINDER", text };
  if (includesAny(text, ["jangan ganggu", "pause notifikasi"])) return { intent: "DND_ON", text };
  if (includesAny(text, ["matikan jangan ganggu", "aktifkan lagi notifikasi"])) return { intent: "DND_OFF", text };
  if (includesAny(text, ["mode aman"])) return { intent: "SAFE_MODE", text };
  if (includesAny(text, ["reset aplikasi"])) return { intent: "RESET_APP", text };
  if (includesAny(text, ["mulai deteksi rakaat"])) return { intent: "START_RAKAAT_DETECTION", text };
  if (includesAny(text, ["pakai hitung manual", "kamera tidak bisa"])) return { intent: "FALLBACK_MANUAL_RAKAAT", text };
  if (includesAny(text, ["arah kiblat", "kiblat"])) return { intent: "QIBLA", text };
  if (includesAny(text, ["adzan selanjutnya", "sholat selanjutnya"])) return { intent: "NEXT_PRAYER", text };
  if (includesAny(text, ["udah sholat", "sudah sholat", "catat sholat"])) return { intent: "MARK_PRAYER_DONE", text };
  if (includesAny(text, ["hitung tasbih", "tasbih"])) return { intent: "TASBIH", text };
  if (includesAny(text, ["reset tasbih"])) return { intent: "RESET_TASBIH", text };
  if (/\b(ingatkan|reminder|alarm|bangunin|tunda)\b|\b\d{1,2}[:.]\d{2}\b/.test(text)) return { intent: "CREATE_REMINDER", text };
  if (/(subuh|dzuhur|zuhur|ashar|maghrib|isya).*(kapan|jam berapa)|berapa menit lagi/.test(text)) return { intent: "PRAYER_TIME", text };

  return { intent: "UNKNOWN", text };
}

export const suggestedCommands = [
  "Jadwal sholat hari ini",
  "Ingatkan aku 17:46",
  "Arah kiblat",
  "Tes notifikasi",
  "Aku bingung",
];
