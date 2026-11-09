import React from 'react';
import {random} from 'remotion';
import {C, ease, lerp, pop, shake, useFrame} from '../lib';
import {Cloud} from '../shapes';
import {Stage} from '../Stage';
import {A, Airliner, Gauge} from '../avion';

// « But lift needs speed, the engines just push forward, and at around 280 kilometers an hour the wings take over. »
export const SPEED = 31;
export const ENGINES = 58;
export const FORWARD = 83;
export const GAUGE = 104;
export const ROTATE = 192;
export const LIFTOFF = 205;

const GROUND = 1140;
const PS = 0.72;
const PLANE_Y = GROUND - 182 * PS; // roues sur la piste

/** Vitesse de roulage (px/image) */
const vitesse = (f: number) => (f < ENGINES ? 0.6 : f < FORWARD ? lerp(f, [ENGINES, FORWARD], [0.6, 7]) : lerp(f, [FORWARD, ROTATE], [7, 46], ease.in));
const distance = (f: number) => {
  let d = 0;
  for (let k = 0; k < Math.floor(f); k++) d += vitesse(k);
  return d;
};

export const S8Decollage: React.FC = () => {
  const f = useFrame();
  const dist = distance(f);
  const rot = lerp(f, [ROTATE, ROTATE + 12], [0, -11], ease.inOut);
  const climb = lerp(f, [LIFTOFF - 4, 240], [0, -330], ease.in);
  const thrust = lerp(f, [ENGINES - 2, ENGINES + 8, FORWARD - 2, FORWARD + 6], [0, 0.4, 0.4, 1]);
  const gauge = pop(f, GAUGE, {damping: 10});
  const needle = lerp(f, [GAUGE + 4, 186], [0.05, 0.86], ease.inOut);
  const sh = shake(f, [[FORWARD, 8]]);
  const px = 470;
  return (
    <Stage bg={C.sky}>
      <defs>
        <linearGradient id="s8sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6FB3E6" />
          <stop offset="1" stopColor="#E3F2FB" />
        </linearGradient>
      </defs>
      <rect width={1080} height={1920} fill="url(#s8sky)" />
      <g transform={`translate(${sh.x} ${sh.y})`}>
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${((i * 560 - dist * 0.15) % 2240 + 2240) % 2240 - 400} ${260 + (i % 2) * 220}) scale(${0.9 - (i % 2) * 0.2})`} filter="url(#pp)">
            <Cloud />
          </g>
        ))}
        {/* herbe et piste */}
        <rect x={0} y={GROUND - 40} width={1080} height={900} fill={C.grass} filter="url(#pp)" />
        <rect x={0} y={GROUND - 12} width={1080} height={120} fill={A.runway} />
        <line x1={-200} y1={GROUND + 50} x2={1300} y2={GROUND + 50} stroke={C.cream} strokeWidth={14} strokeDasharray="120 90" strokeDashoffset={dist} />
        {Array.from({length: 6}, (_, i) => {
          const x = ((i * 260 - dist * 1.0) % 1560 + 1560) % 1560 - 200;
          return <rect key={i} x={x} y={GROUND - 30} width={26} height={18} rx={4} fill={i % 2 ? C.red : C.yellow} />;
        })}
        {/* souffle des réacteurs (repère avion : -20,150 et -150,175 ; sortie à gauche) */}
        {thrust > 0 &&
          [
            [-90, 150],
            [-220, 175],
          ].map(([ex, ey], j) => (
            <g key={j} transform={`translate(${px + ex * PS} ${PLANE_Y + climb + ey * PS})`}>
              {Array.from({length: 7}, (_, k) => {
                const t = ((f * (0.6 + thrust) + k * 6 + j * 3) % 42) / 42;
                return (
                  <line
                    key={k}
                    x1={-t * 520 * thrust}
                    x2={-t * 520 * thrust - 60 - 80 * thrust}
                    y1={(random(`j${j}${k}`) - 0.5) * 24}
                    y2={(random(`j${j}${k}`) - 0.5) * 24}
                    stroke={k % 2 ? C.orange : C.white}
                    strokeWidth={12 * (1 - t)}
                    strokeLinecap="round"
                    opacity={0.9 * (1 - t)}
                  />
                );
              })}
            </g>
          ))}
        <g transform={`translate(${px} ${PLANE_Y + climb}) rotate(${rot}) scale(${PS})`} filter="url(#ppl)">
          <Airliner gear={1} glow={thrust} />
        </g>
      </g>
      {gauge > 0 && (
        <g transform={`translate(820 360) scale(${gauge})`} filter="url(#ppl)">
          <Gauge value={needle} r={150} />
        </g>
      )}
    </Stage>
  );
};
