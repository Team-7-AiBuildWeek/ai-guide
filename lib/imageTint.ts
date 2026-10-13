"use client";

/**
 * The colour of a photograph, for the glow around it — the way Spotify and
 * Apple Music tint the space around an album cover. The average of a tiny
 * copy of the image, nudged to be vivid enough to read as colour and never
 * so light that a glow disappears. Same-origin images only (next/image serves
 * them from /_next/image, so they are); anything else simply gets no tint.
 */

export function tintOf(img: HTMLImageElement): string | null {
  try {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    [r, g, b] = [r / n, g / n, b / n];
    // HSL: keep the hue, lift saturation, cap lightness so the glow shows.
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    if (d) {
      const [rr, gg, bb] = [r / 255, g / 255, b / 255];
      h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
      h = Math.round(h * 60 + 360) % 360;
    }
    const s = d ? Math.min(0.75, Math.max(0.35, d / (1 - Math.abs(2 * l - 1)))) : 0.15;
    const light = Math.min(0.5, Math.max(0.3, l));
    return `hsl(${h} ${Math.round(s * 100)}% ${Math.round(light * 100)}%)`;
  } catch {
    return null; // a cross-origin image taints the canvas: no tint, no harm
  }
}
