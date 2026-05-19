export const formatClock = (d: Date) => d.toLocaleTimeString('id-ID', { hour12: false });
export const formatDateId = (d: Date) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const greeting = (d: Date) => {
  const h = d.getHours();
  if (h < 11) return 'Pagi';
  if (h < 15) return 'Siang';
  if (h < 18) return 'Sore';
  return 'Malam';
};
