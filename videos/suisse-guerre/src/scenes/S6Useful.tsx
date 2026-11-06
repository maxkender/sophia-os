import React from 'react';
import {random} from 'remotion';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {GEO} from '../map';
import {Coin, Dove, FlagPole, GoldBar, Handshake, Rays, SwissCross} from '../shapes';
import {Stage} from '../Stage';

const PX = 600;
type Item = {x: number; y: number; kind: 'bar' | 'coin'; s: number};
const ITEMS: Item[] = [];
[0, 1, 2, 3].forEach((j) => ITEMS.push({x: PX + (j - 1.5) * 124, y: 1110, kind: 'bar', s: 4 + j * 2}));
[6, 5, 4, 3, 2, 1].forEach((n, row) => {
  for (let j = 0; j < n; j++) {
    ITEMS.push({x: PX + (j - (n - 1) / 2) * 58, y: 1050 - row * 44, kind: 'coin', s: 0});
  }
});
ITEMS.filter((it) => it.kind === 'coin').forEach((it, i) => {
  it.s = 12 + i * 1.6;
});

const Flying: React.FC<{f: number; it: Item; i: number}> = ({f, it, i}) => {
  if (f < it.s) return null;
  const a = random(`a${i}`) * Math.PI * 2;
  const x0 = PX + Math.cos(a) * 1300;
  const y0 = 1000 + Math.sin(a) * 1300;
  const t = lerp(f, [it.s, it.s + 11], [0, 1], ease.inOut);
  const mx = (x0 + it.x) / 2 + Math.cos(a + Math.PI / 2) * 320;
  const my = (y0 + it.y) / 2 + Math.sin(a + Math.PI / 2) * 320;
  const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * it.x;
  const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * it.y;
  const land = f >= it.s + 11 ? 1 - pop(f, it.s + 11, {damping: 7, stiffness: 300}) : 0;
  const rot = (1 - t) * 540 * (i % 2 ? 1 : -1);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${0.9 * (1 + land * 0.25)} ${0.9 * (1 - land * 0.25)})`}>
      {it.kind === 'bar' ? <GoldBar /> : <Coin />}
    </g>
  );
};

const Pin: React.FC<{f: number}> = ({f}) => {
  const p = pop(f, 72, {damping: 8, stiffness: 220});
  if (p <= 0) return null;
  const [gx, gy] = GEO.geneva;
  return (
    <g transform={`translate(${gx} ${gy - (1 - p) * 700})`} filter="url(#pp)">
      <path d="M 0 0 C -30 -40 -42 -60 -42 -84 A 42 42 0 1 1 42 -84 C 42 -60 30 -40 0 0 Z" fill={C.ink} />
      <circle cx={0} cy={-84} r={17} fill={C.cream} />
    </g>
  );
};

// 0:22–0:26 — banques, Croix-Rouge, colombes, poignée de main à Genève
export const S6Useful: React.FC = () => {
  const f = useFrame();
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 960, z: 1.0},
      {f: 44, x: 560, y: 980, z: 1.06},
      {f: 74, x: 520, y: 980, z: 1.03},
      {f: 92, x: 330, y: 1040, z: 1.3},
      {f: 128, x: 330, y: 1040, z: 1.36},
    ],
    [[5, 26], ...ITEMS.map((it): [number, number] => [it.s + 11, 3]), [48, 6], [84, 28]],
  );
  const drop = pop(f, 0, {damping: 11, stiffness: 230});
  const hand = pop(f, 82, {damping: 8, stiffness: 240});
  const shakeHand = f > 90 ? Math.sin((f - 90) * 0.9) : 0;
  return (
    <Stage bg={C.kraft}>
      <g transform={cam}>
        <rect x={-800} y={-800} width={2700} height={3600} fill={C.kraft} />
        <Rays cx={540} cy={960} n={20} color={C.cream} rot={f * 0.8} opacity={0.75} />
        <g transform={`translate(540 960) rotate(${(1 - drop) * -8}) scale(${1.45 - 0.45 * drop}) translate(-540 -960)`} filter="url(#ppl)">
          <path d={GEO.chBig} fill={C.red} />
          <g transform="translate(470 880)">
            <SwissCross s={170} />
          </g>
        </g>
        <g filter="url(#pp)">
          {ITEMS.map((it, i) => (
            <Flying key={i} f={f} it={it} i={i} />
          ))}
        </g>
        <FlagPole x={840} y={820} h={260} s={120} frame={f} start={46} kind="redcross" />
        {[0, 1, 2].map((k) => {
          const st = 50 + k * 8;
          if (f < st) return null;
          return (
            <g
              key={k}
              transform={`translate(${-160 + (f - st) * (13 + k * 2)} ${470 + k * 95 + Math.sin(f * 0.25 + k) * 28}) scale(${0.85 - k * 0.1})`}
              filter="url(#pp)"
            >
              <Dove flap={Math.sin(f * 0.95 + k * 2)} />
            </g>
          );
        })}
        <Pin f={f} />
        {f >= 82 && (
          <g transform={`translate(330 ${960 + shakeHand * 16}) rotate(${shakeHand * 4}) scale(${hand * 0.55})`}>
            <Rays cx={0} cy={0} n={14} color={C.yellow} rot={f * 2} r={420} opacity={0.55} />
            <g filter="url(#ppl)">
              <Handshake />
            </g>
          </g>
        )}
      </g>
    </Stage>
  );
};
