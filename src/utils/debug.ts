export const debug = {
  enabled(category?: string): boolean {
    const all = process.env.NEXT_PUBLIC_DEBUG_ALL === '1';
    if (all) return true;
    const raw = process.env.NEXT_PUBLIC_DEBUG || '';
    if (!raw) return false;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!category) return parts.length > 0;
    return parts.includes(category);
  },
};

export default debug;

