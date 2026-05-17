import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "WaktuAI - Asisten Waktu, Adzan, dan Reminder",
  description: "Asisten suara ringan untuk jam real-time, jadwal sholat, adzan, reminder, dan notifikasi.",
  applicationName: "WaktuAI",
  manifest: "/manifest.json",
  icons: [{ rel: "icon", url: "/icon.svg" }, { rel: "apple-touch-icon", url: "/icon.svg" }],
  openGraph: {
    title: "WaktuAI - Asisten Waktu, Adzan, dan Reminder",
    description: "Asisten suara ringan untuk jam real-time, jadwal sholat, adzan, reminder, kiblat, dan notifikasi.",
    type: "website",
    locale: "id_ID",
    siteName: "WaktuAI"
  },
  appleWebApp: { capable: true, title: "WaktuAI", statusBarStyle: "default" }
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f8fafc" }, { media: "(prefers-color-scheme: dark)", color: "#020617" }] };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" suppressHydrationWarning><body><ServiceWorkerRegister />{children}</body></html>;
}
