import React from 'react';
import {C, camera, ease, lerp, pop, useFrame} from '../lib';
import {Sparkle} from '../shapes';
import {Stage} from '../Stage';
import {Airliner} from '../avion';
import {CielProfil, Profil} from './Profil';
import {Spot} from './S3Manuel';

// « Well, it's the wings. They're curved and tilted just a little, so they push air down. »
export const WINGS = 26;
export const MORPH = 40;
export const TILT = 59;
export const FLOW = 68;
export const DOWN = 125;
export const TILT_DEG = 9;

export const S4Aile: React.FC = () => {
  const f = useFrame();
  const glow = lerp(f, [WINGS - 2, WINGS + 4], [0, 1]);
  const morph = lerp(f, [MORPH, MORPH + 14], [0, 1], ease.inOut);
  const dark = 0.88 * (1 - morph);
  const foil = pop(f, MORPH + 8, {damping: 11});
  const tilt = lerp(f, [TILT, TILT + 10], [0, TILT_DEG], ease.back);
  const down = lerp(f, [DOWN - 8, DOWN + 8], [0, 1], ease.inOut);
  // l'aile de l'avion (repère avion : ~ -30, 110) sur laquelle on plonge
  const cam = camera(f, [
    {f: 0, x: 540, y: 960, z: 1.08},
    {f: WINGS, x: 540, y: 960, z: 1.1},
    {f: MORPH + 14, x: 540 - 30 * 0.72, y: 960 + 110 * 0.72, z: 3.2},
  ]);
  return (
    <Stage bg={C.sky}>
      <CielProfil id="s4sky" />
      {morph < 1 && (
        <g transform={cam} opacity={1 - morph}>
          <rect x={-2000} y={-2000} width={5000} height={6000} fill={C.kraft} />
          {/* le bureau de S3, sous le noir : même plan que la fin de S3 */}
          <rect x={-600} y={1320} width={2300} height={1100} fill={C.wood} filter="url(#pp)" />
          <g transform="translate(540 960) scale(0.72)" filter="url(#ppl)">
            <Airliner wingGlow={glow} />
          </g>
          {glow > 0 &&
            [
              [460, 1010],
              [600, 1040],
              [520, 1100],
              [420, 1080],
            ].map(([x, y], i) => <Sparkle key={i} x={x} y={y} frame={f + i * 4} size={26 * glow} color={C.goldLight} />)}
          {/* le projecteur part d'où S3 l'a laissé (centré sur l'avion), puis se resserre sur l'aile */}
          <Spot
            id="s4spot"
            cx={lerp(f, [WINGS - 6, WINGS + 8], [540, 540 - 30 * 0.72], ease.inOut)}
            cy={lerp(f, [WINGS - 6, WINGS + 8], [960, 960 + 100 * 0.72], ease.inOut)}
            r={lerp(f, [WINGS - 6, WINGS + 8], [430, 220], ease.out)}
            dark={dark}
          />
        </g>
      )}
      {/* en miroir : bord d'attaque à droite, comme le nez de l'avion (l'air vient de la droite) */}
      {foil > 0 && (
        <g transform={`translate(1080 0) scale(-1 1) translate(540 880) scale(${foil}) translate(-540 -880)`}>
          <Profil
            id="s4"
            f={f}
            tilt={tilt}
            down={down}
            reveal={(i) => lerp(f, [FLOW + i * 4, FLOW + i * 4 + 26], [0, 1], ease.inOut)}
          />
        </g>
      )}
    </Stage>
  );
};
