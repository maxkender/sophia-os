import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, camera, ease, lerp, pop, shake} from '../lib';
import {Chalet, Cloud, DollChain, Mountain, Rifle, Sparkle, SwissFlagRect} from '../shapes';
import {Stage} from '../Stage';

const SMALL = [
  {x: 120, y: 1070, s: 0.36, start: 48},
  {x: 965, y: 1060, s: 0.38, start: 52},
  {x: 205, y: 905, s: 0.24, start: 56},
  {x: 880, y: 895, s: 0.24, start: 60},
];

const Exterior: React.FC<{f: number}> = ({f}) => {
  const drop = pop(f, 0, {damping: 10, stiffness: 220});
  return (
    <g>
      <rect x={-600} y={-600} width={2280} height={3200} fill={C.sky} />
      <g transform={`translate(${-80 + f * 1.5} 330) scale(0.8)`} filter="url(#pp)">
        <Cloud />
      </g>
      <g transform={`translate(${700 + f * 1.1} 230) scale(0.6)`} filter="url(#pp)">
        <Cloud />
      </g>
      <g filter="url(#pp)">
        <Mountain
          pts={[[0, 980], [180, 640], [360, 840], [560, 560], [760, 820], [930, 620], [1080, 820], [1080, 1500], [0, 1500]]}
          fill={C.m2}
        />
      </g>
      <g filter="url(#pp)">
        <path d="M -200 1000 Q 300 900 600 980 T 1300 960 L 1300 2300 L -200 2300 Z" fill={C.grass} />
        <path d="M -200 1300 Q 300 1240 600 1290 T 1300 1270 L 1300 2300 L -200 2300 Z" fill={C.grassDark} />
      </g>
      {SMALL.map((c, i) => {
        const p = pop(f, c.start, {damping: 9});
        if (p <= 0) return null;
        return (
          <g key={i} transform={`translate(${c.x} ${c.y}) scale(${c.s})`}>
            <g transform={`scale(${p})`} filter="url(#pp)">
              <Chalet door={lerp(f, [c.start + 4, c.start + 8], [0, 1])} />
            </g>
            <g transform="translate(0 150) scale(0.62)">
              <DollChain n={5} frame={f} start={c.start + 8} gap={3} />
            </g>
          </g>
        );
      })}
      <g transform={`translate(540 ${1250 - (1 - drop) * 1300}) scale(1.2)`} filter="url(#ppl)">
        <Chalet door={lerp(f, [12, 20], [0, 1], ease.out)} />
      </g>
      <g transform="translate(540 1560) scale(0.92)">
        <DollChain n={7} frame={f} start={20} gap={4} />
      </g>
    </g>
  );
};

const Interior: React.FC<{f: number}> = ({f}) => {
  const t = f - 96;
  const push = lerp(t, [0, 10], [1.5, 1.0], ease.out);
  const rifle = pop(f, 104, {damping: 9, stiffness: 200});
  const s = shake(f, [[110, 22]]);
  const shine = lerp(f, [118, 132], [-500, 500], ease.inOut);
  return (
    <g
      transform={`translate(${540 + s.x} ${960 + s.y}) rotate(${s.r}) scale(${push * lerp(f, [100, 158], [1, 1.08], ease.linear)}) translate(-540 -960)`}
      opacity={lerp(t, [0, 5], [0, 1], ease.linear)}
    >
      <rect x={-600} y={-600} width={2280} height={3200} fill="#A8683A" />
      {Array.from({length: 12}).map((_, i) => (
        <rect key={i} x={i * 100 - 40} y={-600} width={6} height={3200} fill={C.woodDark} opacity={0.4} />
      ))}
      {Array.from({length: 30}).map((_, i) => (
        <circle key={i} cx={(i * 137) % 1080} cy={(i * 263) % 1920} r={7} fill={C.woodDark} opacity={0.35} />
      ))}
      <g filter="url(#pp)">
        <rect x={326} y={990} width={28} height={70} rx={8} fill={C.gold} />
        <rect x={726} y={990} width={28} height={70} rx={8} fill={C.gold} />
      </g>
      <g transform={`translate(540 ${960 - (1 - Math.min(rifle, 1)) * 900}) rotate(${(1 - rifle) * -14}) scale(1.5)`} filter="url(#ppl)">
        <Rifle />
      </g>
      {f > 118 && f < 134 && <Sparkle x={540 + shine} y={950} frame={f} size={34} color={C.white} />}
      <g transform={`translate(180 520) rotate(-6) scale(${pop(f, 112)})`} filter="url(#pp)">
        <SwissFlagRect s={170} />
        <circle cx={85} cy={10} r={9} fill={C.ink} />
      </g>
      <g transform={`translate(860 560) scale(${pop(f, 116)})`} filter="url(#pp)">
        <rect x={-8} y={-80} width={16} height={60} fill={C.gold} />
        <path d="M -90 40 Q -90 -60 0 -60 Q 90 -60 90 40 Z" fill={C.greenDark} />
        <rect x={-104} y={30} width={208} height={22} rx={10} fill={C.greenDark} />
      </g>
    </g>
  );
};

// 0:11–0:16 — la guirlande de soldats sort du chalet, puis le fusil au mur
export const S4Army: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 1180, z: 1.0},
      {f: 40, x: 540, y: 1230, z: 1.04},
      {f: 62, x: 540, y: 1160, z: 0.97},
      {f: 88, x: 540, y: 1150, z: 1.0},
      {f: 100, x: 426, y: 1010, z: 7.5},
    ],
    [
      [7, 22],
      [21, 8],
      [25, 6],
      [29, 6],
      [33, 6],
      ...SMALL.map((c): [number, number] => [c.start + 3, 6]),
    ],
  );
  return (
    <Stage bg={C.sky}>
      {f < 104 && <g transform={cam}>{<Exterior f={f} />}</g>}
      {f >= 96 && <Interior f={f} />}
    </Stage>
  );
};
