import React from 'react';
import {Audio} from '@remotion/media';
import {interpolate, Sequence, staticFile} from 'remotion';
import {chorégraphie} from './Carte';
import {PUSH, TAPS} from './scenes/Outro';
import {OUTRO_VOICE, useTimeline, VOICE_START, type Timeline} from './timeline';

// Bruitages du style « géographie » : un souffle à chaque vol de caméra, un « pop » par point, un trait pour les
// flèches, un carillon quand un pays s'allume, une explosion pour l'icône explosion.
type Ev = {f: number; son: string; vol: number};
const MASTER = 0.55;

/** Rendu réaliste : des sons discrets de documentaire, pas de bruitages cartoon */
const evenementsRealistes = (tl: Timeline): Ev[] => {
  const {mouvements, elements} = chorégraphie(tl);
  const {outroFrom, parle} = tl;
  return [
    ...mouvements.slice(1).map((m): Ev => ({f: m.de, son: 'swooshDoux', vol: 0.4})),
    ...elements.map((e): Ev => {
      if (e.type === 'pays') return {f: e.debut, son: 'basseDouce', vol: 0.45};
      if (e.type === 'fleche' || e.type === 'forme') return {f: e.debut, son: 'traitDoux', vol: 0.35};
      return {f: e.debut, son: 'ticDoux', vol: 0.4};
    }),
    {f: outroFrom, son: 'swooshDoux', vol: 0.4},
    ...TAPS.map((t): Ev => ({f: outroFrom + t.f - 1, son: 'click', vol: 0.5})),
    {f: outroFrom + TAPS[2].f + 1, son: 'ticDoux', vol: 0.5},
    {f: outroFrom + TAPS[4].f + 1, son: 'ticDoux', vol: 0.5},
  ].map((e) => ({...e, f: Math.max(0, e.f), vol: e.vol * MASTER * (parle(e.f) ? 0.7 : 1)}));
};

export const evenements = (tl: Timeline): Ev[] => {
  if (tl.langue.script.rendu === 'realiste') return evenementsRealistes(tl);
  const {mouvements, elements} = chorégraphie(tl);
  const {outroFrom, parle} = tl;
  return [
    ...mouvements.slice(1).map((m): Ev => ({f: m.de, son: 'whoosh', vol: 0.35})),
    ...elements.map((e): Ev => {
      if (e.type === 'point') return e.data.icone === 'explosion' ? {f: e.debut, son: 'boomSmall', vol: 0.5} : {f: e.debut, son: 'pop', vol: 0.45};
      if (e.type === 'fleche') return {f: e.debut, son: 'swirl', vol: 0.3};
      if (e.type === 'zone') return {f: e.debut, son: 'pop2', vol: 0.4};
      return {f: e.debut, son: 'chime', vol: 0.35};
    }),
    {f: outroFrom, son: 'whoosh', vol: 0.35},
    {f: outroFrom + 2, son: 'phone', vol: 0.5},
    ...TAPS.map((t): Ev => ({f: outroFrom + t.f - 1, son: 'click', vol: 0.7})),
    {f: outroFrom + TAPS[2].f + 1, son: 'correct', vol: 0.6},
    {f: outroFrom + TAPS[4].f + 1, son: 'correct', vol: 0.6},
    {f: outroFrom + PUSH.done + 8, son: 'sparkle', vol: 0.4},
    {f: outroFrom + PUSH.done + 14, son: 'confetti', vol: 0.5},
  ].map((e) => ({...e, f: Math.max(0, e.f), vol: e.vol * MASTER * (parle(e.f) ? 0.6 : 1)}));
};

/** Voix off et bruitages de la langue en cours */
export const Sound: React.FC = () => {
  const tl = useTimeline();
  const code = tl.langue.code;
  return (
    <>
      <Sequence from={VOICE_START} layout="none" name="Voix récit">
        <Audio src={staticFile(`audio/${code}/recit.mp3`)} />
      </Sequence>
      <Sequence from={tl.outroFrom + OUTRO_VOICE} layout="none" name="Voix fin">
        <Audio src={staticFile(`audio/${code}/outro.mp3`)} />
      </Sequence>
      {tl.langue.script.rendu === 'realiste' && (
        <Sequence durationInFrames={tl.total} layout="none" name="Nappe">
          <Audio
            src={staticFile('sfx/nappe.mp3')}
            loop
            volume={(f) => interpolate(f, [0, 20, tl.total - 30, tl.total], [0, 0.07, 0.07, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
          />
        </Sequence>
      )}
      {evenements(tl).map((e, k) => (
        <Sequence key={k} from={e.f} layout="none" name={e.son}>
          <Audio src={staticFile(`sfx/${e.son}.mp3`)} volume={e.vol} />
        </Sequence>
      ))}
    </>
  );
};
