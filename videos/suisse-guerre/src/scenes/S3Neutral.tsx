import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, camera, ease, lerp, pop} from '../lib';
import {Crown, Debris, Rays, Ring, SwissCross} from '../shapes';
import {Stage} from '../Stage';

const CROWNS = [
  {color: C.gold, gem: C.red, velvet: '#8E1B2C'},
  {color: '#C9CED6', gem: '#2F6FD0', velvet: '#2B3F7A'},
  {color: C.gold, gem: '#2FA36B', velvet: '#5A2A7A'},
  {color: '#E6A64B', gem: '#2F6FD0', velvet: '#1F5A3A'},
  {color: '#D9DCE2', gem: C.red, velvet: '#7A1F1F'},
];

// gribouillis "écriture" (pas de vrai texte)
const scribble = (x0: number, y0: number, len: number, amp: number, seed: number) => {
  const pts: string[] = [];
  const n = Math.floor(len / 9);
  for (let k = 0; k <= n; k++) {
    const x = x0 + k * 9;
    const y = y0 + Math.sin(k * 1.25 + seed) * amp + Math.cos(k * 0.55 + seed * 2) * amp * 0.5;
    pts.push(`${k === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
};

const LINES = [
  {x: 300, y: 600, len: 470},
  {x: 300, y: 660, len: 440},
  {x: 300, y: 720, len: 480},
  {x: 300, y: 780, len: 360},
  {x: 300, y: 840, len: 470},
  {x: 300, y: 900, len: 420},
  {x: 300, y: 960, len: 300},
];
const SIGS = [290, 415, 540, 665, 790];

// 0:07–0:11 — 1815 : le traité, les couronnes signent, le sceau tombe
export const S3Neutral: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 920, z: 1.0},
      {f: 76, x: 540, y: 960, z: 1.05},
      {f: 80, x: 540, y: 1080, z: 1.2},
      {f: 96, x: 540, y: 1000, z: 1.07},
      {f: 128, x: 540, y: 980, z: 1.1},
    ],
    [
      [8, 10],
      [80, 46],
      ...SIGS.map((_, i): [number, number] => [40 + i * 6, 5]),
    ],
  );
  const bottom = lerp(f, [2, 18], [430, 1340], ease.out);
  const bounce = Math.sin(lerp(f, [18, 26], [0, Math.PI])) * 30;
  const scrollIn = pop(f, 0, {damping: 12});
  // tampon : descend, écrase, remonte
  const stampY = f < 80 ? lerp(f, [70, 80], [-1700, 0], ease.in) : lerp(f, [84, 98], [0, -1700], ease.in);
  const seal = f >= 80 ? 1 + (1 - pop(f, 80, {damping: 8, stiffness: 300})) * 0.4 : 0;

  return (
    <Stage bg={C.red}>
      <g transform={cam}>
        <rect x={-600} y={-600} width={2280} height={3200} fill={C.red} />
        <Rays cx={540} cy={960} n={18} color={C.redDark} rot={f * 0.7} opacity={0.7} />
        {/* parchemin qui se déroule */}
        <g transform={`translate(540 0) scale(${scrollIn}) translate(-540 0)`}>
          <g filter="url(#ppl)">
            <rect x={210} y={430} width={660} height={bottom + bounce - 430} fill={C.parchment} />
            <rect x={210} y={430} width={20} height={bottom + bounce - 430} fill={C.parchmentDark} opacity={0.5} />
            <rect x={850} y={430} width={20} height={bottom + bounce - 430} fill={C.parchmentDark} opacity={0.5} />
            <rect x={180} y={395} width={720} height={60} rx={30} fill="#C7A66A" />
            <rect x={160} y={405} width={40} height={40} rx={10} fill="#7A4423" />
            <rect x={880} y={405} width={40} height={40} rx={10} fill="#7A4423" />
            <rect x={180} y={bottom + bounce - 30} width={720} height={60} rx={30} fill="#C7A66A" />
            <rect x={160} y={bottom + bounce - 20} width={40} height={40} rx={10} fill="#7A4423" />
            <rect x={880} y={bottom + bounce - 20} width={40} height={40} rx={10} fill="#7A4423" />
          </g>
          <path
            d={scribble(330, 520, 420, 16, 0.4)}
            stroke="#5A3A1E"
            strokeWidth={9}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={1200}
            strokeDashoffset={lerp(f, [12, 24], [1200, 0])}
          />
          {LINES.map((l, i) => (
            <path
              key={i}
              d={scribble(l.x, l.y, l.len, 7, i * 1.7)}
              stroke="#6B4A2B"
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={1100}
              strokeDashoffset={lerp(f, [16 + i * 3, 26 + i * 3], [1100, 0], ease.linear)}
            />
          ))}
          {SIGS.map((x, i) => (
            <path
              key={x}
              d={scribble(x - 45, 1120, 90, 18, i * 2.3)}
              stroke="#1E2A55"
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={500}
              strokeDashoffset={lerp(f, [40 + i * 6, 46 + i * 6], [500, 0], ease.linear)}
            />
          ))}
        </g>
        {/* sceau de cire */}
        {f >= 80 && (
          <g transform={`translate(540 1240) scale(${seal})`} filter="url(#pp)">
            <circle r={92} fill={C.redDark} />
            <circle r={70} fill="#C2261A" />
            <SwissCross s={74} fill={C.cream} />
          </g>
        )}
        <Ring x={540} y={1240} frame={f} start={80} r={420} />
        <Debris x={540} y={1240} frame={f} start={80} n={14} seed="wax" colors={[C.redDark, '#C2261A']} speed={20} gravity={1.2} size={20} />
        {/* tampon */}
        {f >= 68 && f <= 100 && (
        <g transform={`translate(540 ${1150 + stampY})`} filter="url(#ppl)">
          <rect x={-100} y={-20} width={200} height={70} rx={10} fill="#5E3218" />
          <rect x={-36} y={-200} width={72} height={190} rx={20} fill="#7A4423" />
          <circle cx={0} cy={-230} r={58} fill="#7A4423" />
        </g>
        )}
        {/* couronnes en orbite qui signent puis s'écartent */}
        {CROWNS.map((c, i) => {
          const enter = pop(f, 8 + i * 3, {damping: 10, stiffness: 170});
          if (enter <= 0) return null;
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + lerp(f, [8, 128], [0, 2.4], ease.linear);
          const away = lerp(f, [84, 112], [1, 1.5], ease.inOut);
          const rad = (2.2 - 1.2 * enter) * away;
          const x = 540 + Math.cos(a) * 400 * rad;
          const y = 940 + Math.sin(a) * 650 * rad;
          const nod = Math.sin(lerp(f, [40 + i * 6, 48 + i * 6], [0, Math.PI])) * -24;
          const bow = lerp(f, [84, 100], [0, 1]) * Math.sin(f * 0.4 + i) * 12;
          return (
            <g key={i} transform={`translate(${x} ${y}) rotate(${nod + bow}) scale(${0.95 * lerp(f, [84, 112], [1, 0.75])})`} filter="url(#pp)">
              <Crown {...c} />
            </g>
          );
        })}
      </g>
    </Stage>
  );
};
