import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, W} from './lib';
import {Main, type PropsVideo} from './Main';
import {timelineDe} from './timeline';

const defaut: PropsVideo = {langue: 'en', sousTitres: true};

export const RemotionRoot: React.FC = () => (
  // Une langue = --props='{"langue":"fr","sousTitres":true}' ; la durée vient de la voix de la langue
  <Composition
    id="BirTawil"
    component={Main}
    defaultProps={defaut}
    durationInFrames={timelineDe('en').total}
    calculateMetadata={({props}) => ({durationInFrames: timelineDe(props.langue).total})}
    fps={FPS}
    width={W}
    height={H}
  />
);
