import React from 'react';
import {interpolate, random} from 'remotion';
import {C, cl, ease, lerp, pop, shake, useFrame} from '../lib';
import {Boom, Debris, Mountain} from '../shapes';
import {Stage} from '../Stage';
import {Billow, Car, Embers, Pine, V, Volcano, blob} from '../volcan';

const ROAD = 1400;
const VX = 420;
export const ERUPT = 8;
export const CLOUDS = 40;
export const RACE = 72;
export const SWALLOW = 118;
const CUT = 126;
export const RINGS = [145, 156, 173];
export const COVER = 195;
export const CHANCE = 214;

const carX = (f: number) => 1500 + 22 * (f - 60);
const frontX = (f: number) =>
  interpolate(f, [CLOUDS, 60, 76, 100, 116, 124, 140], [VX + 100, 1050, 1500, 2250, 2800, 3200, 3700], {...cl, easing: ease.linear});

const wall = (front: number) => {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const u = i / 23;
    const r = 230 - u * 70 + random(`w${i}`) * 70;
    const x = front - Math.pow(1 - u, 1.15) * 2400 - 120;
    const y = ROAD + 40 - r * 0.45 - random(`wy${i}`) * (650 * (1 - u) + 140);
    pts.push([x, y, r]);
  }
  pts.push([front - 140, ROAD - 120, 200]);
  pts.push([front - 60, ROAD - 10, 130]);
  return pts;
};

const plume = (top: number) => {
  const pts: [number, number, number][] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const y = 980 + (top - 980) * u;
    pts.push([VX + (random(`p${i}`) - 0.5) * 80 + u * 60, y, 90 + u * 150]);
  }
  return pts;
};

// --- Vue du dessus : tout ce qui est à des dizaines de kilomètres
const CX = 540;
const CY = 960;
const TOWNS = Array.from({length: 11}, (_, i) => {
  const a = (i / 11) * Math.PI * 2 + random(`ta${i}`) * 0.4;
  const d = 170 + random(`td${i}`) * 360;
  return {x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d * 1.1, s: 0.8 + random(`ts${i}`) * 0.5, k: i};
});
const TREES = Array.from({length: 46}, (_, i) => {
  const a = random(`fa${i}`) * Math.PI * 2;
  const d = 130 + random(`fd${i}`) * 720;
  return [CX + Math.cos(a) * d, CY + Math.sin(a) * d * 1.2, 16 + random(`fr${i}`) * 16] as const;
});

const Town: React.FC<{s: number; k: number}> = ({s, k}) => (
  <g transform={`scale(${s})`}>
    {[
      [-26, -18],
      [18, -22],
      [-20, 20],
      [24, 16],
    ].map(([x, y], j) => (
      <g key={j} transform={`translate(${x} ${y}) rotate(${(random(`h${k}${j}`) - 0.5) * 30})`}>
        <rect x={-18} y={-14} width={36} height={28} fill={j % 2 ? C.red : C.wood} />
        <rect x={-18} y={-2} width={36} height={4} fill="#000" opacity={0.25} />
      </g>
    ))}
  </g>
);

const Top: React.FC<{f: number}> = ({f}) => {
  const cover = lerp(f, [COVER, CHANCE + 6], [0, 600], ease.out);
  const sh = shake(f, [
    [COVER + 2, 10],
    [CHANCE + 2, 22],
  ]);
  const z = lerp(f, [CUT, 150, 200, 238], [1.3, 1.08, 0.94, 0.9], ease.inOut);
  return (
    <g transform={`translate(${540 + sh.x} ${960 + sh.y}) rotate(${sh.r - 3}) scale(${z}) translate(${-CX} ${-CY})`}>
      <rect x={-1200} y={-1200} width={3500} height={4400} fill="#CFE0B8" />
      <g filter="url(#pp)">
        <path d={blob(260, 200, 'lac', 12, 0.18)} transform={`translate(${CX + 260} ${CY - 330})`} fill={V.sea} />
        {TOWNS.map((t, i) => (
          <path key={i} d={`M ${CX} ${CY} L ${t.x} ${t.y}`} stroke="#EFE6CF" strokeWidth={14} fill="none" />
        ))}
        {TREES.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i % 3 ? V.pine : C.grassDark} />
        ))}
      </g>
      {TOWNS.map((t, i) => {
        const p = pop(f, 131 + i * 1.6, {damping: 9, stiffness: 240});
        return p > 0 ? (
          <g key={i} transform={`translate(${t.x} ${t.y}) scale(${p})`} filter="url(#pp)">
            <Town s={t.s} k={t.k} />
          </g>
        ) : null;
      })}
      {/* les cercles de distance */}
      {RINGS.map((s, i) => {
        const r = 190 + i * 170;
        const q = pop(f, s, {damping: 10, stiffness: 200});
        if (q <= 0) return null;
        return (
          <g key={i} transform={`translate(${CX} ${CY}) rotate(${f * (i % 2 ? -0.6 : 0.6)}) scale(${q})`}>
            <circle r={r} fill="none" stroke={C.cream} strokeWidth={16} opacity={0.5} />
            <circle r={r} fill="none" stroke={C.ink} strokeWidth={8} strokeDasharray="30 22" opacity={0.75} />
          </g>
        );
      })}
      {/* la nuée recouvre tout */}
      {cover > 0 && (
        <g transform={`translate(${CX} ${CY})`} filter="url(#ppl)">
          <path d={blob(cover + 40, cover + 40, 'cov', 22, 0.08, f * 0.2)} fill={V.lavaHot} opacity={0.85} />
          <path d={blob(cover, cover, 'cov2', 22, 0.08, f * 0.25)} fill={V.ash1} />
          <path d={blob(cover * 0.75, cover * 0.75, 'cov3', 18, 0.1, f * 0.3)} fill={V.ash2} />
          <path d={blob(cover * 0.4, cover * 0.4, 'cov4', 14, 0.12, f * 0.3)} fill={V.ash3} />
        </g>
      )}
      <g transform={`translate(${CX} ${CY})`} filter="url(#pp)">
        <ellipse rx={110} ry={84} fill={V.e5} />
        <path d={blob(70, 52, 'cr', 10, 0.15, f * 0.3)} fill={V.lavaHot} />
        <path d={blob(36, 26, 'cr2', 10, 0.15, f * 0.4)} fill={V.lavaGlow} />
      </g>
    </g>
  );
};

// 0:06–0:13 — la nuée ardente dépasse une voiture, puis recouvre tout sur des dizaines de km
export const S2Flow: React.FC = () => {
  const f = useFrame();
  const car = carX(f);
  const front = frontX(f);
  const follow = lerp(f, [50, 74], [0, 1], ease.inOut);
  const camX = 560 * (1 - follow) + (car - 160) * follow;
  const z = lerp(f, [0, 30, 74, 110, 124], [0.98, 0.94, 0.92, 1.0, 1.08], ease.inOut);
  const sh = shake(f, [
    [ERUPT + 2, 34],
    [CLOUDS + 2, 12],
    [RACE + 4, 6],
    [SWALLOW, 26],
  ]);
  const slide = lerp(f, [CUT - 4, CUT + 6], [0, 1], ease.inOut);
  const eruptP = lerp(f, [ERUPT, 44], [0, 1], ease.out);
  const top = 980 - eruptP * 1300;
  const dark = lerp(f, [CLOUDS, 120], [0, 0.55]);
  const swallowed = f > SWALLOW + 4;
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s2sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9FCFEA" />
          <stop offset="1" stopColor={C.skyLight} />
        </linearGradient>
      </defs>
      {slide < 1 && (
        <g transform={`translate(0 ${-slide * 1920})`}>
          <g transform={`translate(${540 + sh.x} ${960 + sh.y}) rotate(${sh.r}) scale(${z}) translate(${-camX} -1020)`}>
            <rect x={camX - 1400} y={-400} width={2800} height={2000} fill="url(#s2sky)" />
            <rect x={camX - 1400} y={-400} width={2800} height={2000} fill={V.ash1} opacity={dark} />
            {/* montagnes lointaines (parallaxe) */}
            <g transform={`translate(${camX * 0.7} 0)`} filter="url(#ppl)">
              {[-1, 0, 1, 2].map((k) => (
                <Mountain key={k} pts={[[-200 + k * 1000, 1320], [100 + k * 1000, 1020], [380 + k * 1000, 1180], [620 + k * 1000, 960], [900 + k * 1000, 1320]]} fill={C.m1} />
              ))}
            </g>
            {/* panache du volcan */}
            {f >= ERUPT && (
              <g filter="url(#ppl)">
                <Billow frame={f} seed="pl" pts={plume(top)} glow={0.6} dark />
              </g>
            )}
            <g transform={`translate(${VX} 1330)`} filter="url(#ppl)">
              <Volcano w={1100} h={360} glow={f >= ERUPT ? 1 : 0.3} />
            </g>
            <Boom x={VX} y={980} size={170} frame={f} start={ERUPT} seed="er" life={26} />
            <Debris x={VX} y={980} frame={f} start={ERUPT + 1} n={18} seed="er" colors={[V.e5, V.ash0, V.lava]} speed={30} size={30} spread={1.8} rocks />
            {/* sol, route, arbres */}
            <g filter="url(#pp)">
              <rect x={camX - 1400} y={1300} width={2800} height={900} fill={C.grass} />
              {Array.from({length: 22}, (_, i) => {
                const x = 700 + i * 230;
                return Math.abs(x - camX) < 1300 ? (
                  <g key={i} transform={`translate(${x} 1352)`}>
                    <Pine h={170 + (i % 3) * 40} c={i % 2 ? V.pine : V.pineDark} />
                  </g>
                ) : null;
              })}
              <rect x={camX - 1400} y={ROAD - 50} width={2800} height={110} fill="#55545C" />
              {Array.from({length: 40}, (_, i) => {
                const x = Math.floor(camX / 160) * 160 + (i - 20) * 160;
                return <rect key={i} x={x} y={ROAD - 2} width={80} height={10} fill={C.cream} />;
              })}
              <rect x={camX - 1400} y={ROAD + 60} width={2800} height={900} fill={C.grassDark} />
              {/* clôture et buissons du premier plan : ils filent avec la vitesse */}
              {Array.from({length: 40}, (_, i) => {
                const x = Math.floor(camX / 140) * 140 + (i - 20) * 140;
                return <rect key={`f${i}`} x={x} y={ROAD + 96} width={16} height={90} rx={4} fill={C.woodDark} />;
              })}
              <rect x={camX - 1400} y={ROAD + 116} width={2800} height={12} fill={C.wood} />
              <rect x={camX - 1400} y={ROAD + 150} width={2800} height={12} fill={C.wood} />
              {Array.from({length: 16}, (_, i) => {
                const x = Math.floor(camX / 380) * 380 + (i - 8) * 380 + (i % 3) * 60;
                return <ellipse key={`b${i}`} cx={x} cy={ROAD + 330 + (i % 2) * 90} rx={90} ry={50} fill={C.grass} />;
              })}
            </g>
            {/* la voiture */}
            {f >= 48 && !swallowed && (
              <g transform={`translate(${car} ${ROAD + 46 + Math.sin(f * 1.4) * 3}) rotate(${Math.sin(f * 0.9) * 1.2})`} filter="url(#pp)">
                {[0, 1, 2].map((k) => (
                  <rect key={k} x={-260 - k * 40 - ((f * 30) % 60)} y={-140 + k * 36} width={110} height={10} rx={5} fill={C.white} opacity={0.8} />
                ))}
                <Car spin={f * 40} />
              </g>
            )}
            {/* la nuée ardente */}
            {f >= CLOUDS && (
              <g filter="url(#ppl)">
                <Billow frame={f} seed="wall" pts={wall(front)} glow={lerp(f, [CLOUDS, 60], [0.4, 0.95])} />
                <Embers frame={f} x={front - 500} y={ROAD - 40} w={520} seed="emb" n={22} />
              </g>
            )}
          </g>
        </g>
      )}
      {slide > 0 && (
        <g transform={`translate(0 ${(1 - slide) * 1920})`}>
          <Top f={f} />
        </g>
      )}
    </Stage>
  );
};
