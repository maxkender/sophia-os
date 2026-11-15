import React from 'react';
import {C, ease, lerp, pop, useFrame} from '../lib';
import {Stage} from '../Stage';
import {Arrow, LowBubbles} from '../avion';
import {CielProfil, Profil} from './Profil';
import {TILT_DEG} from './S4Aile';

// « Plus, air rushes faster over the top, so pressure drops up there, and that's lift. »
export const FASTER = 38;
export const BUBBLES = 70;
export const DROPS = 90;
export const LIFT = 136;

export const S7Pression: React.FC = () => {
  const f = useFrame();
  // l'air du dessus accélère : 14 px/image, puis 40 à partir de « faster »
  const vite = lerp(f, [FASTER - 4, FASTER + 8], [0, 1], ease.inOut);
  const offsetTop = f * 14 + Math.max(0, f - FASTER) * 26 * vite;
  const k = lerp(f, [BUBBLES, BUBBLES + 12], [0, 1], ease.out) * (f >= DROPS ? lerp(f, [DROPS, DROPS + 5, DROPS + 14], [1, 1.45, 1.2], ease.out) : 1);
  const nudge = f >= DROPS ? lerp(f, [DROPS, DROPS + 6], [0, -30], ease.back) : 0;
  const fly = lerp(f, [LIFT + 2, 158], [0, -1300], ease.in);
  const arrow = pop(f, LIFT - 4, {damping: 9});
  return (
    <Stage bg={C.sky}>
      <CielProfil id="s7sky" />
      {/* en miroir : bord d'attaque à droite, comme le nez de l'avion */}
      <g transform="translate(1080 0) scale(-1 1)">
        <Profil
          id="s7"
          f={f + 257}
          y={880 + nudge}
          tilt={TILT_DEG}
          down={1}
          offsetTop={offsetTop + 257 * 14}
          offsetBottom={(f + 257) * 14}
          topColor={vite > 0.5 ? '#9ED2F7' : undefined}
          opacity={lerp(f, [LIFT + 4, 150], [1, 0.35])}
          aile={fly > -2}
        >
          <g transform={`translate(0 ${fly})`}>
            <LowBubbles frame={f} k={k} seed="s7b" />
          </g>
        </Profil>
        {/* l'aile qui s'envole : un second profil par-dessus, qui monte */}
        {fly < -2 && (
          <g transform={`translate(0 ${fly})`}>
            <Profil id="s7v" f={f} y={880 + nudge} tilt={TILT_DEG} down={1} reveal={() => 0} glow={0.6} />
          </g>
        )}
      </g>
      {/* la flèche « lift », pleine, qui part avec l'aile */}
      {arrow > 0 && (
        <g transform={`translate(540 ${880 + nudge - 140 + fly}) rotate(-90) scale(${arrow})`} filter="url(#pp)">
          <Arrow len={360} w={84} />
        </g>
      )}
    </Stage>
  );
};
