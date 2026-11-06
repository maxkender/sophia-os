import React from 'react';
import {interpolate, random} from 'remotion';
import {noise2D} from '@remotion/noise';
import {C, cl, ease, lerp, pop, shake, useFrame} from '../lib';
import {Mountain} from '../shapes';
import {Stage} from '../Stage';
import {Billow, Bolt, Plane, Stopwatch, Volcano} from '../volcan';

const GROUND = 1700;
const KM = 140;
const VENT = 1640;
export const COLUMN = 38;
export const SHOOT = 62;
export const TOP = 86;
export const BOLTS = [100, 114, 126];

const topAt = (f: number) =>
  interpolate(f, [0, COLUMN, 58, SHOOT, TOP], [VENT, VENT, 1150, 1120, GROUND - 30 * KM], {...cl, easing: ease.out});

const column = (top: number, f: number) => {
  const pts: [number, number, number][] = [];
  const n = Math.min(64, 4 + Math.round((VENT - top) / 80));
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const y = VENT + (top - VENT) * u;
    const sway = noise2D('col', u * 3, f * 0.02) * (20 + u * 80);
    pts.push([540 + sway + (random(`cx${i}`) - 0.5) * 50, y, 110 + u * 120 + random(`cr${i}`) * 40]);
  }
  return pts;
};

const cap = (w: number, top: number) => {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    const x = 540 + (u - 0.5) * w;
    const edge = Math.abs(u - 0.5) * 2;
    pts.push([x, top - 40 + edge * 120 + (random(`ky${i}`) - 0.5) * 80, 150 + (1 - edge) * 110 + random(`kr${i}`) * 50]);
  }
  return pts;
};

// 0:13–0:17 — en une heure, une colonne de cendres monte à plus de 30 km
export const S3Column: React.FC = () => {
  const f = useFrame();
  const top = topAt(f);
  const z = lerp(f, [0, 60, TOP, 96, 132], [1.0, 1.0, 0.74, 0.74, 0.42], ease.inOut);
  const camY = f < 96 ? Math.min(1100, top + 650) : lerp(f, [96, 132], [GROUND - 30 * KM + 650, -480], ease.inOut);
  const sh = shake(f, [
    [COLUMN + 1, 14],
    [SHOOT + 1, 30],
    [TOP, 12],
    ...BOLTS.map((b): [number, number] => [b, 8]),
  ]);
  const capW = lerp(f, [TOP - 4, 148], [260, 2100], ease.out);
  const sw = pop(f, 4, {damping: 9, stiffness: 200}) * lerp(f, [38, 46], [1, 0], ease.in);
  const planeX = -260 + (f - 24) * 19;
  const ruler = GROUND - 30 * KM;
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s3sky" gradientUnits="userSpaceOnUse" x1="0" y1={GROUND} x2="0" y2={-3600}>
          <stop offset="0" stopColor="#CBE8F5" />
          <stop offset="0.3" stopColor="#8EC3E6" />
          <stop offset="0.62" stopColor="#3F6FB0" />
          <stop offset="0.85" stopColor="#1C2C5E" />
          <stop offset="1" stopColor="#0F1838" />
        </linearGradient>
      </defs>
      <g transform={`translate(${540 + sh.x} ${960 + sh.y}) rotate(${sh.r}) scale(${z}) translate(-540 ${-camY})`}>
        <rect x={-2400} y={-3800} width={5900} height={6000} fill="url(#s3sky)" />
        {/* étoiles tout en haut */}
        {Array.from({length: 30}, (_, i) => (
          <circle key={i} cx={-1000 + random(`sx${i}`) * 3100} cy={-3500 + random(`sy${i}`) * 900} r={4 + random(`sr${i}`) * 5} fill={C.cream} opacity={0.7} />
        ))}
        {/* la règle d'altitude */}
        <g filter="url(#pp)">
          <rect x={1000} y={ruler - 80} width={46} height={GROUND - ruler + 80} rx={10} fill={C.cream} />
          {Array.from({length: 31}, (_, k) => (
            <rect key={k} x={1000} y={GROUND - k * KM - 4} width={k % 5 === 0 ? 46 : 22} height={8} fill={C.ink} />
          ))}
        </g>
        {f >= TOP - 2 && (
          <g transform={`translate(1000 ${ruler}) scale(${pop(f, TOP - 2, {damping: 8})})`} filter="url(#pp)">
            <polygon points="0,0 -90,-50 -90,50" fill={C.yellow} />
            <rect x={-6} y={-6} width={60} height={12} fill={C.yellow} />
          </g>
        )}
        {/* l'avion à 10 km */}
        {planeX > -400 && planeX < 1500 && (
          <g transform={`translate(${planeX} ${GROUND - 10 * KM + Math.sin(f * 0.2) * 6}) scale(0.6) rotate(${f > 64 && f < 84 ? Math.sin(f * 0.8) * 4 : 0})`} filter="url(#pp)">
            <Plane />
          </g>
        )}
        {/* la colonne */}
        {f >= COLUMN - 2 && (
          <g filter="url(#ppl)">
            <Billow frame={f} seed="col" pts={column(top, f)} dark />
            {f >= TOP - 6 && <Billow frame={f} seed="cap" pts={cap(capW, GROUND - 30 * KM)} />}
            {f < TOP && <Billow frame={f} seed="head" pts={[[540, top, 210]]} />}
          </g>
        )}
        {BOLTS.map((b, i) =>
          f >= b && f < b + 4 ? (
            <g key={i} transform={`translate(${470 + i * 60} ${700 - i * 260})`}>
              <Bolt seed={`b${i}`} len={360} />
            </g>
          ) : null,
        )}
        {/* le sol */}
        <g filter="url(#ppl)">
          <Mountain pts={[[-900, GROUND + 20], [-500, 1380], [-200, 1560], [140, 1420], [360, GROUND + 20]]} fill={C.m2} />
          <Mountain pts={[[720, GROUND + 20], [960, 1440], [1220, 1580], [1500, 1380], [1900, GROUND + 20]]} fill={C.m2} />
        </g>
        <g transform={`translate(540 ${GROUND + 20})`} filter="url(#ppl)">
          <Volcano w={900} h={80} glow={f >= COLUMN ? 1 : 0.4} />
        </g>
        <rect x={-2400} y={GROUND + 10} width={5900} height={2000} fill={C.grassDark} filter="url(#pp)" />
      </g>
      {sw > 0.01 && (
        <g transform={`translate(850 380) scale(${sw})`}>
          <Stopwatch angle={lerp(f, [9, 33], [0, 360], ease.inOut)} r={100} />
        </g>
      )}
    </Stage>
  );
};
