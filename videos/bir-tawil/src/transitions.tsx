import React from 'react';
import {AbsoluteFill, random} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {ease} from './lib';

type TearProps = {seed: string; tilt: number};

/** Ligne de déchirure en zigzag, en % de l'écran */
const tearLine = (seed: string, tilt: number, offset: number) => {
  const pts: [number, number][] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100;
    const y = 50 + tilt * ((x - 50) / 50) + (random(`${seed}${i}`) - 0.5) * 3.2 + offset;
    pts.push([x, y]);
  }
  return pts;
};
const poly = (pts: [number, number][]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`;

const TearPresentation: React.FC<TransitionPresentationComponentProps<TearProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const p = presentationProgress;
  if (presentationDirection === 'entering') {
    return <AbsoluteFill style={{scale: String(1.14 - 0.14 * ease.out(p))}}>{children}</AbsoluteFill>;
  }
  if (p <= 0.0001) return <AbsoluteFill>{children}</AbsoluteFill>;
  const q = ease.in(p);
  const line = tearLine(passedProps.seed, passedProps.tilt, 0);
  const lineTop = tearLine(passedProps.seed + 'w', passedProps.tilt, 0.9);
  const lineBot = tearLine(passedProps.seed + 'v', passedProps.tilt, -0.9);
  const top: [number, number][] = [[0, -5], [100, -5], ...[...line].reverse()];
  const topWhite: [number, number][] = [[0, -5], [100, -5], ...[...lineTop].reverse()];
  const bottom: [number, number][] = [...line, [100, 105], [0, 105]];
  const bottomWhite: [number, number][] = [...lineBot, [100, 105], [0, 105]];
  const shadow = 'drop-shadow(0px 24px 26px rgba(40,25,10,0.5))';
  const topT: React.CSSProperties = {translate: `${-q * 160}px ${-q * 1500}px`, rotate: `${-q * 16}deg`, transformOrigin: '0% 50%'};
  const botT: React.CSSProperties = {translate: `${q * 140}px ${q * 1500}px`, rotate: `${q * 12}deg`, transformOrigin: '100% 50%'};
  return (
    <AbsoluteFill style={{zIndex: 5}}>
      <AbsoluteFill style={topT}>
        <AbsoluteFill style={{clipPath: poly(topWhite), backgroundColor: '#FBF6EA'}} />
      </AbsoluteFill>
      <AbsoluteFill style={botT}>
        <AbsoluteFill style={{clipPath: poly(bottomWhite), backgroundColor: '#FBF6EA'}} />
      </AbsoluteFill>
      <AbsoluteFill style={{...topT, filter: shadow}}>
        <AbsoluteFill style={{clipPath: poly(top)}}>{children}</AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{...botT, filter: shadow}}>
        <AbsoluteFill style={{clipPath: poly(bottom)}}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const tear = (props: TearProps): TransitionPresentation<TearProps> => ({component: TearPresentation, props});

type WhipProps = {dir: 'left' | 'right' | 'up' | 'down'};

/** Panoramique fouetté avec flou de mouvement directionnel */
const WhipPresentation: React.FC<TransitionPresentationComponentProps<WhipProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const q = ease.inOut(presentationProgress);
  const horiz = passedProps.dir === 'left' || passedProps.dir === 'right';
  const sign = passedProps.dir === 'left' || passedProps.dir === 'up' ? -1 : 1;
  const off = presentationDirection === 'exiting' ? sign * q * 100 : sign * (q - 1) * 100;
  const blur = Math.round(Math.sin(Math.PI * presentationProgress) * 70);
  const id = `whip-${horiz ? 'x' : 'y'}-${blur}`;
  return (
    <AbsoluteFill style={{translate: horiz ? `${off}% 0%` : `0% ${off}%`, filter: blur > 0 ? `url(#${id})` : undefined}}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={horiz ? `${blur} 0` : `0 ${blur}`} />
        </filter>
      </svg>
      {children}
    </AbsoluteFill>
  );
};

export const whip = (props: WhipProps): TransitionPresentation<WhipProps> => ({component: WhipPresentation, props});
