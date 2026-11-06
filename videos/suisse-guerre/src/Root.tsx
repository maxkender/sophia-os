import React from 'react';
import {Composition, Folder} from 'remotion';
import {FPS, H, STRETCH, W} from './lib';
import {Main, MainSansSousTitres, SCENES} from './Main';
import {Outro} from './scenes/Outro';
import {OUTRO_D, TOTAL} from './timeline';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="SuisseGuerre" component={Main} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Composition id="SuisseGuerre-SansSousTitres" component={MainSansSousTitres} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={s.id} component={s.C} durationInFrames={Math.round(s.base * STRETCH)} fps={FPS} width={W} height={H} />
      ))}
      <Composition id="S8-Sophia" component={Outro} durationInFrames={OUTRO_D} fps={FPS} width={W} height={H} />
    </Folder>
  </>
);
