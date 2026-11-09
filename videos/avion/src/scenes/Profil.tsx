import React from 'react';
import {C} from '../lib';
import {A, Airfoil, Filet, filet} from '../avion';

/** Hauteurs des filets d'air (repère du profil) : trois au-dessus, deux en dessous */
export const FILETS = [-330, -230, -150, 150, 250];

/** Le décor des scènes du profil d'aile : ciel, profil incliné de `tilt` degrés, filets d'air. */
export const Profil: React.FC<{
  id: string;
  f: number;
  y?: number;
  tilt: number;
  down: number;
  reveal?: (i: number) => number;
  /** décalage des tirets des filets du dessus (vitesse de l'air) */
  offsetTop?: number;
  offsetBottom?: number;
  topColor?: string;
  glow?: number;
  opacity?: number;
  aile?: boolean;
  children?: React.ReactNode;
}> = ({id, f, y = 880, tilt, down, reveal = () => 1, offsetTop, offsetBottom, topColor = A.air, glow = 0, opacity = 1, aile = true, children}) => (
  <g opacity={opacity}>
    <g transform={`translate(540 ${y})`}>
      {FILETS.map((y0, i) => (
        <Filet
          key={i}
          id={`${id}f${i}`}
          d={filet(y0, down)}
          frame={y0 < 0 ? (offsetTop ?? f * 14) / 14 : (offsetBottom ?? f * 14) / 14}
          reveal={reveal(i)}
          color={y0 < 0 ? topColor : A.air}
        />
      ))}
      {aile && (
        <g transform={`rotate(${tilt})`} filter="url(#ppl)">
          <Airfoil glow={glow} />
        </g>
      )}
      {children}
    </g>
  </g>
);

/** Fond de ciel des scènes du profil */
export const CielProfil: React.FC<{id: string}> = ({id}) => (
  <>
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8EC8EE" />
        <stop offset="1" stopColor={C.skyLight} />
      </linearGradient>
    </defs>
    <rect width={1080} height={1920} fill={`url(#${id})`} />
  </>
);
