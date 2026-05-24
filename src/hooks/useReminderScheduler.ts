import { useCallback, useEffect } from "react";
import { Reminder } from "../lib/reminders";
import { sendBrowserNotification } from "../lib/notifications";
import { speakIndonesian } from "../lib/speech";

export type ReminderBanner = {
  reminder: Reminder;
  message: string;
};

type UseReminderSchedulerOptions = {
  reminders: Reminder[];
  sentReminderIds: string[];
  voiceEnabled: boolean;
  onSentReminderIdsChange: (ids: string[]) => void;
  onReminderBanner: (banner: ReminderBanner) => void;
  onToast: (message: string) => void;
  onReminderRepeat: (reminderId: string) => void;
};

export function useReminderScheduler(options: UseReminderSchedulerOptions): void {
  const {
    reminders,
    sentReminderIds,
    voiceEnabled,
    onSentReminderIdsChange,
    onReminderBanner,
    onToast,
    onReminderRepeat
  } = options;

  const check = useCallback(() => {
    const now = Date.now();
    let nextSent = sentReminderIds;
    let changed = false;

    for (const reminder of reminders) {
      if (reminder.done) continue;
      const due = new Date(reminder.dateTime).getTime();
      if (Number.isNaN(due) || now < due) continue;
      const sentKey = `${reminder.id}:${reminder.repeatCount}`;
      if (sentReminderIds.includes(sentKey)) continue;

      const body = `${reminder.title} sekarang.`;
      sendBrowserNotification("WaktuAI Reminder", body);
      onToast(body);
      if (voiceEnabled) speakIndonesian(`WaktuAI mengingatkan. ${reminder.title}.`);
      onReminderBanner({ reminder, message: body });
      nextSent = [...nextSent, sentKey];
      changed = true;
      if (reminder.alarmMode && reminder.repeatCount < 3) onReminderRepeat(reminder.id);
    }

    if (changed) onSentReminderIdsChange(nextSent);
  }, [onReminderBanner, onReminderRepeat, onSentReminderIdsChange, onToast, reminders, sentReminderIds, voiceEnabled]);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, 20_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);
}
