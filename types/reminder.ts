import type { PrayerName } from "./prayer";

export interface Reminder {
  id: string;
  label: string;
  scheduledAt: string;
  createdAt: string;
  source: "voice" | "manual" | "prayer";
  prayerName?: PrayerName;
  completed?: boolean;
  snoozedUntil?: string | null;
}

export interface CommandHistoryItem {
  id: string;
  command: string;
  response: string;
  createdAt: string;
}

export type PersistentReminderMode = "off" | "gentle" | "strong";

export interface AssistantSettings {
  voiceEnabled: boolean;
  speechRate: "slow" | "normal" | "fast";
  notificationSound: boolean;
  prayerVoiceEnabled: boolean;
  reminderVoiceEnabled: boolean;
  persistentReminderMode: PersistentReminderMode;
}

export interface DndState {
  until: string | null;
}
