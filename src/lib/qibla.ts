export interface QiblaCity {
  name: string;
  latitude: number;
  longitude: number;
}

export const KAABA_COORDINATE = {
  latitude: 21.422487,
  longitude: 39.826206
} as const;

export const QIBLA_CITIES: QiblaCity[] = [
  { name: "Jakarta", latitude: -6.2088, longitude: 106.8456 },
  { name: "Bekasi", latitude: -6.2383, longitude: 106.9756 },
  { name: "Bandung", latitude: -6.9175, longitude: 107.6191 },
  { name: "Surabaya", latitude: -7.2575, longitude: 112.7521 },
  { name: "Yogyakarta", latitude: -7.7956, longitude: 110.3695 },
  { name: "Semarang", latitude: -6.9667, longitude: 110.4167 },
  { name: "Medan", latitude: 3.5952, longitude: 98.6722 },
  { name: "Makassar", latitude: -5.1477, longitude: 119.4327 },
  { name: "Palembang", latitude: -2.9761, longitude: 104.7754 },
  { name: "Tangerang", latitude: -6.1783, longitude: 106.6319 },
  { name: "Depok", latitude: -6.4025, longitude: 106.7942 },
  { name: "Bogor", latitude: -6.5971, longitude: 106.8060 }
];

export const DEFAULT_QIBLA_CITY = QIBLA_CITIES[0];

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function normalizeDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

export function calculateQiblaBearing(latitude: number, longitude: number): number {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return calculateQiblaBearing(DEFAULT_QIBLA_CITY.latitude, DEFAULT_QIBLA_CITY.longitude);

  const lat1 = toRadians(latitude);
  const lon1 = toRadians(longitude);
  const lat2 = toRadians(KAABA_COORDINATE.latitude);
  const lon2 = toRadians(KAABA_COORDINATE.longitude);
  const deltaLon = lon2 - lon1;

  const y = Math.sin(deltaLon);
  const x = Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(deltaLon);
  const bearing = toDegrees(Math.atan2(y, x));

  return normalizeDegrees(bearing);
}

export function calculateCompassArrowRotation(qiblaBearing: number, heading: number | null): number {
  return normalizeDegrees(qiblaBearing - (heading ?? 0));
}

export function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "-";
}
