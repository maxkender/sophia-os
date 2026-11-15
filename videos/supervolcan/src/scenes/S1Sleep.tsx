import React from 'react';
import {random} from 'remotion';
import {C, camera, lerp, pop, useFrame} from '../lib';
import {Mountain, Rays} from '../shapes';
import {Stage} from '../Stage';
import {Stopwatch, Surface, V, blob, smooth} from '../volcan';

const GROUND = 840;
const CH: [number, number] = [540, 1440];
export const WAKE = 90;
export const GEYSER = 56;
export const TICKS = [140, 150, 155];

const strate = (y: number, seed: string, amp = 18) =>
  smooth([
    [-500, y + 1400],
    [-500, y],
    ...Array.from({length: 9}, (_, i): [number, number] => [-300 + i * 220, y + (random(`${seed}${i}`) - 0.5) * amp * 2]),
    [1600, y],
    [1600, y + 1400],
  ]);

const STRATES = [
  {y: GROUND + 14, c: V.e1},
  {y: 980, c: V.e2},
  {y: 1090, c: V.e3},
  {y: 1210, c: V.e4},
  {y: 1700, c: V.e5},
];

const VEINS = [
  'M 470 1300 Q 430 1150 400 1020 T 360 870',
  'M 610 1300 Q 660 1140 690 1000 T 720 870',
  'M 540 1270 Q 560 1150 520 1060',
];

// 0:00–0:06 — un supervolcan dort sous Yellowstone… et s'il se réveillait ?
export const S1Sleep: React.FC = () => {
  const f = useFrame();
  const woke = pop(f, WAKE, {damping: 7, stiffness: 160});
  const impacts: [number, number][] = [
    [WAKE + 1, 36],
    [WAKE + 8, 14],
    [GEYSER + 2, 8],
  ];
  const cam = camera(
    f,
    [
      {f: 0, x: 520, y: 760, z: 1.4},
      {f: 12, x: 520, y: 780, z: 1.36},
      {f: 32, x: 540, y: 1380, z: 1.05},
      {f: 46, x: 540, y: 1400, z: 1.1},
      {f: 58, x: 470, y: 780, z: 1.3},
      {f: 76, x: 500, y: 800, z: 1.26},
      {f: 92, x: 540, y: 1120, z: 0.8},
      {f: 175, x: 540, y: 1080, z: 0.86},
    ],
    impacts,
  );
  const breathe = f < WAKE ? 1 + Math.sin(f * 0.16) * 0.035 : 1 + Math.sin(f * 0.5) * 0.04 + woke * 0.1;
  const glow = f < WAKE ? 0.25 + Math.sin(f * 0.16) * 0.1 : 0.7 + Math.sin(f * 0.6) * 0.15;
  const jet = Math.max(lerp(f, [GEYSER, GEYSER + 6, GEYSER + 22, GEYSER + 32], [0, 1, 1, 0]), lerp(f, [WAKE + 2, WAKE + 8, WAKE + 40, WAKE + 50], [0, 1.2, 1.2, 0]));
  const lid = f < WAKE ? 0 : woke;
  const sw = pop(f, 134, {damping: 9, stiffness: 200});
  const swAngle = TICKS.reduce((a, t) => a + 30 * pop(f, t, {damping: 8, stiffness: 300}), 0);
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s1sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9FCFEA" />
          <stop offset="1" stopColor={C.skyLight} />
        </linearGradient>
        <clipPath id="s1sous">
          <rect x={-800} y={GROUND + 16} width={2700} height={2000} />
        </clipPath>
        <radialGradient id="s1glow">
          <stop offset="0" stopColor={V.lavaGlow} stopOpacity={0.9} />
          <stop offset="0.5" stopColor={V.lavaHot} stopOpacity={0.5} />
          <stop offset="1" stopColor={V.lava} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={cam}>
        <rect x={-800} y={-800} width={2700} height={1700} fill="url(#s1sky)" />
        <circle cx={880} cy={330} r={80} fill={C.yellow} filter="url(#pp)" />
        <g filter="url(#ppl)" transform={`translate(0 ${GROUND - 840})`}>
          <Mountain pts={[[-300, 840], [80, 560], [300, 720], [520, 520], [760, 700], [980, 580], [1380, 840]]} fill={C.m1} />
          <Mountain pts={[[-300, 840], [200, 650], [420, 780], [700, 630], [1380, 840]]} fill={C.m2} />
        </g>
        {/* le sous-sol en strates */}
        <g filter="url(#ppl)">
          {STRATES.map((s, i) => (
            <path key={i} d={strate(s.y, `st${i}`)} fill={s.c} />
          ))}
        </g>
        {/* fissures au réveil */}
        {f >= WAKE && (
          <g stroke={V.e5} strokeWidth={8} fill="none" strokeLinejoin="round" opacity={woke}>
            <polyline points="200,1210 250,1150 230,1090 290,1020" />
            <polyline points="860,1220 820,1140 860,1060 830,990" />
          </g>
        )}
        {/* filons de magma vers la surface */}
        <g fill="none" strokeLinecap="round">
          {VEINS.map((d, i) => (
            <path key={i} d={d} stroke={f >= WAKE ? V.lavaHot : V.lava} strokeWidth={i === 2 ? 14 : 20} opacity={0.55 + glow * 0.4} />
          ))}
        </g>
        {/* la chambre magmatique */}
        <circle cx={CH[0]} cy={CH[1]} r={420 + woke * 160} fill="url(#s1glow)" opacity={glow} />
        {f >= WAKE && (
          <g clipPath="url(#s1sous)">
            <Rays cx={CH[0]} cy={CH[1]} n={14} color={V.lavaGlow} rot={f * 2} r={760} opacity={0.35 * woke} />
          </g>
        )}
        <g transform={`translate(${CH[0]} ${CH[1]}) scale(${breathe})`}>
          <g filter="url(#ppl)">
            <path d={blob(370, 190, 'ch', 16, 0.08)} fill={V.magmaDark} />
            <path d={blob(330, 160, 'ch2', 14, 0.09, f * 0.08)} fill={V.lava} />
            <path d={blob(240, 110, 'ch3', 12, 0.1, f * 0.1)} fill={V.lavaHot} transform="translate(-20 -16)" />
            <path d={blob(120, 50, 'ch4', 10, 0.12, f * 0.12)} fill={V.lavaGlow} transform="translate(-60 -50)" opacity={0.8} />
          </g>
          {/* l'œil : fermé tant qu'il dort, grand ouvert au réveil */}
          <g transform="translate(40 10)">
            {lid < 0.05 ? (
              <g stroke={V.magmaDark} strokeWidth={12} fill="none" strokeLinecap="round">
                <path d="M -80 0 Q 0 46 80 0" />
                {[-50, 0, 50].map((x) => (
                  <line key={x} x1={x} y1={x === 0 ? 24 : 18} x2={x * 1.2} y2={x === 0 ? 50 : 42} />
                ))}
              </g>
            ) : (
              <g transform={`scale(1 ${Math.max(0.05, lid)})`} filter="url(#pp)">
                <ellipse rx={98} ry={74} fill={C.white} />
                <circle cx={10} cy={6} r={44} fill={C.ink} />
                <circle cx={10} cy={6} r={18} fill={V.lavaHot} />
                <circle cx={26} cy={-12} r={12} fill={C.white} />
              </g>
            )}
          </g>
        </g>
        {/* bulles de sommeil */}
        {f > 30 &&
          f < WAKE &&
          [0, 1, 2].map((k) => {
            const t = ((f - 30 + k * 12) % 36) / 36;
            return <circle key={k} cx={CH[0] + 200 + t * 60 + k * 10} cy={CH[1] - 150 - t * 220} r={10 + t * 26} fill={V.lavaGlow} opacity={(1 - t) * 0.9} filter="url(#pp)" />;
          })}
        <g transform={`translate(0 ${GROUND})`}>
          <Surface frame={f} jet={jet} bisonX={560 + f * 0.8} />
        </g>
      </g>
      {/* chronomètre : minute par minute */}
      {sw > 0 && (
        <g transform={`translate(190 300) scale(${sw}) rotate(${-8 + 8 * sw})`}>
          <Stopwatch angle={swAngle} r={100} />
        </g>
      )}
    </Stage>
  );
};
