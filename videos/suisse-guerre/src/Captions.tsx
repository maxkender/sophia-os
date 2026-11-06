import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {lerp, pop} from './lib';
import {PAGES} from './timeline';

const POLICE = 'MontserratCaps';
[800, 900].forEach((w) => {
  loadFont({family: POLICE, url: staticFile(`fonts/montserrat-latin-${w}-normal.woff2`), weight: String(w)});
});

// contour noir épais façon CapCut (ombres en anneau) + ombre portée
const contour = (r: number) => {
  const out: string[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    out.push(`${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 #000`);
  }
  out.push('0px 10px 18px rgba(0,0,0,0.45)');
  return out.join(', ');
};
const CONTOUR = contour(7);

/** Sous-titres dynamiques : 1 à 3 mots, le mot prononcé passe en jaune et grossit */
export const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const page = PAGES.find((p) => f >= p.de && f < p.a);
  if (!page) return null;
  const entree = pop(f, page.de, {damping: 12, stiffness: 320, mass: 0.6});
  const outro = page.zone === 'outro';
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 110,
          right: 110,
          top: outro ? 110 : 1240,
          height: outro ? 220 : 260,
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'center',
          justifyContent: 'center',
          columnGap: outro ? 26 : 36,
          rowGap: 0,
          fontFamily: POLICE,
          fontWeight: 900,
          fontSize: outro ? 66 : 84,
          lineHeight: 1.12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          textAlign: 'center',
          scale: String(0.82 + 0.18 * entree),
          opacity: lerp(f, [page.de, page.de + 2], [0, 1]),
        }}
      >
        {page.mots.map((m, i) => {
          const actif = f >= m.de && (i === page.mots.length - 1 || f < page.mots[i + 1].de);
          const p = actif ? pop(f, m.de, {damping: 9, stiffness: 400, mass: 0.5}) : 0;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                color: actif ? '#FFE14D' : '#FFFFFF',
                textShadow: CONTOUR,
                scale: String(actif ? 1 + 0.12 * Math.min(p, 1.2) : 1),
                rotate: actif ? `${(i % 2 ? 1 : -1) * 2}deg` : '0deg',
              }}
            >
              {m.texte}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
