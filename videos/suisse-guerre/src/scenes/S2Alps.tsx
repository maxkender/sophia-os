import React from 'react';

import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Cloud, Debris, FlagPole, Mountain, Rays, Tank} from '../shapes';
import {Stage} from '../Stage';

type P = readonly (readonly [number, number])[];
const close = (pts: P): P => [...pts, [1080, 2200], [0, 2200]];

const L1 = close([[0, 1080], [150, 740], [300, 930], [480, 600], [650, 870], [820, 690], [1080, 960]]);
const L2 = close([[0, 1200], [200, 880], [360, 1070], [560, 740], [760, 1040], [940, 840], [1080, 990]]);
const L3 = close([[0, 1360], [240, 1040], [420, 1250], [690, 960], [880, 1180], [1080, 1070]]);
// la pente de gauche (0,1560)→(380,1240) est celle que les chars essaient de grimper
const L4 = close([[0, 1560], [380, 1240], [520, 1330], [700, 1000], [860, 1250], [1080, 1150]]);
const LAYERS = [
  {pts: L1, fill: C.m1, start: 2},
  {pts: L2, fill: C.m2, start: 6},
  {pts: L3, fill: C.m3, start: 10},
  {pts: L4, fill: C.m4, start: 14},
];

const SLOPE = -320 / 380;
const ANG = (Math.atan(SLOPE) * 180) / Math.PI;
const onSlope = (x: number) => 1560 + SLOPE * x;

const TANKS = [
  {start: 34, stall: 250},
  {start: 46, stall: 200},
  {start: 58, stall: 290},
];

const TankRun: React.FC<{f: number; start: number; stall: number; k: number}> = ({f, start, stall, k}) => {
  const t = f - start;
  if (t < 0 || t > 64) return null;
  let x: number;
  let y: number;
  let r = ANG;
  if (t < 24) {
    x = lerp(t, [0, 24], [-260, stall], ease.out);
    y = onSlope(x);
  } else if (t < 32) {
    // ça cale : petit recul, le char se cabre
    x = stall - Math.sin(((t - 24) / 8) * Math.PI) * 18;
    y = onSlope(x);
    r = ANG - Math.sin(((t - 24) / 8) * Math.PI) * 12;
  } else {
    // il bascule en arrière et dégringole
    const q = lerp(t, [32, 62], [0, 1], ease.in);
    x = stall + (-520 - stall) * q;
    y = onSlope(stall) + (1950 - onSlope(stall)) * q - Math.sin(q * Math.PI) * 140;
    r = ANG - 230 * q;
  }
  return (
    <g>
      <g transform={`translate(${x} ${y}) rotate(${r}) scale(${0.78 + k * 0.05})`} filter="url(#pp)">
        <Tank spin={t * 24} />
      </g>
      <Debris
        x={stall - 60}
        y={onSlope(stall - 60)}
        frame={f}
        start={start + 25}
        n={10}
        seed={`dust${k}`}
        colors={[C.snow, '#d9d2c5', C.m1]}
        speed={14}
        gravity={0.6}
        size={22}
        spread={1.6}
        dir={-Math.PI * 0.7}
      />
    </g>
  );
};

// 0:03–0:07 — les Alpes jaillissent, les chars n'arrivent pas à monter
export const S2Alps: React.FC = () => {
  const f = useFrame();
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 1020, z: 1.0},
      {f: 30, x: 540, y: 1060, z: 1.04},
      {f: 128, x: 470, y: 1180, z: 1.16, r: -2},
    ],
    [
      ...LAYERS.map((l): [number, number] => [l.start + 7, 16]),
      ...TANKS.map((t): [number, number] => [t.start + 25, 10]),
      [29, 8],
    ],
  );
  const sun = pop(f, 0, {damping: 10});
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s2sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.skyLight} />
          <stop offset="1" stopColor={C.sky} />
        </linearGradient>
      </defs>
      <g transform={cam}>
        <rect x={-600} y={-600} width={2280} height={3200} fill="url(#s2sky)" />
        <g transform={`translate(860 380) scale(${sun})`}>
          <Rays cx={0} cy={0} n={12} color={C.yellow} rot={f * 1.2} r={170} opacity={0.6} />
          <circle r={92} fill={C.yellow} filter="url(#pp)" />
        </g>
        {[
          [-120, 300, 0.9, 2.2],
          [500, 470, 0.7, 1.4],
          [240, 180, 0.6, 3],
        ].map(([x0, y0, sc, sp], i) => (
          <g key={i} transform={`translate(${x0 + f * sp} ${y0}) scale(${sc})`} filter="url(#pp)">
            <Cloud />
          </g>
        ))}
        {LAYERS.map((l, i) => {
          const p = pop(f, l.start, {damping: 11, stiffness: 200});
          return (
            <g key={i} transform={`translate(0 ${(1 - p) * 1200})`} filter="url(#ppl)">
              <Mountain pts={l.pts} fill={l.fill} />
            </g>
          );
        })}
        <FlagPole x={700} y={1006} h={150} s={84} frame={f} start={26} />
        <g filter="url(#pp)" transform={`translate(0 ${(1 - pop(f, 18, {damping: 12})) * 600})`}>
          <path d="M 0 1720 Q 270 1660 540 1700 T 1080 1690 L 1080 2200 L 0 2200 Z" fill={C.grass} />
          <path d="M 0 1800 Q 300 1760 600 1790 T 1080 1780 L 1080 2200 L 0 2200 Z" fill={C.grassDark} />
        </g>
        {TANKS.map((t, k) => (
          <TankRun key={k} f={f} start={t.start} stall={t.stall} k={k} />
        ))}
      </g>
    </Stage>
  );
};
