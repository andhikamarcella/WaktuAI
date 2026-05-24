export type NotificationPermissionState = "unsupported" | NotificationPermission;

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

export function sendBrowserNotification(title: string, body: string): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  new Notification(title, {
    body,
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg"
  });
  return true;
}
