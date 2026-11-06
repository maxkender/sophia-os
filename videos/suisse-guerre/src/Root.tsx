import React from 'react';
import {Composition, Folder} from 'remotion';
import {FPS, H, W} from './lib';
import {Main, SCENES, TOTAL} from './Main';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="SuisseGuerre" component={Main} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={s.id} component={s.C} durationInFrames={s.d} fps={FPS} width={W} height={H} />
      ))}
    </Folder>
  </>
);
