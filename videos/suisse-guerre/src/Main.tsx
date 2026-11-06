import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import type {TransitionPresentation} from '@remotion/transitions';
import {lerp, step, WarpContext} from './lib';
import {S1Hook} from './scenes/S1Hook';
import {S2Alps} from './scenes/S2Alps';
import {S3Neutral} from './scenes/S3Neutral';
import {S4Army} from './scenes/S4Army';
import {S5Tunnel} from './scenes/S5Tunnel';
import {S6Useful} from './scenes/S6Useful';
import {S7Punch} from './scenes/S7Punch';
import {Outro} from './scenes/Outro';
import {tear, whip} from './transitions';
import {OUTRO_D, T, TimelineContext, timelineDe, useTimeline} from './timeline';
import {Sound} from './Sound';
import {Captions} from './Captions';

// Les scènes du récit ; leur durée et leur rythme viennent de la voix (timeline.ts)
export const SCENES = [
  {id: 'S1-Accroche', C: S1Hook, base: 94},
  {id: 'S2-Alpes', C: S2Alps, base: 128},
  {id: 'S3-Neutralite', C: S3Neutral, base: 128},
  {id: 'S4-Armee', C: S4Army, base: 158},
  {id: 'S5-Tunnels', C: S5Tunnel, base: 188},
  {id: 'S6-Utile', C: S6Useful, base: 128},
  {id: 'S7-Chute', C: S7Punch, base: 124},
] as const;

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
  const {outroFrom} = useTimeline();
  const st = step(f, 4);
  const ox = ((st * 37) % 40) - 20;
  const oy = ((st * 53) % 40) - 20;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Img
        src={staticFile('grain.jpg')}
        style={{
          position: 'absolute',
          width: 1140,
          height: 2000,
          left: -30 + ox,
          top: -40 + oy,
          mixBlendMode: 'overlay',
          opacity: lerp(f, [outroFrom, outroFrom + 12], [0.55, 0.25]),
        }}
      />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(60,38,15,0.32) 100%)'}} />
    </AbsoluteFill>
  );
};

const Film: React.FC = () => {
  const {scenes} = useTimeline();
  return (
    <TransitionSeries>
      {SCENES.flatMap((s, i) => [
        <TransitionSeries.Sequence key={s.id} name={s.id} durationInFrames={scenes[i].d}>
          <WarpContext.Provider value={scenes[i].warp}>
            <s.C />
          </WarpContext.Provider>
        </TransitionSeries.Sequence>,
        <TransitionSeries.Transition key={`t${i}`} presentation={PRESENTATIONS[i]} timing={linearTiming({durationInFrames: T})} />,
      ])}
      <TransitionSeries.Sequence name="S8-Sophia" durationInFrames={OUTRO_D}>
        <Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};

export type PropsVideo = {langue: string; sousTitres: boolean};

/** Vidéo finale d'une langue : voix, bruitages et (au choix) sous-titres */
export const Main: React.FC<PropsVideo> = ({langue, sousTitres}) => (
  <TimelineContext.Provider value={timelineDe(langue)}>
    <AbsoluteFill style={{backgroundColor: '#E9DCC3'}}>
      <Film />
      <Paper />
      {sousTitres && <Captions />}
      <Sound />
    </AbsoluteFill>
  </TimelineContext.Provider>
);
