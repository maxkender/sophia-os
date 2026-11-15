import React from 'react';
import {random} from 'remotion';
import {geoOrthographic, geoPath, geoGraticule10} from 'd3-geo';
import {feature} from 'topojson-client';
import type {Topology} from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Rays} from '../shapes';
import {Stage} from '../Stage';
import {Billow, Calendar, V} from '../volcan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LAND = feature(land110 as unknown as Topology, (land110 as any).objects.land);
const GRAT = geoGraticule10();
const GX = 540;
const GY = 1200;
const R = 330;
const SUN: [number, number] = [540, 330];

export const TEARS = [11, 15, 19, 23, 27];
export const SULFUR = 35;
export const VEIL = 58;
export const DIM = 72;

// 0:25–0:29 — en quelques semaines, le soufre voile le Soleil sur toute la planète
export const S5Veil: React.FC = () => {
  const f = useFrame();
  const proj = geoOrthographic()
    .scale(R)
    .translate([GX, GY])
    .rotate([110 - f * 0.9, -30]);
  const path = geoPath(proj);
  const ys = proj([-110.6, 44.4]) ?? [GX, GY - R];
  const ang = Math.atan2(ys[1] - GY, ys[0] - GX);
  const cam = camera(
    f,
    [
      {f: 0, x: 540, y: 1150, z: 1.12},
      {f: 40, x: 540, y: 1120, z: 1.08},
      {f: 72, x: 540, y: 900, z: 0.94},
      {f: 130, x: 540, y: 880, z: 0.9},
    ],
    [
      [SULFUR + 1, 8],
      [VEIL + 8, 10],
      [DIM + 1, 12],
    ],
  );
  const span = lerp(f, [SULFUR + 4, VEIL + 10], [0, 1], ease.inOut);
  const ringR = R + 48;
  const circ = 2 * Math.PI * ringR;
  const veil = lerp(f, [VEIL - 6, VEIL + 14], [0, 0.42]);
  const dim = lerp(f, [DIM, DIM + 18], [0, 1], ease.out);
  const dark = lerp(f, [DIM, 120], [0, 0.32]);
  const sunP = pop(f, 2, {damping: 10});
  const cal = pop(f, 4, {damping: 9}) * lerp(f, [34, 42], [1, 0], ease.in);
  const plumeQ = lerp(f, [SULFUR, SULFUR + 14], [0, 1], ease.out);
  const beams = [-150, -75, 0, 75, 150];
  return (
    <Stage bg={V.space}>
      <g transform={cam}>
        <rect x={-900} y={-900} width={2900} height={3800} fill={V.space} />
        {Array.from({length: 70}, (_, i) => (
          <circle
            key={i}
            cx={-300 + random(`x${i}`) * 1700}
            cy={-300 + random(`y${i}`) * 2500}
            r={2 + random(`r${i}`) * 4}
            fill={C.cream}
            opacity={0.4 + 0.5 * Math.abs(Math.sin(f * 0.1 + i))}
          />
        ))}
        {/* le Soleil */}
        <g transform={`translate(${SUN[0]} ${SUN[1]}) scale(${sunP * (1 - dim * 0.15)})`}>
          <Rays cx={0} cy={0} n={14} color={C.yellow} rot={f * 0.8} r={220} opacity={0.55 - dim * 0.42} />
          <circle r={120} fill={dim > 0.5 ? '#CFC59B' : C.yellow} filter="url(#pp)" />
          <circle r={120} fill="#CFC59B" opacity={dim} />
        </g>
        {/* rayons vers la Terre : arrêtés et renvoyés par le voile une fois qu'il est là */}
        {beams.map((dx, i) => {
          const x0 = SUN[0] + dx * 0.5;
          const x1 = GX + dx * 1.4;
          const yStop = GY - Math.sqrt(Math.max(0, (ringR + 30) ** 2 - (x1 - GX) ** 2));
          const yEnd = f < DIM ? GY - Math.sqrt(Math.max(0, R ** 2 - (x1 - GX) ** 2)) : yStop;
          const back = lerp(f, [DIM + 2 + i, DIM + 14 + i], [0, 1], ease.out);
          return (
            <g key={i} opacity={sunP}>
              <polygon points={`${x0 - 14},${SUN[1] + 120} ${x0 + 14},${SUN[1] + 120} ${x1 + 22},${yEnd} ${x1 - 22},${yEnd}`} fill={C.yellow} opacity={0.5 - dim * 0.15} />
              {back > 0 && (
                <g transform={`translate(${x1} ${yStop}) rotate(${dx * 0.12})`} opacity={1 - back * 0.3}>
                  <rect x={-10} y={-back * 260} width={20} height={back * 260} fill={C.yellow} opacity={0.75} />
                  <polygon points={`-26,${-back * 260} 26,${-back * 260} 0,${-back * 260 - 40}`} fill={C.yellow} />
                </g>
              )}
            </g>
          );
        })}
        {/* la Terre */}
        <g filter="url(#ppl)">
          <circle cx={GX} cy={GY} r={R} fill="#4E8FC8" />
          <path d={path(GRAT) ?? ''} fill="none" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={2} />
          <path d={path(LAND) ?? ''} fill={C.grass} stroke="#4E7A3F" strokeWidth={2} />
          <circle cx={GX - 90} cy={GY - 110} r={R * 0.55} fill="#FFFFFF" opacity={0.1} />
          <circle cx={GX} cy={GY} r={R} fill={V.sulfur} opacity={veil} />
          <circle cx={GX} cy={GY} r={R} fill="#000" opacity={dark} />
        </g>
        {/* le panache de soufre */}
        {plumeQ > 0 && (
          <g transform={`translate(${ys[0]} ${ys[1]}) rotate(${(ang * 180) / Math.PI + 90})`} opacity={0.95}>
            <Billow frame={f} seed="sp" pts={[0, 1, 2, 3].map((k) => [0, -k * 30 * plumeQ, 26 + k * 10] as const)} />
          </g>
        )}
        {/* le voile qui fait le tour du monde */}
        {span > 0 && (
          <g transform={`rotate(${(ang * 180) / Math.PI - span * 180} ${GX} ${GY})`} filter="url(#pp)">
            <circle cx={GX} cy={GY} r={ringR + 10} fill="none" stroke={V.sulfur} strokeWidth={120} strokeLinecap="round" strokeDasharray={`${span * circ} ${circ}`} opacity={0.35} />
            <circle cx={GX} cy={GY} r={ringR} fill="none" stroke={V.sulfur} strokeWidth={62} strokeLinecap="round" strokeDasharray={`${span * circ} ${circ}`} opacity={0.7} />
            <circle cx={GX} cy={GY} r={ringR + 14} fill="none" stroke="#EDE2A4" strokeWidth={14} strokeLinecap="round" strokeDasharray={`${span * circ * 0.98} ${circ}`} opacity={0.7} />
          </g>
        )}
      </g>
      {cal > 0.01 && (
        <g transform={`translate(880 300) scale(${cal * 0.85})`}>
          <Calendar frame={f} tears={TEARS} />
        </g>
      )}
    </Stage>
  );
};
