import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import type {TransitionPresentation} from '@remotion/transitions';
import {lerp, step, WarpContext} from './lib';
import {S1Sleep} from './scenes/S1Sleep';
import {S2Flow} from './scenes/S2Flow';
import {S3Column} from './scenes/S3Column';
import {S4Ashfall} from './scenes/S4Ashfall';
import {S5Veil} from './scenes/S5Veil';
import {S6Winter} from './scenes/S6Winter';
import {S7Tambora} from './scenes/S7Tambora';
import {S8Calm} from './scenes/S8Calm';
import {Outro} from './scenes/Outro';
import {tear, whip} from './transitions';
import {OUTRO_D, T, TimelineContext, timelineDe, useTimeline} from './timeline';
import {Sound} from './Sound';
import {Captions} from './Captions';

// Les scènes du récit ; leur durée et leur rythme viennent de la voix (timeline.ts)
export const SCENES = [
  {id: 'S1-Sommeil', C: S1Sleep, base: 175},
  {id: 'S2-Nuee', C: S2Flow, base: 238},
  {id: 'S3-Colonne', C: S3Column, base: 148},
  {id: 'S4-Cendres', C: S4Ashfall, base: 233},
  {id: 'S5-Voile', C: S5Veil, base: 130},
  {id: 'S6-Hiver', C: S6Winter, base: 215},
  {id: 'S7-Tambora', C: S7Tambora, base: 201},
  {id: 'S8-Calme', C: S8Calm, base: 251},
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRESENTATIONS: TransitionPresentation<any>[] = [
  tear({seed: 'a', tilt: 6}),
  whip({dir: 'up'}),
  tear({seed: 'b', tilt: -7}),
  whip({dir: 'left'}),
  tear({seed: 'c', tilt: 5}),
  whip({dir: 'right'}),
  whip({dir: 'up'}),
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
      <TransitionSeries.Sequence name="S9-Sophia" durationInFrames={OUTRO_D}>
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
