/**
 * The app icon, drawn once and rendered to every size the web and the iPhone
 * app ask for. Run `node scripts/app-icon.mjs` after changing it.
 *
 * The mark is the route: three stops joined by mint lines. A little 3D — the
 * stops are lit spheres, the lines rounded tubes, both casting a soft shadow on
 * a charcoal ground lit from above — but still the flat mark at a glance.
 * Geometry is the original 512px icon's, doubled.
 */

import sharp from "sharp";

const C = { x: 512, y: 466, r: 80 }; // the mint stop
const L = { x: 300, y: 736, r: 60 }; // white, bottom left
const R = { x: 724, y: 600, r: 60 }; // white, right
const LINE = 40;

const lines = `M${L.x} ${L.y} L${C.x} ${C.y} L${R.x} ${R.y}`;

export const svg = (size = 1024) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c2d2c"/>
      <stop offset="1" stop-color="#161716"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.18" r="0.75">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tube" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8ef0bf"/>
      <stop offset="0.55" stop-color="#5eda9b"/>
      <stop offset="1" stop-color="#36ad73"/>
    </linearGradient>
    <radialGradient id="mint" cx="0.36" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#c9f8df"/>
      <stop offset="0.35" stop-color="#6fe2a8"/>
      <stop offset="0.8" stop-color="#3fbf80"/>
      <stop offset="1" stop-color="#2b9563"/>
    </radialGradient>
    <radialGradient id="pearl" cx="0.36" cy="0.3" r="0.75">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#f3f5f7"/>
      <stop offset="0.85" stop-color="#c9ced6"/>
      <stop offset="1" stop-color="#a9b0ba"/>
    </radialGradient>
    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#ground)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>

  <!-- Shadows, cast down and a little right. -->
  <g filter="url(#shadow)" fill="#000" stroke="#000" opacity="0.55" transform="translate(10 26)">
    <path d="${lines}" fill="none" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${C.x}" cy="${C.y}" r="${C.r}" stroke="none"/>
    <circle cx="${L.x}" cy="${L.y}" r="${L.r}" stroke="none"/>
    <circle cx="${R.x}" cy="${R.y}" r="${R.r}" stroke="none"/>
  </g>

  <!-- The route as a tube: its body, then a highlight along the top. -->
  <path d="${lines}" fill="none" stroke="url(#tube)" stroke-width="${LINE}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${lines}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${LINE * 0.22}" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -${LINE * 0.22})"/>

  <!-- The stops as spheres, each with a soft specular highlight. -->
  <circle cx="${L.x}" cy="${L.y}" r="${L.r}" fill="url(#pearl)"/>
  <circle cx="${R.x}" cy="${R.y}" r="${R.r}" fill="url(#pearl)"/>
  <circle cx="${C.x}" cy="${C.y}" r="${C.r}" fill="url(#mint)"/>
  <ellipse cx="${C.x - C.r * 0.32}" cy="${C.y - C.r * 0.4}" rx="${C.r * 0.3}" ry="${C.r * 0.18}" fill="#fff" opacity="0.55" transform="rotate(-25 ${C.x - C.r * 0.32} ${C.y - C.r * 0.4})"/>
  <ellipse cx="${L.x - L.r * 0.32}" cy="${L.y - L.r * 0.4}" rx="${L.r * 0.3}" ry="${L.r * 0.18}" fill="#fff" opacity="0.8" transform="rotate(-25 ${L.x - L.r * 0.32} ${L.y - L.r * 0.4})"/>
  <ellipse cx="${R.x - R.r * 0.32}" cy="${R.y - R.r * 0.4}" rx="${R.r * 0.3}" ry="${R.r * 0.18}" fill="#fff" opacity="0.8" transform="rotate(-25 ${R.x - R.r * 0.32} ${R.y - R.r * 0.4})"/>
</svg>`;

const TARGETS = [
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-192.png", 192],
  ["public/icons/apple-touch-icon.png", 180],
  ["mobile/assets/icon.png", 512],
  ["mobile/assets/logo.png", 512],
];

const preview = process.argv.includes("--preview");
if (preview) {
  const out = process.argv[process.argv.indexOf("--preview") + 1];
  await sharp(Buffer.from(svg(1024))).png().toFile(out);
  console.log("preview", out);
} else {
  for (const [file, size] of TARGETS) {
    await sharp(Buffer.from(svg(1024))).resize(size, size).png().toFile(file);
    console.log(file, size);
  }
}
