import React from 'react';
import {interpolateColors} from 'remotion';
import {C, camera, ease, lerp, pop, starPoints, useFrame} from '../lib';
import {Boom, Cloud, Rays, Sparkle} from '../shapes';
import {Stage} from '../Stage';
import {Billow, Fall, Parasol, Sandcastle, V, Volcano} from '../volcan';

export const CRAZY = 19;
export const OLD = 42;
export const GHOST = 92;
export const ERUPT = 103;
const CUT = 136;
export const CLOUDS = 162;
export const SNOW = 168;
export const FROZEN = 179;

const SEP = {bg: '#E9D3A6', sea: '#C9B184', sea2: '#B89E6E', land: '#9C7A4C', land2: '#7E5F38', ash: '#8B7A64'};

const Swirl: React.FC<{f: number}> = ({f}) => {
  const p = pop(f, 2, {damping: 9}) * lerp(f, [OLD - 4, OLD + 4], [1, 0], ease.in);
  if (p <= 0.01) return null;
  const big = 1 + 0.25 * pop(f, CRAZY, {damping: 6, stiffness: 260});
  const arms = Array.from({length: 8}, (_, i) => {
    const a0 = (i / 8) * Math.PI * 2;
    const pts: string[] = ['0,0'];
    for (let k = 0; k <= 20; k++) {
      const t = k / 20;
      const a = a0 + t * 4.2;
      pts.push(`${Math.cos(a) * t * 420},${Math.sin(a) * t * 420}`);
    }
    for (let k = 20; k >= 0; k--) {
      const t = k / 20;
      const a = a0 + Math.PI / 8 + t * 4.2;
      pts.push(`${Math.cos(a) * t * 420},${Math.sin(a) * t * 420}`);
    }
    return <polygon key={i} points={pts.join(' ')} fill={i % 2 ? C.red : C.cream} />;
  });
  return (
    <g transform={`translate(540 960) scale(${p * big}) rotate(${f * 14})`}>
      <circle r={430} fill={C.cream} filter="url(#ppl)" />
      <g filter="url(#pp)">{arms}</g>
      {[0, 1, 2, 3, 4].map((k) => (
        <Sparkle key={k} x={Math.cos(k * 1.26 - f * 0.2) * 520} y={Math.sin(k * 1.26 - f * 0.2) * 520} frame={f} size={34} />
      ))}
    </g>
  );
};

const Old: React.FC<{f: number}> = ({f}) => {
  const p = pop(f, OLD, {damping: 11, stiffness: 220});
  if (p <= 0) return null;
  const ghost = pop(f, GHOST, {damping: 8, stiffness: 180});
  const plume = lerp(f, [ERUPT, ERUPT + 26], [0, 1], ease.out);
  const cam = camera(
    f,
    [
      {f: OLD, x: 520, y: 1260, z: 1.3},
      {f: 80, x: 520, y: 1220, z: 1.22},
      {f: 96, x: 540, y: 960, z: 0.9},
      {f: CUT, x: 540, y: 960, z: 0.94},
    ],
    [
      [ERUPT + 1, 26],
      [GHOST + 2, 8],
    ],
  );
  return (
    <g transform={`translate(540 960) scale(${0.6 + 0.4 * p}) rotate(${(1 - p) * 10}) translate(-540 -960)`} opacity={Math.min(1, p * 1.5)}>
      <g transform={cam}>
        <rect x={-900} y={-900} width={2900} height={3800} fill={SEP.bg} />
        {/* la silhouette fantôme de Yellowstone : bien plus grande */}
        {ghost > 0 && (
          <g transform={`translate(540 1420) scale(${ghost})`}>
            <path
              d="M -150 0 C -170 -300 -120 -700 -90 -1000 C -400 -1050 -560 -1150 -520 -1300 C -480 -1420 -300 -1400 -200 -1380 C -150 -1500 150 -1500 200 -1380 C 300 -1400 480 -1420 520 -1300 C 560 -1150 400 -1050 90 -1000 C 120 -700 170 -300 150 0 Z"
              fill={V.ash4}
              opacity={0.35}
              stroke={C.ink}
              strokeWidth={10}
              strokeDasharray="34 24"
            />
          </g>
        )}
        <g filter="url(#ppl)">
          <rect x={-900} y={1380} width={2900} height={1600} fill={SEP.sea} />
          {Array.from({length: 8}, (_, i) => (
            <path key={i} d={`M ${-200 + i * 200 + ((f * 3) % 200)} ${1470 + (i % 3) * 70} q 40 -26 80 0`} stroke={SEP.sea2} strokeWidth={10} fill="none" />
          ))}
        </g>
        {/* Tambora, petite île volcanique */}
        {plume > 0 && (
          <g filter="url(#ppl)">
            <Billow frame={f} seed="tb" pts={[0, 1, 2, 3, 4].map((k) => [540 + k * 8, 1300 - k * 70 * plume, 60 + k * 16] as const)} />
          </g>
        )}
        <g transform="translate(540 1420)" filter="url(#ppl)">
          <path d="M -380 20 Q -200 -40 0 -30 Q 200 -40 380 20 Z" fill={SEP.land2} />
          <Volcano w={420} h={130} c={SEP.land} c2={SEP.land2} glow={f >= ERUPT ? 1 : 0} />
        </g>
        <Boom x={540} y={1290} size={70} frame={f} start={ERUPT} seed="tb" life={20} />
        {/* un vieux trois-mâts */}
        <g transform={`translate(${880 - f * 0.6} 1440)`} filter="url(#pp)">
          <path d="M -80 0 L 80 0 L 60 30 L -60 30 Z" fill={SEP.land2} />
          <rect x={-4} y={-150} width={8} height={150} fill={SEP.land2} />
          <path d="M 4 -140 Q 60 -100 4 -40 Z" fill={C.cream} />
          <path d="M -4 -130 Q -60 -90 -4 -40 Z" fill={C.cream} />
        </g>
      </g>
      {/* cadre de vieille photo */}
      <g filter="url(#pp)">
        <path d="M 0 0 H 1080 V 1920 H 0 Z M 40 40 V 1880 H 1040 V 40 Z" fill={SEP.land2} fillRule="evenodd" />
        <path d="M 40 40 H 1040 V 1880 H 40 Z M 56 56 V 1864 H 1024 V 56 Z" fill={C.cream} fillRule="evenodd" />
      </g>
    </g>
  );
};

const Beach: React.FC<{f: number}> = ({f}) => {
  const cam = camera(
    f,
    [
      {f: CUT, x: 540, y: 1040, z: 1.08},
      {f: 160, x: 540, y: 1000, z: 1.0},
      {f: FROZEN, x: 560, y: 1060, z: 1.08},
      {f: 201, x: 560, y: 1080, z: 1.12},
    ],
    [
      [CLOUDS + 4, 6],
      [FROZEN + 1, 18],
    ],
  );
  const grey = lerp(f, [CLOUDS, FROZEN], [0, 1], ease.inOut);
  const sky = interpolateColors(grey, [0, 1], ['#8FD0F2', '#9AA0A8']);
  const sea = interpolateColors(grey, [0, 1], [V.sea, V.ice]);
  const cl = lerp(f, [CLOUDS, CLOUDS + 12], [0, 1], ease.out);
  const snow = pop(f, FROZEN, {damping: 10, stiffness: 200});
  return (
    <g transform={cam}>
      <rect x={-900} y={-900} width={2900} height={3800} fill={sky} />
      <g transform="translate(760 520)">
        <Rays cx={0} cy={0} n={14} color={C.yellow} rot={f * 1.5} r={420} opacity={0.5 * (1 - grey)} />
        <circle r={120} fill={C.yellow} filter="url(#pp)" />
      </g>
      {/* les nuages gris cachent le soleil */}
      {cl > 0 && (
        <g filter="url(#ppl)">
          <g transform={`translate(${-500 + cl * 1000} 470) scale(2.2)`}>
            <Cloud fill="#AEB3BC" />
          </g>
          <g transform={`translate(${1500 - cl * 900} 560) scale(2.4)`}>
            <Cloud fill="#959BA5" />
          </g>
          <g transform={`translate(${-700 + cl * 1000} 640) scale(1.8)`}>
            <Cloud fill="#C3C7CE" />
          </g>
          <rect x={-900} y={-900} width={2900} height={1300} fill="#8E939C" opacity={cl * 0.6} />
        </g>
      )}
      <g filter="url(#ppl)">
        <rect x={-900} y={1060} width={2900} height={300} fill={sea} />
        {Array.from({length: 7}, (_, i) => (
          <path key={i} d={`M ${-100 + i * 200 + Math.sin(f * 0.1) * 30} ${1130 + (i % 2) * 80} q 40 -24 80 0`} stroke={C.white} strokeWidth={9} fill="none" opacity={1 - grey * 0.7} />
        ))}
        <path d="M -900 1300 Q 300 1250 1080 1310 T 2000 1300 L 2000 2900 L -900 2900 Z" fill={V.sand} />
        <path d="M -900 1300 Q 300 1250 1080 1310 T 2000 1300 L 2000 2900 L -900 2900 Z" fill={C.snow} opacity={snow} />
      </g>
      <g filter="url(#pp)">
        <g transform="translate(330 1640)">
          <Parasol snow={snow} />
        </g>
        <rect x={400} y={1560} width={320} height={130} rx={10} fill={C.sky} transform="rotate(-6 560 1620)" />
        <rect x={400} y={1600} width={320} height={26} fill={C.white} transform="rotate(-6 560 1620)" />
        <g transform="translate(800 1700)">
          <Sandcastle snow={snow} />
        </g>
        <g transform={`translate(560 ${1780}) rotate(${f * 2})`}>
          <circle r={58} fill={C.white} />
          <path d="M 0 -58 A 58 58 0 0 1 58 0 L 0 0 Z" fill={C.red} />
          <path d="M 0 58 A 58 58 0 0 1 -58 0 L 0 0 Z" fill={C.yellow} />
        </g>
      </g>
      <Fall frame={f} start={SNOW} n={130} seed="bsnow" area={[-400, -200, 1900, 2300]} color={C.snow} size={9} speed={8} fadeIn={8} />
      {snow > 0 &&
        [0, 1, 2].map((k) => (
          <polygon key={k} points={starPoints(6, 30, 12, `fl${k}`)} transform={`translate(${200 + k * 340} ${760 + (k % 2) * 160}) rotate(${f * 4}) scale(${snow})`} fill={C.white} />
        ))}
    </g>
  );
};

// 0:36–0:42 — 1816 : la petite éruption du Tambora a déjà supprimé un été
export const S7Tambora: React.FC = () => {
  const f = useFrame();
  const slide = lerp(f, [CUT - 4, CUT + 6], [0, 1], ease.inOut);
  return (
    <Stage bg={C.kraft}>
      {slide < 1 && (
        <g transform={`translate(0 ${-slide * 1920})`}>
          <rect x={0} y={0} width={1080} height={1920} fill={C.kraft} />
          {f < OLD + 6 && <Rays cx={540} cy={960} n={18} color={C.cream} rot={-f} opacity={0.6} />}
          <Swirl f={f} />
          <Old f={f} />
        </g>
      )}
      {slide > 0 && (
        <g transform={`translate(0 ${(1 - slide) * 1920})`}>
          <Beach f={f} />
        </g>
      )}
    </Stage>
  );
};

