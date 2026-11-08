import React from 'react';
import {AbsoluteFill, Img, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {step} from './lib';
import {Carte} from './Carte';
import {Outro} from './scenes/Outro';
import {OUTRO_D, TimelineContext, timelineDe, useTimeline} from './timeline';
import {Sound} from './Sound';
import {Captions} from './Captions';

/** Grain de papier + vignette par-dessus tout (même habillage que le style papier) */
export const Paper: React.FC = () => {
  const f = useCurrentFrame();
  const st = step(f, 4);
  const ox = ((st * 37) % 40) - 20;
  const oy = ((st * 53) % 40) - 20;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <Img src={staticFile('grain.jpg')} style={{position: 'absolute', width: 1140, height: 2000, left: -30 + ox, top: -40 + oy, mixBlendMode: 'overlay', opacity: 0.3}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(20,40,60,0.28) 100%)'}} />
    </AbsoluteFill>
  );
};

const Fondu: React.FC<{children: React.ReactNode}> = ({children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: interpolate(f, [0, 12], [0, 1], {extrapolateRight: 'clamp'})}}>{children}</AbsoluteFill>;
};

const Film: React.FC = () => {
  const {outroFrom} = useTimeline();
  return (
    <>
      <Sequence durationInFrames={outroFrom + 12} name="Carte">
        <Carte />
      </Sequence>
      <Sequence from={outroFrom} durationInFrames={OUTRO_D} name="Sophia">
        <Fondu>
          <Outro />
        </Fondu>
      </Sequence>
    </>
  );
};

export type PropsVideo = {langue: string; sousTitres: boolean};

/** Vidéo finale d'une langue, style « géographie » : la carte, la voix, les bruitages et (au choix) les sous-titres */
export const Main: React.FC<PropsVideo> = ({langue, sousTitres}) => (
  <TimelineContext.Provider value={timelineDe(langue)}>
    <AbsoluteFill style={{backgroundColor: '#5E9CC6'}}>
      <Film />
      <Paper />
      {sousTitres && <Captions />}
      <Sound />
    </AbsoluteFill>
  </TimelineContext.Provider>
);
