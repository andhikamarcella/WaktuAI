import type { QiblaState } from "../hooks/useQibla";
import { formatCoordinate, type QiblaCity } from "../lib/qibla";

interface QiblaCardProps {
  qibla: QiblaState;
  onManualCityChange?: (cityName: string) => void;
}

export default function QiblaCard({ qibla, onManualCityChange }: QiblaCardProps) {
  const bearing = Math.round(qibla.qiblaBearing);
  return <section className="card" aria-labelledby="qibla-title">
    <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--primary)]">Arah dihitung dari utara searah jarum jam.</p>
        <h2 id="qibla-title" className="break-words text-2xl font-bold text-[var(--text)]">Arah Kiblat</h2>
      </div>
      <span className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm font-semibold text-[var(--text)]">{qibla.locationSource}</span>
    </div>

    <div className="mx-auto mt-5 grid aspect-square w-full max-w-[240px] place-items-center rounded-full border-8 border-[var(--primary-soft)] bg-[var(--bg-soft)] p-4 sm:max-w-[280px]">
      <div className="grid h-full w-full place-items-center rounded-full border border-[var(--border)] bg-[var(--card)]">
        <div className="text-center transition-transform duration-200" style={{ transform: `rotate(${qibla.arrowRotation}deg)` }} aria-label={`Panah kiblat ${bearing} derajat`}>
          <div className="text-5xl leading-none text-[var(--primary)] sm:text-6xl">▲</div>
          <p className="mt-1 text-sm font-bold text-[var(--text)]">Kiblat</p>
        </div>
      </div>
    </div>

    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--primary-soft)] p-4 text-center">
      <p className="text-sm text-[var(--text-soft)]">Arah kiblat</p>
      <p className="font-mono text-4xl font-black tabular-nums text-[var(--text)]">{bearing}°</p>
      <p className="text-sm text-[var(--text-soft)]">dari utara</p>
    </div>

    <div className="mt-4 grid gap-2 text-sm text-[var(--text)]">
      <p><strong>Lokasi:</strong> {qibla.city.name}</p>
      <p><strong>Koordinat:</strong> {formatCoordinate(qibla.coordinates.latitude)}, {formatCoordinate(qibla.coordinates.longitude)}</p>
      <p><strong>Status kompas:</strong> {qibla.compassStatus}</p>
      <p className="text-[var(--text-soft)]">{qibla.compassStatus === "Kompas aktif" ? `Heading HP: ${Math.round(qibla.heading ?? 0)}°` : "Kompas HP tidak aktif, tapi arah derajat kiblat tetap bisa digunakan."}</p>
    </div>

    {(qibla.locationError || qibla.compassError) && <div className="mt-4 grid gap-2">
      {qibla.locationError && <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text)]">{qibla.locationError}</p>}
      {qibla.compassError && <p className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-sm text-[var(--text)]">{qibla.compassError}</p>}
    </div>}

    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button className="btn-primary" onClick={qibla.detectLocation} disabled={qibla.detectingLocation}>{qibla.detectingLocation ? "Mendeteksi..." : "Deteksi Lokasi Saya"}</button>
      <button className="btn-secondary" onClick={() => { void qibla.enableCompass(); }}>Aktifkan Kompas HP</button>
      <button className="btn-secondary" onClick={qibla.refresh}>Refresh</button>
      <label className="block text-sm font-semibold text-[var(--text)]">Pilih Kota Manual
        <select className="input mt-1" value={qibla.cities.some((city: QiblaCity) => city.name === qibla.city.name) ? qibla.city.name : "Jakarta"} onChange={(event) => { qibla.selectManualCity(event.target.value); onManualCityChange?.(event.target.value); }}>
          {qibla.cities.map((city: QiblaCity) => <option key={city.name} value={city.name}>{city.name}</option>)}
        </select>
      </label>
    </div>
  </section>;
}
