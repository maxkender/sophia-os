import React from 'react';
import {interpolateColors, random} from 'remotion';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Mountain} from '../shapes';
import {Stage} from '../Stage';
import {Fall, Thermometer, V, Wheat} from '../volcan';

export const THERMO = 9;
export const DROP = [45, 52, 60];
export const FROST = 60;
export const WINTER = 86;
export const FAIL = 142;
export const PLATE = 160;
export const BITES = [176, 184, 192];

const STALKS = Array.from({length: 3 * 22}, (_, i) => {
  const row = Math.floor(i / 22);
  const j = i % 22;
  return {x: -120 + j * 62 + row * 22 + (random(`wx${i}`) - 0.5) * 20, y: 1560 + row * 90, h: 250 + random(`wh${i}`) * 70 - row * 10, row, k: i};
});

const Frost: React.FC<{q: number}> = ({q}) => {
  if (q <= 0) return null;
  const corner = (cx: number, cy: number, sx: number, sy: number, seed: string) => {
    const pts: string[] = [`${cx},${cy}`];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      const r = (220 + random(`${seed}${i}`) * 180) * q * (i % 2 ? 0.72 : 1);
      pts.push(`${cx + sx * Math.cos(a) * r},${cy + sy * Math.sin(a) * r}`);
    }
    return <polygon key={seed} points={pts.join(' ')} fill={V.frost} opacity={0.85} />;
  };
  return (
    <g filter="url(#pp)">
      {corner(0, 0, 1, 1, 'a')}
      {corner(1080, 0, -1, 1, 'b')}
      {corner(0, 1920, 1, -1, 'c')}
      {corner(1080, 1920, -1, -1, 'd')}
    </g>
  );
};

// 0:29–0:36 — des années plus froides : hiver volcanique, récoltes perdues, la faim
export const S6Winter: React.FC = () => {
  const f = useFrame();
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 1000, z: 1.0},
      {f: 30, x: 470, y: 1000, z: 1.06},
      {f: 74, x: 470, y: 1010, z: 1.1},
      {f: 96, x: 540, y: 980, z: 0.98},
      {f: 124, x: 560, y: 1060, z: 1.0},
      {f: 140, x: 620, y: 1420, z: 1.3},
      {f: 156, x: 620, y: 1420, z: 1.34},
      {f: 172, x: 540, y: 1180, z: 1.02},
      {f: 215, x: 540, y: 1170, z: 1.06},
    ],
    [
      [THERMO + 2, 10],
      ...DROP.map((d): [number, number] => [d + 1, 6]),
      [WINTER + 2, 10],
      [FAIL + 2, 8],
      [PLATE + 2, 14],
      ...BITES.map((b): [number, number] => [b + 1, 5]),
    ],
  );
  const level = lerp(f, [DROP[0], DROP[1], DROP[2], 74], [0.8, 0.64, 0.46, 0.26], ease.inOut);
  const tcol = interpolateColors(f, [52, 72], [C.red, V.cold]);
  const thermo = pop(f, THERMO, {damping: 9, stiffness: 200});
  const frost = lerp(f, [FROST, 76], [0, 1], ease.out);
  const snow = lerp(f, [WINTER, 118], [0, 1], ease.inOut);
  const sky = interpolateColors(f, [WINTER - 10, 112], ['#A9D4EE', '#8E939C']);
  const sunA = lerp(f, [THERMO, 34], [0, Math.PI * 2], ease.inOut);
  const plate = pop(f, PLATE, {damping: 9, stiffness: 210});
  return (
    <Stage bg={C.sky}>
      <g transform={cam}>
        <rect x={-900} y={-900} width={2900} height={3800} fill={sky} />
        {/* le soleil fait le tour des années, de plus en plus pâle */}
        <g transform={`translate(${540 + Math.cos(sunA - Math.PI / 2) * 380} ${520 + Math.sin(sunA - Math.PI / 2) * 160 + lerp(f, [60, 110], [0, 200])})`} opacity={lerp(f, [70, 110], [1, 0.25])}>
          <circle r={90} fill={C.yellow} filter="url(#pp)" />
        </g>
        <g filter="url(#ppl)">
          <Mountain pts={[[-400, 1300], [0, 980], [300, 1160], [640, 900], [980, 1120], [1480, 1300]]} fill={C.m1} />
          <path d="M -500 1260 Q 300 1150 800 1240 T 1600 1220 L 1600 2400 L -500 2400 Z" fill={C.grass} />
          <path d="M -500 1260 Q 300 1150 800 1240 T 1600 1220 L 1600 2400 L -500 2400 Z" fill={C.snow} opacity={snow} />
          <path d="M -500 1420 Q 400 1360 1000 1420 T 1700 1400 L 1700 2400 L -500 2400 Z" fill={C.grassDark} />
          <path d="M -500 1420 Q 400 1360 1000 1420 T 1700 1400 L 1700 2400 L -500 2400 Z" fill="#E8F1F5" opacity={snow} />
        </g>
        {/* le champ de blé */}
        <g filter="url(#pp)">
          {STALKS.map((s) => {
            const w = lerp(f, [FAIL + (s.k % 7), FAIL + 12 + (s.k % 7)], [0, 1], ease.out);
            return (
              <g key={s.k} transform={`translate(${s.x} ${s.y}) rotate(${Math.sin(f * 0.12 + s.k) * (3 - w * 2)})`}>
                <Wheat wilt={w} h={s.h} seed={`w${s.k}`} />
                {snow > 0.3 && <ellipse cx={0} cy={-4} rx={26} ry={10 * snow} fill={C.snow} />}
              </g>
            );
          })}
        </g>
        {/* le thermomètre */}
        {thermo > 0 && (
          <g transform={`translate(230 1240) scale(${thermo * 0.95}) rotate(${(1 - thermo) * -12})`} filter="url(#ppl)">
            <Thermometer level={level} color={tcol} h={720} />
          </g>
        )}
        <Fall frame={f} start={WINTER} n={150} seed="snow" area={[-500, -300, 2100, 2400]} color={C.snow} size={9} speed={8} fadeIn={14} />
        {/* l'assiette qui se vide */}
        {plate > 0 && (
          <g transform={`translate(540 1180) scale(${plate * 1.45})`} filter="url(#ppl)">
            <rect x={-360} y={-20} width={36} height={190} rx={18} fill={C.grey} transform="rotate(-8)" />
            <rect x={330} y={-20} width={36} height={190} rx={10} fill={C.grey} transform="rotate(8)" />
            <ellipse cx={0} cy={60} rx={300} ry={110} fill="#E9E4DA" />
            <ellipse cx={0} cy={50} rx={290} ry={104} fill={C.white} />
            <ellipse cx={0} cy={56} rx={200} ry={68} fill="#F1EEE8" />
            {[-80, 0, 80].map((x, i) => {
              const gone = pop(f, BITES[i], {damping: 10, stiffness: 300});
              const s = 1 - gone;
              return s > 0.02 ? (
                <g key={x} transform={`translate(${x} 30) scale(${s})`}>
                  <rect x={-46} y={-70} width={92} height={110} rx={40} fill={C.wood} />
                  <rect x={-34} y={-58} width={68} height={60} rx={26} fill="#E8B87A" />
                </g>
              ) : null;
            })}
            {f >= BITES[2] &&
              [0, 1, 2, 3, 4].map((k) => (
                <circle key={k} cx={-60 + k * 30} cy={70 + (k % 2) * 10} r={6} fill={C.wood} opacity={lerp(f, [BITES[2], BITES[2] + 6], [0, 1])} />
              ))}
          </g>
        )}
      </g>
      <Frost q={frost} />
    </Stage>
  );
};
