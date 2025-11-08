export const formatTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Returns local date in YYYY-MM-DD without timezone shifts.
 * Avoids UTC-based toISOString() off-by-one issues around midnight.
 */
export const getLocalISODate = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1; // 1-based
  const d = date.getDate();
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
};
