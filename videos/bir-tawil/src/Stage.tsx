import React from 'react';
import {AbsoluteFill} from 'remotion';
import {H, W, useFrame} from './lib';
import {PaperDefs} from './shapes';

/** Une scène = un SVG 1080x1920 avec les filtres papier */
export const Stage: React.FC<{children: React.ReactNode; bg?: string}> = ({children, bg}) => {
  const frame = useFrame();
  return (
    <AbsoluteFill style={{backgroundColor: bg}}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
        <PaperDefs frame={frame} />
        {children}
      </svg>
    </AbsoluteFill>
  );
};
