// Round-trip test for the polyline6 decoder in lib/providers/maps/stadia.ts.
// A precision mismatch is silent and catastrophic, so prove the algorithm.
import { readFileSync } from "fs";

const src = readFileSync("/Users/jurkokolesar/webapp/lib/providers/maps/stadia.ts", "utf8");
const fnSrc = src.slice(src.indexOf("function decodePolyline"), src.indexOf("function toPlace"));
const decodePolyline = new Function(`${fnSrc.replace(/:\s*(number|string|\[number, number\]\[\])/g, "").replace(/precision = 6/, "precision = 6")}; return decodePolyline;`)();

// Reference encoder (Google algorithm) so we control both ends.
function encode(coords, precision = 6) {
  const factor = 10 ** precision;
  let out = "", prevLat = 0, prevLng = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * factor), ln = Math.round(lng * factor);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la; prevLng = ln;
  }
  return out;
}

// Real Bratislava old-town stops, [lng, lat].
const original = [
  [17.1063, 48.1447], [17.1082, 48.1431], [17.1090, 48.1428],
  [17.1079, 48.1435], [17.1152, 48.1441], [17.1002, 48.1421],
];

const encoded = encode(original, 6);
const decoded = decodePolyline(encoded, 6);

let maxErr = 0;
decoded.forEach(([lng, lat], i) => {
  maxErr = Math.max(maxErr, Math.abs(lng - original[i][0]), Math.abs(lat - original[i][1]));
});

console.log("points in/out:      ", original.length, "->", decoded.length);
console.log("max coord error:    ", maxErr.toExponential(1), "deg", maxErr < 1e-6 ? "✓" : "❌");
console.log("first decoded:      ", decoded[0].map(n => n.toFixed(6)).join(", "));
console.log("expected:           ", original[0].map(n => n.toFixed(6)).join(", "));
console.log("negative-delta case:", JSON.stringify(decodePolyline(encode([[17.11,48.14],[17.10,48.13]],6),6)));
// The failure this guards against: decoding precision-6 data as precision 5.
const wrong = decodePolyline(encoded, 5);
console.log("if precision were 5:", wrong[0].map(n => n.toFixed(4)).join(", "), "<- off by 10x, in the ocean");
console.log(maxErr < 1e-6 && decoded.length === original.length ? "\nRESULT: PASS" : "\nRESULT: FAIL");
process.exit(maxErr < 1e-6 ? 0 : 1);
