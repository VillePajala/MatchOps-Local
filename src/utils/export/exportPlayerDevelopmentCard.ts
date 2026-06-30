/**
 * Player development report card export.
 *
 * Draws a shareable PNG for one player: a "now vs season-start" radar across
 * their assessed qualities, plus Strengths and Focus areas. Pure canvas drawing
 * (matches exportField - no html-to-image dependency). All display strings are
 * passed in, so this stays i18n-free.
 */

import logger from '@/utils/logger';
import { sanitizeFilename } from './exportFieldUtils';
import { drawFooter } from './exportFieldHeader';

export interface DevelopmentCardAxis {
  label: string;
  /** Current level (1..max). */
  current: number;
  /** Season-start baseline level (1..max). */
  baseline: number;
}

export interface DevelopmentCardItem {
  label: string;
  /** Trend glyph: '↑' | '→' | '↓' | '·' */
  arrow: string;
  /** CSS-ish hex colour for the glyph. */
  color: string;
}

export interface DevelopmentCardData {
  playerName: string;
  subtitle?: string; // e.g. team · date
  countLabel: string; // e.g. "12 rated"
  max: number; // canonical scale max (10)
  axes: DevelopmentCardAxis[];
  strengths: DevelopmentCardItem[];
  focus: DevelopmentCardItem[];
  labels: {
    title: string; // "Development report"
    now: string;
    baseline: string;
    strengths: string;
    focus: string;
  };
}

const W = 640;
const FOOTER_H = 44;
const URL_REVOKE_DELAY_MS = 5000;
const FONT = 'Rajdhani, system-ui, sans-serif';

const point = (cx: number, cy: number, r: number, angle: number): [number, number] => [
  cx + r * Math.cos(angle),
  cy + r * Math.sin(angle),
];

function drawRadar(
  ctx: CanvasRenderingContext2D,
  axes: DevelopmentCardAxis[],
  max: number,
  cx: number,
  cy: number,
  R: number,
): void {
  const n = axes.length;
  if (n < 3) return;
  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  // Grid rings
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    ctx.beginPath();
    axes.forEach((_, i) => {
      const [x, y] = point(cx, cy, R * f, angleFor(i));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });

  // Axis spokes + labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = `13px ${FONT}`;
  axes.forEach((ax, i) => {
    const a = angleFor(i);
    const [ex, ey] = point(cx, cy, R, a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const [lx, ly] = point(cx, cy, R + 16, a);
    ctx.textAlign = lx > cx + 2 ? 'left' : lx < cx - 2 ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ax.label, lx, ly);
  });

  const polygon = (pick: (ax: DevelopmentCardAxis) => number) => {
    ctx.beginPath();
    axes.forEach((ax, i) => {
      const level = Math.min(max, Math.max(0, pick(ax)));
      const [x, y] = point(cx, cy, R * (level / max), angleFor(i));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  // Baseline (dashed grey)
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#94a3b8';
  ctx.fillStyle = 'rgba(148,163,184,0.10)';
  ctx.lineWidth = 1.5;
  polygon((ax) => ax.baseline);
  ctx.fill();
  ctx.stroke();

  // Current (solid indigo)
  ctx.setLineDash([]);
  ctx.strokeStyle = '#818cf8';
  ctx.fillStyle = 'rgba(129,140,248,0.25)';
  ctx.lineWidth = 2;
  polygon((ax) => ax.current);
  ctx.fill();
  ctx.stroke();
}

function drawItemList(
  ctx: CanvasRenderingContext2D,
  heading: string,
  accent: string,
  items: DevelopmentCardItem[],
  x: number,
  y: number,
  colWidth: number,
): void {
  // accent dot + heading
  ctx.fillStyle = accent;
  ctx.fillRect(x, y - 9, 4, 12);
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(heading.toUpperCase(), x + 10, y - 3);

  ctx.font = `15px ${FONT}`;
  let ly = y + 22;
  if (items.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.fillText('-', x + 10, ly);
    return;
  }
  items.forEach((it) => {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(it.label, x + 10, ly, colWidth - 30);
    ctx.fillStyle = it.color;
    ctx.textAlign = 'right';
    ctx.fillText(it.arrow, x + colWidth - 6, ly);
    ctx.textAlign = 'left';
    ly += 24;
  });
}

/** Render the development card to a canvas (exported for testing). */
export function renderDevelopmentCard(data: DevelopmentCardData): HTMLCanvasElement {
  const radarBlock = data.axes.length >= 3 ? 380 : 0;
  const listRows = Math.max(data.strengths.length, data.focus.length, 1);
  const listsBlock = 40 + listRows * 24 + 16;
  const H = 150 + radarBlock + listsBlock + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1e293b');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#818cf8';
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(data.labels.title.toUpperCase(), W / 2, 40);
  ctx.fillStyle = '#f1f5f9';
  ctx.font = `bold 34px ${FONT}`;
  ctx.fillText(data.playerName, W / 2, 80);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `15px ${FONT}`;
  const sub = [data.subtitle, data.countLabel].filter(Boolean).join('  ·  ');
  ctx.fillText(sub, W / 2, 106);

  let y = 150;

  // Radar
  if (radarBlock > 0) {
    const cx = W / 2;
    const cy = y + radarBlock / 2 - 10;
    drawRadar(ctx, data.axes, data.max, cx, cy, 130);
    // Legend
    ctx.textBaseline = 'middle';
    ctx.font = `13px ${FONT}`;
    const legendY = y + radarBlock - 10;
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(W / 2 - 150, legendY); ctx.lineTo(W / 2 - 130, legendY); ctx.stroke();
    ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'left';
    ctx.fillText(data.labels.now, W / 2 - 124, legendY);
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(W / 2 + 20, legendY); ctx.lineTo(W / 2 + 40, legendY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(data.labels.baseline, W / 2 + 46, legendY);
    y += radarBlock;
  }

  // Strengths / Focus (two columns)
  const colW = (W - 28 * 3) / 2;
  drawItemList(ctx, data.labels.strengths, '#34d399', data.strengths, 28, y + 16, colW);
  drawItemList(ctx, data.labels.focus, '#fbbf24', data.focus, 28 * 2 + colW, y + 16, colW);

  // Footer
  drawFooter(ctx, W, H - FOOTER_H, FOOTER_H);

  return canvas;
}

/** True when the browser can render + download a canvas PNG. */
export function isCardExportSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const anchor = document.createElement('a');
  return typeof canvas.toBlob === 'function' && typeof URL.createObjectURL === 'function' && 'download' in anchor;
}

/** Render and download the development card as a PNG. */
export async function exportPlayerDevelopmentCard(data: DevelopmentCardData): Promise<void> {
  const canvas = renderDevelopmentCard(data);
  const blob: Blob | null = await new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch (e) {
      logger.warn('[exportPlayerDevelopmentCard] toBlob failed', e);
      resolve(null);
    }
  });
  if (!blob) throw new Error('Failed to render development card');

  const filename = `${sanitizeFilename(data.playerName || 'player')}_development_${new Date().toISOString().split('T')[0]}.png`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), URL_REVOKE_DELAY_MS);
}
