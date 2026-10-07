/**
 * The splash on every full load of the site — the iPhone app's splash
 * (mobile/src/components/Splash.tsx), drawn in SVG.
 *
 * Server-rendered and animated by SVG and CSS alone, so it plays the moment
 * the page arrives, before any JavaScript, and needs none to go away. A white
 * dot walks the mark's route stop to stop, each stop ripples in mint, then the
 * mark lifts and the splash fades. It never takes a tap: the page underneath is
 * usable throughout. Moving between pages inside the site does not replay it,
 * because the layout it lives in is not redrawn.
 */

/** The mark's stops on the 512 canvas, measured from the app icon. */
const A = { x: 150, y: 368 };
const B = { x: 256, y: 232 };
const C = { x: 362, y: 300 };
const ROUTE = `M${A.x} ${A.y} L${B.x} ${B.y} L${C.x} ${C.y}`;

const LEG_1 = Math.hypot(B.x - A.x, B.y - A.y);
const LEG_2 = Math.hypot(C.x - B.x, C.y - B.y);
const WALK_S = 1;
const START_S = 0.15;
/** When the dot reaches the mint stop, so it walks at one speed. */
const AT_B = START_S + (WALK_S * LEG_1) / (LEG_1 + LEG_2);
const AT_C = START_S + WALK_S;

function Ripple({ x, y, at }: { x: number; y: number; at: number }) {
  return (
    <circle cx={x} cy={y} r="22" fill="none" stroke="var(--mint)" strokeWidth="5" opacity="0">
      <animate attributeName="r" from="22" to="80" begin={`${at}s`} dur="0.7s" fill="freeze" />
      <animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.15;1" begin={`${at}s`} dur="0.7s" fill="freeze" />
    </circle>
  );
}

export default function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <svg className="splash__mark" viewBox="0 0 512 512" width="200" height="200">
        <path d={ROUTE} fill="none" stroke="var(--mint)" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={A.x} cy={A.y} r="30" fill="var(--on-dark)" />
        <circle cx={C.x} cy={C.y} r="30" fill="var(--on-dark)" />
        <circle cx={B.x} cy={B.y} r="40" fill="var(--mint)" />
        <g className="splash__walk">
          <Ripple x={A.x} y={A.y} at={START_S} />
          <Ripple x={B.x} y={B.y} at={AT_B} />
          <Ripple x={C.x} y={C.y} at={AT_C} />
          {/* White, like the stops: a mint dot would vanish on the mint line it walks. */}
          <circle r="17" fill="var(--on-dark)" opacity="0">
            <animateMotion path={ROUTE} begin={`${START_S}s`} dur={`${WALK_S}s`} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.55 1" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.92;1" begin={`${START_S}s`} dur={`${WALK_S}s`} fill="freeze" />
          </circle>
        </g>
      </svg>
    </div>
  );
}
