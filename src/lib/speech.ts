export function speakIndonesian(text: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const indonesian = voices.find((voice) => voice.lang.toLowerCase().startsWith("id"));
  if (indonesian) utterance.voice = indonesian;
  utterance.lang = indonesian?.lang ?? "id-ID";
  utterance.rate = 0.95;
  synth.speak(utterance);
  return true;
}
