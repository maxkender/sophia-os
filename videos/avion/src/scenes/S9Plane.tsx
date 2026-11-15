import React from 'react';
import {random} from 'remotion';
import {C, ease, lerp, pop, shake, useFrame} from '../lib';
import {Sparkle} from '../shapes';
import {Stage} from '../Stage';
import {Check} from '../volcan';
import {A, Airliner, Island, Passenger} from '../avion';

// « So if both engines stop, the plane doesn't drop, it glides, and in 2001, one glided 120 kilometers and everyone survived. »
export const STOP = 37;
export const DROP = 80;
export const GLIDE = 94;
export const LAND = 205;
export const EVERYONE = 213;
export const SURVIVED = 222;

const SEA = 1250;
const PS = 0.6;
const PX = 470;

/** Vitesse de défilement (px/image) : constante en vol, freinage à l'atterrissage */
const v = (f: number) => (f < LAND ? 9 : lerp(f, [LAND, LAND + 14], [9, 0], ease.out));
const dist = (f: number) => {
  let d = 0;
  for (let k = 0; k < Math.floor(f); k++) d += v(k);
  return d;
};
/** Altitude de l'avion (centre, en y écran) */
const alt = (f: number) => {
  const dip = f >= DROP - 2 ? lerp(f, [DROP - 2, DROP + 6, GLIDE], [0, 46, 30], ease.out) : 0;
  const plane = f >= GLIDE ? lerp(f, [GLIDE, LAND], [0, 391], ease.linear) : 0;
  return 620 + dip + plane + Math.sin(f * 0.07) * (f < STOP ? 8 : 3);
};
const ILE = dist(LAND) + PX + 40; // l'île est sous l'avion à l'atterrissage

export const S9Plane: React.FC = () => {
  const f = useFrame();
  const d = dist(f);
  const y = alt(f);
  const pitch = f < GLIDE ? (f >= DROP - 2 && f < GLIDE ? lerp(f, [DROP - 2, DROP + 4, GLIDE], [0, 6, 4]) : 0) : lerp(f, [LAND - 10, LAND + 6], [4, 0]);
  const glow = 1 - lerp(f, [STOP, STOP + 6], [0, 1]);
  const sh = shake(f, [
    [STOP, 10],
    [LAND, 12],
  ]);
  const bounce = f >= LAND ? Math.abs(Math.sin((f - LAND) * 0.5)) * lerp(f, [LAND, LAND + 16], [24, 0]) : 0;
  const ileX = ILE - d;
  // traînée pointillée : positions passées de l'avion (le décor défile vers la gauche)
  const trail: string[] = [];
  if (f > GLIDE) {
    for (let p = Math.max(GLIDE - 10, f - 120); p <= Math.min(f, LAND); p += 4) trail.push(`${PX - 260 * PS - (d - dist(p))},${alt(p)}`);
  }
  return (
    <Stage bg={A.night}>
      <defs>
        <linearGradient id="s9sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E1430" />
          <stop offset="1" stopColor="#2C3F73" />
        </linearGradient>
      </defs>
      <g transform={`translate(${sh.x} ${sh.y})`}>
        <rect width={1080} height={1920} fill="url(#s9sky)" />
        {Array.from({length: 40}, (_, i) => (
          <circle key={i} cx={((random(`sx${i}`) * 1400 - d * 0.05) % 1400 + 1400) % 1400 - 160} cy={random(`sy${i}`) * 1100} r={3 + random(`sr${i}`) * 4} fill={C.cream} opacity={0.5 + 0.5 * Math.abs(Math.sin(f * 0.1 + i))} />
        ))}
        <circle cx={860} cy={260} r={90} fill={C.parchment} filter="url(#pp)" />
        <circle cx={892} cy={240} r={86} fill="#1A2244" />
        {/* océan */}
        <rect x={0} y={SEA} width={1080} height={700} fill={A.nightSea} filter="url(#pp)" />
        {Array.from({length: 7}, (_, k) => (
          <line key={k} x1={0} x2={1080} y1={SEA + 40 + k * 90} y2={SEA + 40 + k * 90} stroke="#3B5490" strokeWidth={10} strokeDasharray="60 120" strokeDashoffset={d * (0.6 + k * 0.1) + k * 40} strokeLinecap="round" />
        ))}
        {/* l'île */}
        {ileX < 1600 && (
          <g transform={`translate(${ileX} ${SEA + 10}) scale(1.1)`} filter="url(#ppl)">
            <Island />
          </g>
        )}
        {trail.length > 1 && <polyline points={trail.join(' ')} fill="none" stroke={C.cream} strokeWidth={8} strokeDasharray="4 22" strokeLinecap="round" opacity={0.8} />}
        {/* fumée des réacteurs éteints */}
        {f >= STOP &&
          f < STOP + 50 &&
          [0, 1, 2, 3, 4].map((k) => {
            const t = f - STOP - k * 5;
            if (t < 0) return null;
            return (
              <circle
                key={k}
                cx={PX - 60 - t * 7}
                cy={y + 110 * PS - t * 2 + (random(`fu${k}`) - 0.5) * 20}
                r={18 + t * 1.4}
                fill={C.grey}
                opacity={Math.max(0, 0.7 - t * 0.02)}
              />
            );
          })}
        <g transform={`translate(${PX} ${y - bounce}) rotate(${pitch}) scale(${PS})`} filter="url(#ppl)">
          <Airliner glow={glow} gear={lerp(f, [LAND - 30, LAND - 16], [0, 1])} />
        </g>
        {/* tout le monde sort et saute de joie */}
        {f >= EVERYONE - 2 &&
          [C.red, C.m3, C.yellow, C.green, C.orange, C.m2].map((c, i) => {
            const p = pop(f, EVERYONE - 2 + i * 2);
            if (p <= 0) return null;
            const saut = Math.abs(Math.sin((f - EVERYONE + i * 3) * 0.32)) * 50;
            return (
              <g key={i} transform={`translate(${PX - 280 + i * 90} ${SEA - 100 - saut}) scale(${p * 0.75})`} filter="url(#pp)">
                <Passenger c={c} arms={1} hair={i % 2 ? '#2B1D14' : '#C98A3B'} />
              </g>
            );
          })}
      </g>
      {f >= SURVIVED - 2 && (
        <g transform={`translate(540 430) scale(${pop(f, SURVIVED - 2, {damping: 8}) * 1.2})`} filter="url(#ppl)">
          <Check r={110} />
        </g>
      )}
      {f >= SURVIVED &&
        [
          [380, 340],
          [720, 360],
          [420, 560],
          [700, 540],
        ].map(([x, yy], i) => <Sparkle key={i} x={x} y={yy} frame={f + i * 5} size={30} color={C.goldLight} />)}
    </Stage>
  );
};
