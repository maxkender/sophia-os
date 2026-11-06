import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import type {TransitionPresentation} from '@remotion/transitions';
import {lerp, step} from './lib';
import {S1Hook} from './scenes/S1Hook';
import {S2Alps} from './scenes/S2Alps';
import {S3Neutral} from './scenes/S3Neutral';
import {S4Army} from './scenes/S4Army';
import {S5Tunnel} from './scenes/S5Tunnel';
import {S6Useful} from './scenes/S6Useful';
import {S7Punch} from './scenes/S7Punch';
import {Outro} from './scenes/Outro';
import {tear, whip} from './transitions';

const T = 10;
// Coupes calées sur le script (récit ralenti ×1,2) : 3,6 s · 8,4 s · 13,2 s · 19,2 s · 26,4 s · 31,2 s · 36 s,
// puis 9 s de séquence Sophia (total 45 s)
export const SCENES = [
  {id: 'S1-Accroche', d: 113, C: S1Hook},
  {id: 'S2-Alpes', d: 154, C: S2Alps},
  {id: 'S3-Neutralite', d: 154, C: S3Neutral},
  {id: 'S4-Armee', d: 190, C: S4Army},
  {id: 'S5-Tunnels', d: 226, C: S5Tunnel},
  {id: 'S6-Utile', d: 154, C: S6Useful},
  {id: 'S7-Chute', d: 154, C: S7Punch},
  {id: 'S8-Sophia', d: 275, C: Outro},
] as const;
export const OUTRO_START = SCENES.slice(0, -1).reduce((a, s) => a + s.d, 0) - T * (SCENES.length - 1);
export const TOTAL = SCENES.reduce((a, s) => a + s.d, 0) - T * (SCENES.length - 1);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRESENTATIONS: TransitionPresentation<any>[] = [
  tear({seed: 'a', tilt: 6}),
  whip({dir: 'left'}),
  tear({seed: 'b', tilt: -7}),
  whip({dir: 'up'}),
  tear({seed: 'c', tilt: 5}),
  whip({dir: 'right'}),
  tear({seed: 'd', tilt: -5}),
];

/** Grain de papier + vignette par-dessus tout */
export const Paper: React.FC = () => {
  const f = useCurrentFrame();
  const st = step(f, 4);
  const ox = ((st * 37) % 40) - 20;
  const oy = ((st * 53) % 40) - 20;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Img
        src={staticFile('grain.jpg')}
        style={{position: 'absolute', width: 1140, height: 2000, left: -30 + ox, top: -40 + oy, mixBlendMode: 'overlay', opacity: lerp(f, [OUTRO_START, OUTRO_START + 12], [0.55, 0.25])}}
      />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(60,38,15,0.32) 100%)'}} />
    </AbsoluteFill>
  );
};

export const Main: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: '#E9DCC3'}}>
    <TransitionSeries>
      {SCENES.flatMap((s, i) => {
        const seq = (
          <TransitionSeries.Sequence key={s.id} name={s.id} durationInFrames={s.d}>
            <s.C />
          </TransitionSeries.Sequence>
        );
        if (i === SCENES.length - 1) return [seq];
        return [seq, <TransitionSeries.Transition key={`t${i}`} presentation={PRESENTATIONS[i]} timing={linearTiming({durationInFrames: T})} />];
      })}
    </TransitionSeries>
    <Paper />
  </AbsoluteFill>
);
