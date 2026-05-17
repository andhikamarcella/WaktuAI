import { useCallback, useEffect, useRef } from "react";
import type { Reminder, AssistantSettings, DndState } from "@/types/reminder";
import { showBrowserNotification, isDndActive } from "@/lib/notifications";
import { readStorage, writeStorage } from "@/lib/storage";
import { speakIndonesian } from "@/lib/speech";

export interface ReminderBannerState { reminder: Reminder; message: string }
interface Args {
  reminders: Reminder[];
  assistant: AssistantSettings;
  dnd: DndState;
  onToast: (message: string) => void;
  onFire: (banner: ReminderBannerState) => void;
}

const SENT_KEY = "waktuai.sentReminderIds";

function getSent(): Set<string> { return new Set(readStorage<string[]>(SENT_KEY, [])); }
function saveSent(sent: Set<string>): void { writeStorage(SENT_KEY, [...sent]); }

export function useReminderScheduler({ reminders, assistant, dnd, onToast, onFire }: Args): void {
  const argsRef = useRef({ reminders, assistant, dnd, onToast, onFire });
  argsRef.current = { reminders, assistant, dnd, onToast, onFire };

  const check = useCallback(() => {
    const { reminders: current, assistant: settings, dnd: dndState, onToast: toast, onFire: fire } = argsRef.current;
    const now = Date.now();
    const sent = getSent();
    let changed = false;
    for (const reminder of current) {
      if (reminder.completed || sent.has(reminder.id)) continue;
      const target = new Date(reminder.snoozedUntil || reminder.scheduledAt).getTime();
      if (Number.isNaN(target) || now < target || now - target > 7 * 24 * 60 * 60_000) continue;
      const message = reminder.label || "Reminder WaktuAI";
      if (!isDndActive(dndState)) {
        showBrowserNotification("WaktuAI - Reminder", message, settings.notificationSound, dndState);
        toast(message);
        if (settings.reminderVoiceEnabled) speakIndonesian(message, settings);
        fire({ reminder, message });
      }
      sent.add(reminder.id); changed = true;
    }
    if (changed) saveSent(sent);
  }, []);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [check]);
}
