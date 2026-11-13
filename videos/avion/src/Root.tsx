import React from 'react';
import {Composition, Folder} from 'remotion';
import {FPS, H, STRETCH, W} from './lib';
import {Main, SCENES, type PropsVideo} from './Main';
import {Outro} from './scenes/Outro';
import {OUTRO_D, timelineDe} from './timeline';

const defaut: PropsVideo = {langue: 'en', sousTitres: true};

export const RemotionRoot: React.FC = () => (
  <>
    {/* Une langue = --props='{"langue":"fr","sousTitres":true}' ; la durée vient de la voix de la langue */}
    <Composition
      id="Avion"
      component={Main}
      defaultProps={defaut}
      durationInFrames={timelineDe('en').total}
      calculateMetadata={({props}) => ({durationInFrames: timelineDe(props.langue).total})}
      fps={FPS}
      width={W}
      height={H}
    />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={s.id} component={s.C} durationInFrames={Math.round(s.base * STRETCH)} fps={FPS} width={W} height={H} />
      ))}
      <Composition id="S9-Sophia" component={Outro} durationInFrames={OUTRO_D} fps={FPS} width={W} height={H} />
    </Folder>
  </>
);
