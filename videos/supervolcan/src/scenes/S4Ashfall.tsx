import React from 'react';
import {random} from 'remotion';
import geo from '../geo-na.json';
import {C, camera, ease, lerp, pop, shake, useFrame} from '../lib';
import {Debris, Ring} from '../shapes';
import {Stage} from '../Stage';
import {Billow, Calendar, Fall, House, NoSign, Plane, V, Volcano} from '../volcan';

const G = geo as unknown as {pays: {nom: string; d: string}[]; yellowstone: [number, number]; villes: Record<string, [number, number]>};
const [YX, YY] = G.yellowstone;
const LAND = ['#E8D9B5', '#D9CBA6', '#CFE0C3', '#E6CFC0', '#D8D2E3', '#F0E2C2', '#C9D8C5'];

export const TEARS = [17, 22, 27, 32];
export const ASH = 37;
export const CRUSH = [119, 130, 138];
export const GROUNDED = [193, 210];
const CUT1 = 104;
const CUT2 = 178;

const PUFFS = Array.from({length: 80}, (_, i) => {
  const a = -0.5 + random(`a${i}`) * 1.4;
  const d = 20 + Math.pow(random(`d${i}`), 0.75) * 640;
  return {
    x: YX + Math.cos(a) * d,
    y: YY + Math.sin(a) * d * 0.7,
    r: 74 - d * 0.05 + random(`r${i}`) * 34,
    s: ASH + (d / 660) * 46,
    c: i % 3 === 0 ? V.ash1 : i % 3 === 1 ? V.ash2 : V.ash3,
  };
});

const MapShot: React.FC<{f: number}> = ({f}) => {
  const cam = camera(
    f,
    [
      {f: 0, x: YX, y: YY, z: 1.8},
      {f: 36, x: YX + 20, y: YY + 10, z: 1.7},
      {f: 92, x: 590, y: 1010, z: 0.98},
    ],
    [[ASH + 2, 8]],
  );
  const ring = pop(f, 6, {damping: 8});
  return (
    <g transform={cam}>
      <rect x={-1500} y={-1500} width={4000} height={5000} fill={C.sea} />
      <g filter="url(#pp)">
        {G.pays.map((p, i) => (
          <path key={i} d={p.d} fill={p.nom === 'United States of America' ? '#F0E2C2' : LAND[i % LAND.length]} stroke="#F7EEDB" strokeWidth={2} />
        ))}
      </g>
      {Object.values(G.villes).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={11} fill={C.ink} stroke={C.cream} strokeWidth={4} />
      ))}
      <g opacity={0.9} filter="url(#pp)">
        {PUFFS.map((p, i) => {
          const q = pop(f, p.s, {damping: 11, stiffness: 160});
          return q > 0 ? <circle key={i} cx={p.x + (f - p.s) * 0.6} cy={p.y} r={p.r * q} fill={p.c} /> : null;
        })}
      </g>
      <Ring x={YX} y={YY} frame={f} start={8} r={90} color={C.red} dur={16} />
      <g transform={`translate(${YX} ${YY + 12}) scale(${ring})`} filter="url(#pp)">
        <Volcano w={70} h={30} glow={1} />
        <circle cx={0} cy={-36} r={10} fill={V.lavaHot} />
      </g>
      <Fall frame={f} start={ASH + 8} n={60} seed="mapash" area={[-200, 500, 1500, 1000]} color={V.ash2} size={5} speed={4} />
    </g>
  );
};

const HouseShot: React.FC<{f: number}> = ({f}) => {
  const cam = camera(
    f,
    [
      {f: CUT1, x: 540, y: 1160, z: 1.1},
      {f: 140, x: 540, y: 1180, z: 1.16},
      {f: 166, x: 470, y: 1090, z: 0.8},
      {f: 180, x: 470, y: 1080, z: 0.78},
    ],
    CRUSH.map((c, i): [number, number] => [c + 6, i ? 14 : 26]),
  );
  const ash = lerp(f, [CUT1, CRUSH[0]], [0, 70]);
  const crush = (k: number) => lerp(f, [CRUSH[k], CRUSH[k] + 8], [0, 1], ease.in);
  const houses = [
    {x: 160, s: 0.68, k: 1, wall: '#E9D7B8', roof: C.wood},
    {x: 920, s: 0.68, k: 2, wall: C.cream, roof: C.redDark},
    {x: 540, s: 1.15, k: 0, wall: C.cream, roof: C.red},
  ];
  return (
    <g transform={cam}>
      <defs>
        <linearGradient id="s4ciel" gradientUnits="userSpaceOnUse" x1="0" y1={-200} x2="0" y2={1300}>
          <stop offset="0" stopColor="#8F8890" />
          <stop offset="1" stopColor="#C4BDC1" />
        </linearGradient>
      </defs>
      <rect x={-900} y={-900} width={2900} height={3800} fill="url(#s4ciel)" />
      <g transform="translate(160 1240)" filter="url(#ppl)">
        <Billow frame={f} seed="hplume" dark glow={0.5} pts={Array.from({length: 9}, (_, i) => [-80 + i * 10, -260 - i * 110, 120 + i * 18] as const)} />
        <Volcano w={900} h={260} glow={1} />
      </g>
      <rect x={-900} y={1300} width={2900} height={1400} fill={V.ash3} filter="url(#pp)" />
      <rect x={-900} y={1300} width={2900} height={30} fill={V.ash4} />
      {houses.map((h) => (
        <g key={h.k} transform={`translate(${h.x} 1318) scale(${h.s})`} filter="url(#pp)">
          <House ash={ash} crush={crush(h.k)} wall={h.wall} roof={h.roof} />
        </g>
      ))}
      {houses.map((h) => (
        <Debris key={h.k} x={h.x} y={1318 - 200 * h.s} frame={f} start={CRUSH[h.k] + 7} n={14} seed={`hd${h.k}`} colors={[V.ash2, V.ash3, V.ash4]} speed={12} gravity={0.3} size={30} spread={2.4} />
      ))}
      <Fall frame={f} start={CUT1 - 4} n={120} seed="hash" area={[-400, -200, 1900, 1600]} color={V.ash1} size={7} speed={10} fadeIn={2} />
    </g>
  );
};

const AirportShot: React.FC<{f: number}> = ({f}) => {
  const cam = camera(
    f,
    [
      {f: CUT2, x: 560, y: 1150, z: 1.25},
      {f: 196, x: 560, y: 1150, z: 1.3},
      {f: 214, x: 760, y: 1080, z: 0.85},
      {f: 233, x: 760, y: 1070, z: 0.82},
    ],
    GROUNDED.map((g): [number, number] => [g + 2, 18]),
  );
  const ns = (k: number) => pop(f, GROUNDED[k], {damping: 7, stiffness: 260});
  const shudder = f > GROUNDED[0] && f < GROUNDED[0] + 14 ? Math.sin(f * 3) * 6 : 0;
  return (
    <g transform={cam}>
      <defs>
        <linearGradient id="s4air" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B9D6E6" />
          <stop offset="1" stopColor="#DCD6D2" />
        </linearGradient>
      </defs>
      <rect x={-900} y={-900} width={3200} height={2200} fill="url(#s4air)" />
      <g filter="url(#pp)">
        <rect x={1240} y={720} width={44} height={560} fill={C.cream} />
        <path d="M 1180 720 L 1344 720 L 1316 620 L 1208 620 Z" fill={C.ink} />
        <rect x={1214} y={636} width={96} height={56} fill={C.skyLight} />
        <rect x={-900} y={1240} width={3200} height={1400} fill="#8C8A90" />
        {Array.from({length: 18}, (_, i) => (
          <rect key={i} x={-600 + i * 180} y={1330} width={100} height={14} fill={C.cream} />
        ))}
        <rect x={-900} y={1460} width={3200} height={1200} fill={C.grassDark} />
      </g>
      <g transform={`translate(${560 + shudder} 1210) scale(1.25)`} filter="url(#pp)">
        <Plane />
      </g>
      <g transform="translate(1080 1170) scale(0.62)" filter="url(#pp)">
        <Plane />
      </g>
      {f >= GROUNDED[0] && (
        <g transform={`translate(560 1170) scale(${ns(0)})`} filter="url(#ppl)">
          <NoSign r={250} />
        </g>
      )}
      {f >= GROUNDED[1] && (
        <g transform={`translate(1080 1150) scale(${ns(1) * 0.62})`} filter="url(#ppl)">
          <NoSign r={250} />
        </g>
      )}
      <Fall frame={f} start={CUT2} n={40} seed="aash" area={[-300, 0, 1900, 1500]} color={V.ash2} size={5} speed={5} fadeIn={4} />
    </g>
  );
};

// 0:17–0:25 — les cendres retombent sur l'Amérique du Nord, les toits cèdent, les avions restent au sol
export const S4Ashfall: React.FC = () => {
  const f = useFrame();
  const s1 = lerp(f, [CUT1 - 4, CUT1 + 6], [0, 1], ease.inOut);
  const s2 = lerp(f, [CUT2 - 4, CUT2 + 6], [0, 1], ease.inOut);
  const cal = pop(f, 6, {damping: 9}) * lerp(f, [36, 44], [1, 0], ease.in);
  const sh = shake(f, []);
  return (
    <Stage bg={C.sea}>
      <g transform={`translate(${sh.x} ${sh.y})`}>
        {s1 < 1 && (
          <g transform={`translate(${-s1 * 1080} 0)`}>
            <MapShot f={f} />
          </g>
        )}
        {s1 > 0 && s2 < 1 && (
          <g transform={`translate(${(1 - s1) * 1080 - s2 * 1080} 0)`}>
            <HouseShot f={f} />
          </g>
        )}
        {s2 > 0 && (
          <g transform={`translate(${(1 - s2) * 1080} 0)`}>
            <AirportShot f={f} />
          </g>
        )}
      </g>
      {cal > 0.01 && (
        <g transform={`translate(880 330) scale(${cal * 0.95}) rotate(${4 - 4 * cal})`}>
          <Calendar frame={f} tears={TEARS} />
        </g>
      )}
    </Stage>
  );
};
