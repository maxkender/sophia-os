import React from 'react';
import {random} from 'remotion';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Cloud, Mountain} from '../shapes';
import {Stage} from '../Stage';
import {Car, smooth} from '../volcan';
import {A, Airfoil, Arm, Filet} from '../avion';

// « You've felt this before. Hand out the car window, tilt it up, and it lifts, your hand's a tiny wing. »
export const HAND = 55;
export const TILT = 98;
export const LIFTS = 134;
export const ZOOM = 147;
export const WING = 174;

const ROAD = 1200;
const K = 2.4; // échelle de la voiture
const rad = (d: number) => (d * Math.PI) / 180;

export const S6Main: React.FC = () => {
  const f = useFrame();
  const cx = lerp(f, [0, 26], [-700, 360]);
  const bounce = Math.abs(Math.sin(f * 0.45)) * 4;
  const len = lerp(f, [HAND, HAND + 14], [0, 230], ease.out);
  const arm = lerp(f, [LIFTS - 2, LIFTS + 8], [-14, -40], ease.back);
  const tiltUp = lerp(f, [TILT, TILT + 8], [0, -17], ease.out);
  const handAbs = tiltUp + Math.sin(f * 0.6) * 1.5;
  const sx = cx + 12 * K;
  const sy = ROAD + 30 - 136 * K - bounce;
  const ARMK = 1.25;
  const wx = sx + Math.cos(rad(arm)) * len * ARMK;
  const wy = sy + Math.sin(rad(arm)) * len * ARMK;
  const hx = wx + Math.cos(rad(handAbs)) * 85 * ARMK;
  const hy = wy + Math.sin(rad(handAbs)) * 85 * ARMK;
  const down = lerp(f, [TILT, TILT + 12], [0, 1], ease.inOut);
  const ribbons = lerp(f, [HAND + 10, HAND + 30], [0, 1], ease.inOut);
  const morph = lerp(f, [WING - 3, WING + 4], [0, 1], ease.inOut);
  const cam = camera(f, [
    {f: 0, x: 540, y: 960, z: 1},
    {f: ZOOM, x: 540, y: 960, z: 1},
    {f: WING - 2, x: hx - 60, y: hy + 30, z: 2.2},
    {f: 195, x: hx - 60, y: hy + 30, z: 2.35},
  ]);
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s6sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DBDEA" />
          <stop offset="1" stopColor="#DDF0FA" />
        </linearGradient>
      </defs>
      <g transform={cam}>
        <rect x={-1500} y={-1500} width={4000} height={4000} fill="url(#s6sky)" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${((i * 700 - f * 2 + 3000) % 2100) - 500} ${300 + i * 140}) scale(${1 - i * 0.15})`} filter="url(#pp)">
            <Cloud />
          </g>
        ))}
        <g transform={`translate(${-((f * 4) % 1400)} 0)`} filter="url(#ppl)">
          {[0, 1400, 2800].map((o) => (
            <Mountain key={o} pts={[[o - 400, ROAD], [o - 50, 820], [o + 300, 980], [o + 650, 760], [o + 1000, ROAD]]} fill={C.m2} snow={false} />
          ))}
        </g>
        <rect x={-1500} y={ROAD - 30} width={4000} height={1500} fill={C.grassDark} filter="url(#pp)" />
        <rect x={-1500} y={ROAD - 10} width={4000} height={170} fill={A.runway} />
        <line x1={-1500} y1={ROAD + 75} x2={2500} y2={ROAD + 75} stroke={C.cream} strokeWidth={12} strokeDasharray="90 70" strokeDashoffset={f * 38} />
        {/* poteaux qui défilent vite */}
        {Array.from({length: 4}, (_, i) => {
          const x = ((i * 520 - f * 38) % 2080 + 2080) % 2080 - 500;
          return <rect key={i} x={x} y={ROAD - 200} width={18} height={200} fill={C.woodDark} filter="url(#pp)" />;
        })}
        {/* les filets d'air autour de la main, qui filent vers l'arrière */}
        {len > 1 &&
          [-90, 85, 175].map((dy, i) => {
            const y = hy + dy;
            const pts: [number, number][] = [
              [hx + 700, y],
              [hx + 160, y],
              [hx, y + (dy < 0 ? -14 : 8)],
              [hx - 150, y + down * (dy < 0 ? 50 : 70)],
              [hx - 450, y + down * (dy < 0 ? 190 : 240)],
              [hx - 900, y + down * (dy < 0 ? 360 : 420)],
            ];
            return <Filet key={i} id={`s6f${i}`} d={smooth(pts)} frame={f + random(`s6o${i}`) * 20} speed={22} reveal={ribbons} w={11} dash={90} />;
          })}
        <g transform={`translate(${cx} ${ROAD + 30 - bounce}) scale(${K})`} filter="url(#ppl)">
          <Car spin={f * 16} />
        </g>
        {len > 1 && morph < 1 && (
          <g transform={`translate(${sx} ${sy}) rotate(${arm}) scale(${ARMK})`} opacity={1 - morph} filter="url(#ppl)">
            <Arm len={len} tilt={handAbs - arm} />
          </g>
        )}
        {morph > 0 && (
          <g transform={`translate(${hx} ${hy}) rotate(${handAbs}) scale(${-0.36 * pop(f, WING - 3, {damping: 10})} 0.36)`} filter="url(#ppl)">
            <Airfoil glow={morph} />
          </g>
        )}
      </g>
    </Stage>
  );
};
