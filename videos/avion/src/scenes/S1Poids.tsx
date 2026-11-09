import React from 'react';
import {random} from 'remotion';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Cloud} from '../shapes';
import {Stage} from '../Stage';
import {Car} from '../volcan';
import {Airliner, Weight} from '../avion';

// « The world's biggest airliner weighs over 500 tonnes, like 300 cars floating in the sky. »
export const ARRIVE = 4;
export const WEIGHT = 64; // le poids tombe…
export const TONNES = 71; // …et écrase l'avion sur « tonnes, »
export const LIKE = 81;
export const CARS = 87; // les voitures apparaissent sur « 300 »
export const FLOAT = 109; // « floating » : tout flotte

const VOITURES = Array.from({length: 14}, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + random(`va${i}`) * 0.3;
  const r = 470 + random(`vr${i}`) * 160;
  return {x: 540 + Math.cos(a) * r, y: 820 + Math.sin(a) * r * 0.75, c: [C.red, C.m3, C.yellow, C.green][i % 4], s: 0.42 + random(`vs${i}`) * 0.12, rot: (random(`vt${i}`) - 0.5) * 30};
});

export const S1Poids: React.FC = () => {
  const f = useFrame();
  const x = lerp(f, [0, 32], [-120, 540]); // visible dès la 1re image (aperçu TikTok)
  const sag = lerp(f, [TONNES, TONNES + 4, TONNES + 16], [0, 70, 30], ease.out) * (f < LIKE + 6 ? 1 : lerp(f, [LIKE + 6, LIKE + 18], [1, 0]));
  const y = 820 + Math.sin(f * 0.08) * 10 + sag + (f > FLOAT ? -lerp(f, [FLOAT, 149], [0, 60], ease.inOut) : 0);
  const weightY = lerp(f, [WEIGHT, TONNES], [-500, y - 165], ease.in);
  const weightOut = 1 - lerp(f, [LIKE, LIKE + 6], [0, 1]);
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 960, z: 1.05},
      {f: 60, x: 540, y: 900, z: 1.0},
      {f: 90, x: 540, y: 880, z: 0.86},
      {f: 149, x: 540, y: 860, z: 0.8},
    ],
    [[TONNES, 22]],
  );
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s1sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FB3E6" />
          <stop offset="1" stopColor="#D5ECF7" />
        </linearGradient>
      </defs>
      <rect width={1080} height={1920} fill="url(#s1sky)" />
      <g transform={cam}>
        {[
          [100, 260, 1.2, 0.4],
          [820, 420, 0.9, 0.7],
          [300, 1350, 1.4, 0.5],
          [900, 1500, 1.1, 0.9],
          [-200, 700, 1.0, 0.6],
        ].map(([cx, cy, s, v], i) => (
          <g key={i} transform={`translate(${((cx - f * v * 3 + 1600) % 1600) - 300} ${cy}) scale(${s})`} filter="url(#pp)">
            <Cloud />
          </g>
        ))}
        {f >= CARS - 2 &&
          VOITURES.map((v, i) => {
            const p = pop(f, CARS + i * 1.4);
            const flo = f > FLOAT ? lerp(f, [FLOAT, FLOAT + 30], [0, 1], ease.inOut) : 0;
            return (
              <g
                key={i}
                transform={`translate(${v.x} ${v.y - flo * (40 + random(`vf${i}`) * 50) + Math.sin(f * 0.1 + i) * 12 * flo}) rotate(${v.rot + Math.sin(f * 0.07 + i) * 6 * flo}) scale(${p * v.s})`}
                filter="url(#pp)"
              >
                <Car spin={f * 4} />
              </g>
            );
          })}
        <g transform={`translate(${x} ${y}) rotate(${sag * 0.04})`} filter="url(#ppl)">
          <Airliner />
        </g>
        {f >= WEIGHT && weightOut > 0 && (
          <g transform={`translate(${540} ${weightY}) scale(${0.9 * weightOut})`} filter="url(#ppl)">
            <Weight />
          </g>
        )}
      </g>
    </Stage>
  );
};
