import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CityOption } from "@/types/prayer";
import { calculateCompassArrowRotation, calculateQiblaBearing, DEFAULT_QIBLA_CITY, QIBLA_CITIES, type QiblaCity } from "@/src/lib/qibla";

type QiblaLocationSource = "GPS" | "Kota manual" | "Default Jakarta";
type CompassStatus = "Kompas aktif" | "Kompas belum aktif" | "Kompas tidak didukung" | "Izin kompas ditolak";

interface DeviceOrientationEventWithCompass extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

interface DeviceOrientationEventConstructorWithPermission {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

export interface QiblaState {
  city: QiblaCity;
  coordinates: { latitude: number; longitude: number };
  locationSource: QiblaLocationSource;
  qiblaBearing: number;
  heading: number | null;
  arrowRotation: number;
  compassStatus: CompassStatus;
  locationError: string | null;
  compassError: string | null;
  detectingLocation: boolean;
  cities: QiblaCity[];
  detectLocation: () => void;
  selectManualCity: (cityName: string) => void;
  enableCompass: () => Promise<void>;
  refresh: () => void;
}

function cityOptionToQiblaCity(city?: CityOption | null): QiblaCity {
  if (!city || !Number.isFinite(city.latitude) || !Number.isFinite(city.longitude)) return DEFAULT_QIBLA_CITY;
  return { name: city.name, latitude: city.latitude, longitude: city.longitude };
}

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "Izin lokasi ditolak. Pilih kota manual atau aktifkan izin lokasi di browser.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Lokasi tidak tersedia. Coba lagi atau pilih kota manual.";
  if (error.code === error.TIMEOUT) return "Deteksi lokasi terlalu lama. Coba lagi atau pilih kota manual.";
  return "Gagal mendeteksi lokasi. Coba lagi atau pilih kota manual.";
}

export function useQibla(currentCity?: CityOption | null): QiblaState {
  const initialCity = cityOptionToQiblaCity(currentCity);
  const [city, setCity] = useState<QiblaCity>(initialCity);
  const [locationSource, setLocationSource] = useState<QiblaLocationSource>(initialCity.name === DEFAULT_QIBLA_CITY.name ? "Default Jakarta" : "Kota manual");
  const [heading, setHeading] = useState<number | null>(null);
  const [compassStatus, setCompassStatus] = useState<CompassStatus>("Kompas belum aktif");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [compassError, setCompassError] = useState<string | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const orientationHandlerRef = useRef<((event: DeviceOrientationEventWithCompass) => void) | null>(null);

  useEffect(() => {
    if (locationSource === "GPS") return;
    const nextCity = cityOptionToQiblaCity(currentCity);
    setCity(nextCity);
    setLocationSource(nextCity.name === DEFAULT_QIBLA_CITY.name ? "Default Jakarta" : "Kota manual");
  }, [currentCity, locationSource]);

  const qiblaBearing = useMemo(() => calculateQiblaBearing(city.latitude, city.longitude), [city.latitude, city.longitude]);
  const arrowRotation = useMemo(() => calculateCompassArrowRotation(qiblaBearing, heading), [qiblaBearing, heading]);

  const stopCompass = useCallback(() => {
    if (!orientationHandlerRef.current || typeof window === "undefined") return;
    window.removeEventListener("deviceorientationabsolute", orientationHandlerRef.current as EventListener);
    window.removeEventListener("deviceorientation", orientationHandlerRef.current as EventListener);
    orientationHandlerRef.current = null;
  }, []);

  const startCompassListeners = useCallback(() => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setCompassStatus("Kompas tidak didukung");
      setCompassError("Kompas HP tidak aktif, tapi arah derajat kiblat tetap bisa digunakan.");
      return;
    }

    stopCompass();
    const handler = (event: DeviceOrientationEventWithCompass) => {
      const nextHeading = typeof event.webkitCompassHeading === "number" ? event.webkitCompassHeading : typeof event.alpha === "number" ? event.alpha : null;
      if (nextHeading === null) return;
      setHeading(((nextHeading % 360) + 360) % 360);
      setCompassStatus("Kompas aktif");
      setCompassError(null);
    };
    orientationHandlerRef.current = handler;
    window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.addEventListener("deviceorientation", handler as EventListener, true);
    setCompassStatus("Kompas belum aktif");
    setCompassError("Gerakkan HP perlahan. Jika kompas tidak aktif, derajat kiblat tetap bisa digunakan.");
  }, [stopCompass]);

  const enableCompass = useCallback(async () => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      setCompassStatus("Kompas tidak didukung");
      setCompassError("Kompas HP tidak aktif, tapi arah derajat kiblat tetap bisa digunakan.");
      return;
    }

    const orientationConstructor = DeviceOrientationEvent as unknown as DeviceOrientationEventConstructorWithPermission;
    if (typeof orientationConstructor.requestPermission === "function") {
      try {
        const permission = await orientationConstructor.requestPermission();
        if (permission !== "granted") {
          setCompassStatus("Izin kompas ditolak");
          setCompassError("Izin kompas ditolak. Arah derajat kiblat tetap bisa digunakan.");
          return;
        }
      } catch {
        setCompassStatus("Izin kompas ditolak");
        setCompassError("Izin kompas gagal diminta. Arah derajat kiblat tetap bisa digunakan.");
        return;
      }
    }
    startCompassListeners();
  }, [startCompassListeners]);

  const detectLocation = useCallback(() => {
    setLocationError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Browser ini tidak mendukung deteksi lokasi. Pilih kota manual.");
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gpsCity = { name: "Lokasi GPS", latitude: position.coords.latitude, longitude: position.coords.longitude };
        setCity(gpsCity);
        setLocationSource("GPS");
        setLocationError(null);
        setDetectingLocation(false);
      },
      (error) => {
        setLocationError(locationErrorMessage(error));
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  const selectManualCity = useCallback((cityName: string) => {
    const selected = QIBLA_CITIES.find((item) => item.name === cityName) ?? DEFAULT_QIBLA_CITY;
    setCity(selected);
    setLocationSource("Kota manual");
    setLocationError(null);
  }, []);

  const refresh = useCallback(() => {
    setCity((current) => ({ ...current }));
    setLocationError(null);
  }, []);

  useEffect(() => () => stopCompass(), [stopCompass]);

  return {
    city,
    coordinates: { latitude: city.latitude, longitude: city.longitude },
    locationSource,
    qiblaBearing,
    heading,
    arrowRotation,
    compassStatus,
    locationError,
    compassError,
    detectingLocation,
    cities: QIBLA_CITIES,
    detectLocation,
    selectManualCity,
    enableCompass,
    refresh
  };
}
