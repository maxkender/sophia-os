import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, ease, lerp, pop, shake} from '../lib';
import {EuropeMap, GEO} from '../map';
import {Bomb, Coin, Rays, Sparkle} from '../shapes';
import {Stage} from '../Stage';

const PIV: [number, number] = [540, 760];
const ARM = 410;
const STR = 330;
const BOMBS = [
  {x: -62, y: -36, s: 10},
  {x: 54, y: -36, s: 15},
  {x: -4, y: -100, s: 20},
];
const COINS: {x: number; y: number}[] = [];
[4, 3, 2, 1].forEach((n, row) => {
  for (let j = 0; j < n; j++) COINS.push({x: (j - (n - 1) / 2) * 56, y: -26 - row * 40});
});
const coinStart = (i: number) => 34 + i * 3;
const TIP = 64;

const Pan: React.FC<{x: number; y: number; children?: React.ReactNode}> = ({x, y, children}) => (
  <g transform={`translate(${x} ${y})`}>
    <path d={`M 0 ${-STR} L -128 0 M 0 ${-STR} L 128 0`} stroke="#8A6A2A" strokeWidth={5} fill="none" />
    {children}
    <g filter="url(#pp)">
      <path d="M -140 0 Q 0 110 140 0 Z" fill="#C99A3B" />
      <rect x={-148} y={-8} width={296} height={16} rx={8} fill="#DDB45A" />
    </g>
  </g>
);

// 0:26–0:30 — la balance : les bombes coûtent, l'argent pèse plus. Retour à la carte (boucle).
export const S7Punch: React.FC = () => {
  const f = useCurrentFrame();
  // angle du fléau : négatif = côté bombes en bas
  const bombsIn = BOMBS.filter((b) => f >= b.s + 6).length;
  const coinsIn = COINS.filter((_, i) => f >= coinStart(i) + 6).length;
  let target = -bombsIn * 4.5 + coinsIn * 1.6;
  if (f >= TIP) target = 24;
  const theta = target + Math.sin(f * 0.9) * (f < TIP ? 1.2 : 0) + (f >= TIP ? -18 * (1 - pop(f, TIP, {damping: 6, stiffness: 160})) : 0);
  const th = (theta * Math.PI) / 180;
  const L: [number, number] = [PIV[0] - ARM * Math.cos(th), PIV[1] - ARM * Math.sin(th)];
  const R: [number, number] = [PIV[0] + ARM * Math.cos(th), PIV[1] + ARM * Math.sin(th)];
  const enter = pop(f, 0, {damping: 10, stiffness: 200});
  // sortie : la balance est aspirée, la carte revient (même cadrage que le début → boucle)
  const outQ = lerp(f, [84, 98], [0, 1], ease.in);
  const mapZ = lerp(f, [84, 123], [3.2, 1.38], ease.out);
  const mapR = lerp(f, [84, 123], [-14, -4], ease.out);
  const s = shake(f, [
    [4, 18],
    ...BOMBS.map((b): [number, number] => [b.s + 6, 9]),
    ...COINS.map((_, i): [number, number] => [coinStart(i) + 6, 3]),
    [TIP + 2, 34],
  ]);
  const [cx, cy] = GEO.chCenter;

  return (
    <Stage bg={C.kraft}>
      {f >= 84 && (
        <g transform={`translate(540 960) rotate(${mapR}) scale(${mapZ}) translate(${-cx} ${-cy})`}>
          <EuropeMap />
        </g>
      )}
      {outQ < 1 && (
        <g
          transform={`translate(${540 + s.x} ${960 + s.y}) rotate(${s.r + outQ * 220}) scale(${(1 - outQ) * (0.7 + 0.3 * enter) * lerp(f, [0, 84], [1, 1.08], ease.linear)}) translate(-540 -960)`}
        >
          <rect x={-800} y={-800} width={2700} height={3600} fill={C.kraft} />
          <Rays cx={540} cy={900} n={20} color={C.cream} rot={-f * 0.9} opacity={0.8} />
          {/* pied */}
          <g filter="url(#ppl)">
            <rect x={518} y={PIV[1]} width={44} height={830} rx={10} fill="#B8872E" />
            <path d="M 380 1640 L 700 1640 L 660 1580 L 420 1580 Z" fill="#9C7024" />
            <circle cx={PIV[0]} cy={PIV[1] - 10} r={30} fill="#DDB45A" />
          </g>
          {/* plateau bombes */}
          <Pan x={L[0]} y={L[1] + STR}>
            {BOMBS.map((b, i) => {
              if (f < b.s) return null;
              const fall = lerp(f, [b.s, b.s + 6], [-900, 0], ease.in);
              // éjectées quand la balance bascule
              const t = Math.max(0, f - TIP);
              const fx = f >= TIP ? -t * (9 + i * 4) : 0;
              const fy = f >= TIP ? -t * (34 - i * 3) + 0.9 * t * t : 0;
              return (
                <g key={i} transform={`translate(${b.x + fx} ${b.y + fall + fy}) rotate(${f >= TIP ? -t * 22 : 0}) scale(0.8)`} filter="url(#pp)">
                  <Bomb frame={f} />
                </g>
              );
            })}
          </Pan>
          {/* plateau pièces */}
          <Pan x={R[0]} y={R[1] + STR}>
            {COINS.map((c, i) => {
              const st = coinStart(i);
              if (f < st) return null;
              const fall = lerp(f, [st, st + 6], [-900, 0], ease.in);
              return (
                <g key={i} transform={`translate(${c.x} ${c.y + fall}) scale(0.85)`} filter="url(#pp)">
                  <Coin />
                </g>
              );
            })}
            {f > TIP + 4 &&
              [
                [-80, -190],
                [70, -220],
                [0, -260],
              ].map(([x, y], i) => <Sparkle key={i} x={x} y={y} frame={f + i * 4} size={26} />)}
          </Pan>
          {/* fléau */}
          <g transform={`translate(${PIV[0]} ${PIV[1]}) rotate(${theta})`} filter="url(#ppl)">
            <rect x={-ARM - 20} y={-13} width={ARM * 2 + 40} height={26} rx={13} fill="#DDB45A" />
            <circle cx={-ARM} cy={0} r={16} fill="#B8872E" />
            <circle cx={ARM} cy={0} r={16} fill="#B8872E" />
          </g>
        </g>
      )}
    </Stage>
  );
};
