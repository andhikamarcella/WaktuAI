import type { PrayerName } from "./prayer";

export interface Reminder {
  id: string;
  label: string;
  scheduledAt: string;
  createdAt: string;
  source: "voice" | "manual" | "prayer";
  prayerName?: PrayerName;
}

export interface CommandHistoryItem {
  id: string;
  command: string;
  response: string;
  createdAt: string;
}

export interface AssistantSettings {
  voiceEnabled: boolean;
  speechRate: "slow" | "normal" | "fast";
  notificationSound: boolean;
}

export interface DndState {
  until: string | null;
}
