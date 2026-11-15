import React from 'react';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Boom, Cloud} from '../shapes';
import {Stage} from '../Stage';
import {NoSign} from '../volcan';
import {Airliner, Balloon, Rotor} from '../avion';

// « No balloon, no rotor, nothing holding it up, and no, it's not the engines. »
export const BALLOON = 14;
export const BALLOON_POP = 32;
export const ROTOR = 41;
export const ROTOR_NO = 52;
export const NOTHING = 62;
export const ZOOM = 100;
export const ENGINES = 144;

const PX = 540;
const PY = 900;
const S = 0.8;
// réacteur avant (repère de l'avion : -20, 150)
const EX = PX - 20 * S;
const EY = PY + 150 * S;

export const S2Pistes: React.FC = () => {
  const f = useFrame();
  const bob = Math.sin(f * 0.08) * 8;
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 900, z: 1},
      {f: NOTHING, x: 540, y: 900, z: 1},
      {f: NOTHING + 18, x: 540, y: 1250, z: 0.62},
      {f: ZOOM, x: 540, y: 1250, z: 0.62},
      {f: 128, x: EX, y: EY, z: 2.3},
      {f: 172, x: EX, y: EY, z: 2.45},
    ],
    [
      [BALLOON_POP, 10],
      [ENGINES, 12],
    ],
  );
  const balloon = pop(f, BALLOON) * (f < BALLOON_POP ? 1 : 0);
  const rotor = pop(f, ROTOR) * lerp(f, [ROTOR_NO + 6, ROTOR_NO + 12], [1, 0], ease.in);
  const vide = lerp(f, [NOTHING + 4, NOTHING + 24], [0, 1]) * lerp(f, [ZOOM + 4, ZOOM + 16], [1, 0]);
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s2sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FB3E6" />
          <stop offset="1" stopColor="#D5ECF7" />
        </linearGradient>
      </defs>
      <rect width={1080} height={1920} fill="url(#s2sky)" />
      <g transform={cam}>
        {[
          [-300, 400, 1.3, 0.5],
          [700, 300, 1.0, 0.8],
          [-100, 1500, 1.6, 0.6],
          [800, 1900, 1.2, 0.9],
        ].map(([cx, cy, s, v], i) => (
          <g key={i} transform={`translate(${((cx - f * v * 3 + 2400) % 2400) - 700} ${cy}) scale(${s})`} filter="url(#pp)">
            <Cloud />
          </g>
        ))}
        {/* le vide sous l'avion : pointillés jusqu'au sol, très loin */}
        {vide > 0 && (
          <g opacity={vide}>
            <line x1={PX} y1={PY + 120} x2={PX} y2={PY + 120 + 1450 * vide} stroke={C.white} strokeWidth={10} strokeDasharray="30 30" strokeLinecap="round" />
            <rect x={-1200} y={2560} width={3500} height={800} fill={C.grassDark} filter="url(#pp)" />
            <ellipse cx={PX} cy={2560} rx={220} ry={30} fill={C.ink} opacity={0.15} />
          </g>
        )}
        {balloon > 0 && (
          <g transform={`translate(${PX} ${PY - 150 + bob}) scale(${balloon * 0.75})`} filter="url(#ppl)">
            <Balloon />
          </g>
        )}
        <Boom x={PX} y={PY - 520} size={150} frame={f} start={BALLOON_POP} seed="ballon" life={14} />
        {rotor > 0 && (
          <g transform={`translate(${PX} ${PY - 210 + bob}) scale(${rotor})`} filter="url(#ppl)">
            <Rotor angle={f * 40} />
          </g>
        )}
        {f >= ROTOR_NO && rotor > 0 && (
          <g transform={`translate(${PX} ${PY - 220}) scale(${pop(f, ROTOR_NO) * 0.9 * rotor})`} filter="url(#pp)">
            <NoSign r={130} />
          </g>
        )}
        <g transform={`translate(${PX} ${PY + bob}) scale(${S})`} filter="url(#ppl)">
          <Airliner />
        </g>
        {f >= ENGINES - 2 && (
          <g transform={`translate(${EX} ${EY + bob}) scale(${pop(f, ENGINES - 2, {damping: 8}) * 0.42})`} filter="url(#pp)">
            <NoSign r={120} />
          </g>
        )}
      </g>
    </Stage>
  );
};
