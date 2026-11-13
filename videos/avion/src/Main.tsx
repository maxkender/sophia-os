import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import type {TransitionPresentation} from '@remotion/transitions';
import {lerp, step, WarpContext} from './lib';
import {S1Poids} from './scenes/S1Poids';
import {S2Pistes} from './scenes/S2Pistes';
import {S3Manuel} from './scenes/S3Manuel';
import {S4Aile} from './scenes/S4Aile';
import {S5Reaction} from './scenes/S5Reaction';
import {S6Main} from './scenes/S6Main';
import {S7Pression} from './scenes/S7Pression';
import {S8Decollage} from './scenes/S8Decollage';
import {S9Plane} from './scenes/S9Plane';
import {Outro} from './scenes/Outro';
import {none} from '@remotion/transitions/none';
import {tear, whip} from './transitions';
import {OUTRO_D, T, TimelineContext, timelineDe, useTimeline} from './timeline';
import {Sound} from './Sound';
import {Captions} from './Captions';

// Les scènes du récit ; leur durée et leur rythme viennent de la voix (timeline.ts)
export const SCENES = [
  {id: 'S1-Poids', C: S1Poids, base: 149},
  {id: 'S2-Pistes', C: S2Pistes, base: 172},
  {id: 'S3-Manuel', C: S3Manuel, base: 143},
  {id: 'S4-Aile', C: S4Aile, base: 147},
  {id: 'S5-Reaction', C: S5Reaction, base: 110},
  {id: 'S6-Main', C: S6Main, base: 195},
  {id: 'S7-Pression', C: S7Pression, base: 158},
  {id: 'S8-Decollage', C: S8Decollage, base: 215},
  {id: 'S9-Plane', C: S9Plane, base: 267},
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRESENTATIONS: TransitionPresentation<any>[] = [
  whip({dir: 'left'}),
  tear({seed: 'a', tilt: 6}),
  none(), // S3 → S4 : même plan (l'avion sous le projecteur), coupe franche
  none(), // S4 → S5 : même plan (le profil et ses filets), coupe franche
  whip({dir: 'left'}),
  tear({seed: 'd', tilt: -5}),
  whip({dir: 'right'}),
  whip({dir: 'up'}),
  tear({seed: 'e', tilt: 5}),
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
