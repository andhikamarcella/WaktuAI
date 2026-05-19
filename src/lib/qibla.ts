const toRad = (d: number) => (d * Math.PI) / 180;
export const getQiblaDirection = (lat: number, lon: number) => {
  const lat1 = toRad(lat); const lon1 = toRad(lon);
  const lat2 = toRad(21.422487); const lon2 = toRad(39.826206);
  const deltaLon = lon2 - lon1;
  const y = Math.sin(deltaLon);
  const x = Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(deltaLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
};
