import React from 'react';
import {C, ease, lerp, pop, shake, useFrame} from '../lib';
import {Stage} from '../Stage';
import {A, Arrow} from '../avion';
import {CielProfil, Profil} from './Profil';
import {TILT_DEG} from './S4Aile';

// « And when you push air down, it pushes you back up. »
export const PUSH = 24;
export const DOWN = 41;
export const BACK = 80;
export const UP = 92;

export const S5Reaction: React.FC = () => {
  const f = useFrame();
  const lift = lerp(f, [UP - 2, UP + 8], [0, -110], ease.back);
  const sh = shake(f, [[UP, 10]]);
  const up = pop(f, BACK - 2, {damping: 9});
  return (
    <Stage bg={C.sky}>
      <CielProfil id="s5sky" />
      <g transform={`translate(${sh.x} ${sh.y + lift}) rotate(${sh.r} 540 880)`}>
        <Profil id="s5" f={f + 147} tilt={TILT_DEG} down={1}>
          {/* l'aile pousse l'air vers le bas : trois grosses flèches bleues */}
          {[0, 1, 2].map((k) => {
            const p = pop(f, DOWN - 6 + k * 3, {damping: 10});
            if (p <= 0) return null;
            const glisse = lerp(f, [DOWN - 6 + k * 3, 110], [0, 120], ease.linear);
            return (
              <g key={k} transform={`translate(${130 + k * 150} ${150 + glisse}) rotate(90) scale(${p})`} filter="url(#pp)">
                <Arrow len={230} w={56} fill={A.air} edge="#3F86C8" />
              </g>
            );
          })}
          {/* et l'air repousse l'aile vers le haut : la flèche jaune */}
          {up > 0 && (
            <g transform={`translate(-40 ${470 - lerp(f, [BACK, UP + 4], [0, 120], ease.out)}) rotate(-90) scale(${up})`} filter="url(#pp)">
              <Arrow len={330} w={80} />
            </g>
          )}
        </Profil>
      </g>
    </Stage>
  );
};
