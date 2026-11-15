import React from 'react';
import {Easing} from 'remotion';
import {noise2D} from '@remotion/noise';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Boom, Mountain, Rays, Sparkle} from '../shapes';
import {Stage} from '../Stage';
import {Billow, Check, Mammoth, Pyramid, Scientist, Stopwatch, Surface, Volcano} from '../volcan';

export const SUN = 13;
export const ICON = 42;
export const ERUPT = 79;
export const PAN = [96, 152];
export const SCI = 160;
export const LENS = 192;
export const OK = 212;
const CUT = 40;

const Y = 1150;
const X0 = 330;
const X1 = 3200;
// position sur le ruban d'un événement vieux de `ans` années (640 000 ans → X0, aujourd'hui → X1)
const at = (ans: number) => X0 + (X1 - X0) * (1 - ans / 640000);
const MARKS = [
  {x: at(400000), k: 'mammoth'},
  {x: at(300000), k: 'fire'},
  {x: X1 - 700, k: 'pyramid'},
];

// caméra du ruban : le volcan d'il y a 640 000 ans, puis un long travelling jusqu'à aujourd'hui
const camXAt = (f: number) =>
  f < PAN[0] ? lerp(f, [CUT, PAN[0]], [X0 + 60, X0 + 160]) : lerp(f, [PAN[0], PAN[1]], [X0 + 160, X1 + 60], Easing.bezier(0.4, 0, 0.6, 1));
// chaque repère apparaît quand la caméra arrive dessus
const entree = (x: number) => {
  for (let f = CUT; f < PAN[1]; f++) if (camXAt(f) > x - 560) return f;
  return PAN[1];
};

const Bird: React.FC<{flap: number}> = ({flap}) => (
  <path d={`M -30 ${flap * 14} Q -14 -6 0 4 Q 14 -6 30 ${flap * 14}`} stroke={C.ink} strokeWidth={7} fill="none" strokeLinecap="round" />
);

const Calm: React.FC<{f: number}> = ({f}) => {
  const cam = camera(f, [
    {f: 0, x: 540, y: 1000, z: 1.18},
    {f: CUT, x: 540, y: 980, z: 1.08},
  ]);
  const sun = pop(f, SUN, {damping: 8, stiffness: 180});
  return (
    <g transform={cam}>
      <rect x={-900} y={-900} width={2900} height={3800} fill="#9FD3F0" />
      <g transform="translate(540 520)">
        <Rays cx={0} cy={0} n={16} color={C.yellow} rot={f * 1.4} r={520} opacity={0.55 * sun} />
        <circle r={110 * (0.6 + 0.4 * sun)} fill={C.yellow} filter="url(#pp)" />
      </g>
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(${-100 + f * (9 + k * 2) + k * 140} ${720 + k * 60 + Math.sin(f * 0.2 + k) * 20})`}>
          <Bird flap={Math.sin(f * 0.8 + k)} />
        </g>
      ))}
      <g filter="url(#ppl)">
        <Mountain pts={[[-300, 1250], [80, 960], [300, 1130], [520, 920], [760, 1110], [980, 980], [1380, 1250]]} fill={C.m1} />
      </g>
      <g transform="translate(0 1250)">
        <Surface frame={f} jet={lerp(f, [4, 10, 26, 34], [0, 0.6, 0.6, 0])} bisonX={520 + f * 1.2} />
      </g>
      <rect x={-900} y={1290} width={2900} height={1500} fill={C.grassDark} filter="url(#pp)" />
    </g>
  );
};

const Fire: React.FC<{f: number}> = ({f}) => (
  <g>
    <rect x={-70} y={-24} width={140} height={22} rx={10} fill={C.woodDark} transform="rotate(12)" />
    <rect x={-70} y={-24} width={140} height={22} rx={10} fill={C.wood} transform="rotate(-12)" />
    <path d={`M -44 -20 Q -50 ${-100 + Math.sin(f) * 8} 0 ${-150 + Math.sin(f * 1.3) * 10} Q 50 ${-100 + Math.cos(f) * 8} 44 -20 Z`} fill={C.orange} />
    <path d={`M -22 -20 Q -24 -70 0 ${-100 + Math.sin(f * 1.7) * 8} Q 24 -70 22 -20 Z`} fill={C.yellow} />
  </g>
);

const Seismo: React.FC<{f: number}> = ({f}) => {
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = -520 + i * 8;
    pts.push(`${x},${-150 + noise2D('sis', (x - f * 6) * 0.05, 0) * 7}`);
  }
  return (
    <g>
      <rect x={-540} y={-200} width={420} height={100} fill={C.cream} />
      {[0, 1, 2].map((k) => (
        <rect key={k} x={-540} y={-180 + k * 30} width={420} height={2} fill={C.red} opacity={0.3} />
      ))}
      <polyline points={pts.join(' ')} stroke={C.ink} strokeWidth={5} fill="none" />
      <rect x={-130} y={-260} width={260} height={260} rx={18} fill={C.wood} />
      <circle cx={0} cy={-150} r={70} fill={C.cream} />
      <circle cx={0} cy={-150} r={14} fill={C.ink} />
      <path d="M 100 -240 L -40 -152" stroke={C.ink} strokeWidth={8} />
      <circle cx={-44} cy={-150} r={9} fill={C.red} />
    </g>
  );
};

const Ribbon: React.FC<{f: number}> = ({f}) => {
  const camX = camXAt(f);
  const z = lerp(f, [CUT, 60, PAN[0], 110, 146, PAN[1], 176], [1.25, 1.15, 1.15, 0.86, 0.86, 0.95, 1.1], ease.inOut);
  const camY = lerp(f, [CUT, PAN[0], 110, PAN[1], 176], [Y - 160, Y - 160, Y - 60, Y - 100, Y - 170], ease.inOut);
  const icon = pop(f, ICON, {damping: 9, stiffness: 200});
  const plume = lerp(f, [ERUPT, ERUPT + 20], [0, 1], ease.out);
  const sci = pop(f, SCI, {damping: 9, stiffness: 220});
  const lens = pop(f, LENS, {damping: 10, stiffness: 220});
  const ok = pop(f, OK, {damping: 7, stiffness: 240});
  const unroll = Math.max(X0 + 700, camX + 900);
  return (
    <g transform={`translate(540 960) scale(${z}) translate(${-camX} ${-camY})`}>
      <rect x={-1000} y={-1000} width={7400} height={4000} fill={C.kraft} />
      <Rays cx={X0} cy={Y} n={22} color={C.cream} rot={f * 0.5} r={1500} opacity={0.5} />
      {/* le ruban du temps */}
      <g filter="url(#ppl)">
        <rect x={X0 - 60} y={Y} width={Math.max(0, unroll - X0 + 60)} height={90} rx={16} fill={C.cream} />
        {Array.from({length: 46}, (_, i) => {
          const x = X0 + i * 100;
          return x < unroll ? <rect key={i} x={x - 3} y={Y + 8} width={6} height={i % 5 ? 22 : 54} fill={C.red} /> : null;
        })}
      </g>
      {/* il y a 640 000 ans */}
      {icon > 0 && (
        <g transform={`translate(${X0} ${Y}) scale(${icon * 1.25})`} filter="url(#ppl)">
          {plume > 0 && <Billow frame={f} seed="old" pts={[0, 1, 2, 3, 4].map((k) => [k * 6, -170 - k * 60 * plume, 50 + k * 18] as const)} dark glow={0.4} />}
          <Volcano w={380} h={170} glow={f >= ERUPT ? 1 : 0.4} />
        </g>
      )}
      <Boom x={X0} y={Y - 212} size={110} frame={f} start={ERUPT} seed="old" life={22} />
      {MARKS.map((m) => {
        const p = pop(f, entree(m.x), {damping: 9, stiffness: 220});
        if (p <= 0) return null;
        return (
          <g key={m.k} transform={`translate(${m.x} ${Y}) scale(${p * 1.35})`} filter="url(#pp)">
            {m.k === 'mammoth' ? <Mammoth /> : m.k === 'fire' ? <Fire f={f} /> : <Pyramid />}
          </g>
        );
      })}
      {/* aujourd'hui : les scientifiques surveillent, aucun signe */}
      {sci > 0 && (
        <g transform={`translate(${X1 - 250} ${Y}) scale(${sci})`} filter="url(#pp)">
          <Scientist />
        </g>
      )}
      {sci > 0 && (
        <g transform={`translate(${X1 + 330} ${Y}) scale(${sci * 0.85})`} filter="url(#pp)">
          <Seismo f={f} />
        </g>
      )}
      {lens > 0 && (
        <g transform={`translate(${X1 + 110 + Math.sin(f * 0.15) * 60} ${Y - 130}) scale(${lens}) rotate(-20)`} filter="url(#pp)">
          <circle r={70} fill={C.skyLight} opacity={0.5} stroke={C.ink} strokeWidth={14} />
          <rect x={60} y={-12} width={110} height={24} rx={10} fill={C.ink} />
        </g>
      )}
      {ok > 0 && (
        <g transform={`translate(${X1 + 60} ${Y - 560}) scale(${ok})`} filter="url(#ppl)">
          <Rays cx={0} cy={0} n={14} color={C.yellow} rot={f * 2} r={260} opacity={0.5} />
          <Check r={110} />
        </g>
      )}
      {ok > 0 && [0, 1, 2].map((k) => <Sparkle key={k} x={X1 + 60 + Math.cos(k * 2.1 + f * 0.1) * 190} y={Y - 560 + Math.sin(k * 2.1 + f * 0.1) * 190} frame={f} size={26} />)}
    </g>
  );
};

// 0:42–0:50 — la bonne nouvelle : 640 000 ans, et aucun signe de la prochaine
export const S8Calm: React.FC = () => {
  const f = useFrame();
  const slide = lerp(f, [CUT - 4, CUT + 6], [0, 1], ease.inOut);
  return (
    <Stage bg={C.kraft}>
      {slide < 1 && (
        <g transform={`translate(${-slide * 1080} 0)`}>
          <Calm f={f} />
        </g>
      )}
      {slide > 0 && (
        <g transform={`translate(${(1 - slide) * 1080} 0)`}>
          <Ribbon f={f} />
        </g>
      )}
      {/* le chronomètre file pendant les 640 000 ans */}
      {f > PAN[0] - 8 && f < PAN[1] + 10 && (
        <g transform={`translate(540 520) scale(${pop(f, PAN[0] - 8, {damping: 9}) * lerp(f, [PAN[1], PAN[1] + 10], [1, 0], ease.in)})`}>
          <Stopwatch angle={lerp(f, [PAN[0], PAN[1]], [0, 360 * 9], Easing.bezier(0.4, 0, 0.6, 1))} r={150} />
        </g>
      )}
    </Stage>
  );
};

