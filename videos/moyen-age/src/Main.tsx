import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {lerp, step, WarpContext} from './lib';
import {PageContext, TABLEAUX} from './scenes/Tableaux';
import {Outro} from './scenes/Outro';
import {fade} from '@remotion/transitions/fade';
import {OUTRO_D, T, TimelineContext, timelineDe, useTimeline} from './timeline';
import {Sound} from './Sound';
import {Captions} from './Captions';

// Les 36 pages du récit ; leur durée vient de la voix (timeline.ts), leur moment fort du mot repère
export const SCENES = TABLEAUX.map((C, i) => ({id: `P${String(i + 1).padStart(2, '0')}`, C, base: 180}));

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
            <PageContext.Provider value={{d: scenes[i].d, m: scenes[i].moment}}>
              <s.C />
            </PageContext.Provider>
          </WarpContext.Provider>
        </TransitionSeries.Sequence>,
        <TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={linearTiming({durationInFrames: T})} />,
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
