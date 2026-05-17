import type { AssistantSettings } from "@/types/reminder";

export function speakIndonesian(text: string, settings: Pick<AssistantSettings, "voiceEnabled" | "speechRate">): boolean {
  if (!settings.voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = settings.speechRate === "slow" ? 0.85 : settings.speechRate === "fast" ? 1.15 : 1;
    const voices = window.speechSynthesis.getVoices?.() ?? [];
    const idVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("id"));
    if (idVoice) utterance.voice = idVoice;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
