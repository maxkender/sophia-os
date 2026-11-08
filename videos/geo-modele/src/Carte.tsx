// La carte animée du style « géographie » : une seule carte continue pendant tout le récit. Chaque scène du script
// (champ `carte`) dit où va la caméra et ce qui apparaît, au mot près. Aucun dessin propre au sujet.
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {cameraDe, ECRAN, GRATICULE, kmEnMonde, PAYS, TERRES, trouverPays, versEcran, versMonde, voler, type Camera} from './geo';
import type {CarteScene, CouleurCarte, Icone, LonLat} from './langues/types';
import {FPS} from './lib';
import {useTimeline, type Timeline} from './timeline';

export const COULEURS: Record<CouleurCarte, string> = {
  rouge: '#E0483E',
  bleu: '#2F6FD6',
  vert: '#3FA65A',
  jaune: '#F2C230',
  orange: '#F08A2C',
  violet: '#8A55C9',
  gris: '#8C8C94',
  noir: '#2B2A33',
};
const MER = '#7FB7D9';
const MER_FONCEE = '#5E9CC6';
const TERRE = '#F1E4C8';
const TERRE_BORD = '#FFFFFF';
const VOL = 34; // durée d'un vol de caméra (images)

type Mouvement = {de: number; cam: Camera};
type Element = {
  type: 'pays' | 'point' | 'fleche' | 'zone';
  scene: number;
  debut: number;
  fin: number;
  data: Record<string, unknown>;
};

/** Toute la chorégraphie de la carte, calculée une fois à partir du script et de la voix */
export const chorégraphie = (tl: Timeline) => {
  const scenes = tl.langue.script.scenes;
  const quand = (i: number, q: {au?: string; fin?: boolean}, defaut: number) => (q.au ? tl.motGlobal(i, q.au, q.fin) : defaut);
  const mouvements: Mouvement[] = [];
  const elements: Element[] = [];
  const finRecit = tl.outroFrom + 8;
  scenes.forEach((s, i) => {
    const c: CarteScene = s.carte ?? {};
    const sc = tl.scenes[i];
    const debut = sc.from + (i === 0 ? 0 : 4);
    const finScene = i + 1 < scenes.length ? tl.scenes[i + 1].from + 6 : finRecit;
    if (c.vue) mouvements.push({de: debut, cam: cameraDe(c.vue)});
    if (c.vers) mouvements.push({de: quand(i, c.vers, sc.from + Math.round(sc.d * 0.45)), cam: cameraDe(c.vers)});
    const fin = c.garde ? finRecit : finScene;
    const ajouter = (type: Element['type'], liste: ({au?: string; fin?: boolean} & Record<string, unknown>)[] | undefined, decal: number) =>
      (liste ?? []).forEach((e, k) => elements.push({type, scene: i, debut: quand(i, e, debut + decal + k * 6), fin, data: e}));
    ajouter('pays', c.pays as never, 10);
    ajouter('zone', c.zones as never, 14);
    ajouter('fleche', c.fleches as never, 16);
    ajouter('point', c.points as never, 12);
  });
  if (mouvements.length === 0) mouvements.push({de: 0, cam: cameraDe({centre: [10, 30], zoom: 1})});
  mouvements.sort((a, b) => a.de - b.de);
  return {mouvements, elements};
};

const cameraA = (mv: Mouvement[], f: number): Camera => {
  let k = 0;
  for (let i = 0; i < mv.length; i++) if (mv[i].de <= f) k = i;
  if (k === 0 || f < mv[0].de) return mv[0].cam;
  const avant = mv[k - 1].cam;
  return voler(avant, mv[k].cam, (f - mv[k].de) / VOL);
};

const Icon: React.FC<{i: Icone; c: string}> = ({i, c}) => {
  switch (i) {
    case 'explosion':
      return <polygon points="0,-46 12,-16 44,-22 20,2 38,30 6,18 -8,46 -14,16 -44,20 -22,-4 -40,-30 -8,-18" fill={COULEURS.orange} stroke={COULEURS.rouge} strokeWidth={5} />;
    case 'bateau':
      return (
        <g>
          <path d="M -36 6 L 36 6 L 26 26 L -26 26 Z" fill="#6B4528" />
          <rect x={-3} y={-34} width={6} height={40} fill="#4A3423" />
          <path d="M 4 -32 L 30 2 L 4 2 Z" fill="#FFFFFF" stroke={c} strokeWidth={3} />
        </g>
      );
    case 'armee':
      return (
        <g>
          <path d="M -30 10 Q -30 -30 0 -32 Q 30 -30 30 10 Z" fill="#5E6B3E" />
          <rect x={-36} y={6} width={72} height={10} rx={4} fill="#4A5530" />
        </g>
      );
    case 'montagne':
      return (
        <g>
          <polygon points="-40,24 -6,-30 28,24" fill="#7D7468" />
          <polygon points="-6,-30 -16,-14 4,-14" fill="#FFFFFF" />
          <polygon points="0,24 22,-8 44,24" fill="#5E574D" />
        </g>
      );
    case 'or':
      return (
        <g>
          <circle r={26} fill="#E2B23C" stroke="#B5862A" strokeWidth={5} />
          <circle r={14} fill="none" stroke="#B5862A" strokeWidth={3} />
        </g>
      );
    case 'drapeau':
      return (
        <g>
          <rect x={-3} y={-40} width={6} height={64} fill="#4A3423" />
          <path d="M 3 -40 L 40 -30 L 3 -18 Z" fill={c} />
        </g>
      );
    case 'personne':
      return (
        <g>
          <circle cy={-22} r={14} fill="#F0C7A0" />
          <path d="M -20 22 Q -20 -8 0 -8 Q 20 -8 20 22 Z" fill={c} />
        </g>
      );
    case 'usine':
      return (
        <g>
          <path d="M -36 24 L -36 -6 L -16 6 L -16 -6 L 4 6 L 4 -26 L 18 -26 L 18 6 L 36 6 L 36 24 Z" fill="#7D7468" />
        </g>
      );
    case 'petrole':
      return (
        <g>
          <rect x={-20} y={-28} width={40} height={54} rx={8} fill="#2B2A33" />
          <rect x={-20} y={-12} width={40} height={6} fill="#E2B23C" />
          <rect x={-20} y={6} width={40} height={6} fill="#E2B23C" />
        </g>
      );
    case 'avion':
      return <path d="M 0 -36 L 6 -10 L 34 4 L 34 10 L 6 2 L 4 24 L 14 32 L 14 36 L 0 32 L -14 36 L -14 32 L -4 24 L -6 2 L -34 10 L -34 4 L -6 -10 Z" fill="#FFFFFF" stroke="#2B2A33" strokeWidth={3} />;
    case 'couronne':
      return <polygon points="-30,16 -30,-16 -15,0 0,-24 15,0 30,-16 30,16" fill="#E2B23C" stroke="#B5862A" strokeWidth={3} />;
    case 'blé':
      return (
        <g fill="#E2B23C">
          <rect x={-2} y={-10} width={4} height={40} fill="#B5862A" />
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <ellipse cx={-8} cy={-k * 12} rx={6} ry={10} transform={`rotate(-25 -8 ${-k * 12})`} />
              <ellipse cx={8} cy={-k * 12 - 4} rx={6} ry={10} transform={`rotate(25 8 ${-k * 12 - 4})`} />
            </g>
          ))}
        </g>
      );
    case 'ville':
      return (
        <g>
          <circle r={16} fill="#FFFFFF" />
          <circle r={10} fill={c} />
        </g>
      );
    default:
      return (
        <g>
          <path d="M 0 30 C -10 10 -26 -2 -26 -16 A 26 26 0 1 1 26 -16 C 26 -2 10 10 0 30 Z" fill={c} stroke="#FFFFFF" strokeWidth={4} />
          <circle cy={-16} r={9} fill="#FFFFFF" />
        </g>
      );
  }
};

/** Opacité d'un élément : entrée au début, sortie douce à la fin */
const presence = (f: number, e: Element) => {
  const fin = Math.max(e.fin, e.debut + 18);
  return interpolate(f, [e.debut, e.debut + 8, fin - 8, fin], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
};

export const Carte: React.FC = () => {
  const f = useCurrentFrame();
  const tl = useTimeline();
  const {mouvements, elements} = useMemo(() => chorégraphie(tl), [tl]);
  const cam = cameraA(mouvements, f);
  const actifs = elements.filter((e) => f >= e.debut - 1 && f <= e.fin);
  const remplis = new Map<string, {c: string; o: number; debut: number}>();
  for (const e of actifs.filter((x) => x.type === 'pays')) {
    const c = COULEURS[(e.data.couleur as CouleurCarte) ?? 'rouge'];
    for (const n of e.data.noms as string[]) remplis.set(trouverPays(n).id, {c, o: presence(f, e), debut: e.debut});
  }
  const vague = (k: number) => noise2D('mer', k, f / 90) * 6;
  return (
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 40%, ${MER} 0%, ${MER_FONCEE} 100%)`}}>
      <svg viewBox={`0 0 ${ECRAN.w} ${ECRAN.h}`} width={ECRAN.w} height={ECRAN.h} style={{position: 'absolute', inset: 0}}>
        {/* petites vagues de la mer, à l'écran */}
        <g opacity={0.25}>
          {Array.from({length: 14}, (_, k) => (
            <path key={k} d={`M -40 ${140 * k + vague(k)} q 45 -12 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0`} transform={`translate(${((f * 0.6 + k * 37) % 180) - 90} 0)`} stroke="#FFFFFF" strokeWidth={3} fill="none" />
          ))}
        </g>
        <g transform={`translate(${ECRAN.cx} ${ECRAN.cy}) scale(${cam.k}) translate(${-cam.x} ${-cam.y})`}>
          <path d={GRATICULE} fill="none" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {/* halo des côtes, les terres (un seul tracé), puis les pays surlignés par-dessus */}
          <path d={TERRES} fill="none" stroke="#A9D2EA" strokeWidth={10} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={TERRES} fill={TERRE} stroke={TERRE_BORD} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {PAYS.filter((p) => remplis.has(p.id)).map((p) => {
            const r = remplis.get(p.id)!;
            const pulse = 1 + 0.6 * Math.sin((f - r.debut) / 4) * Math.exp(-(f - r.debut) / 30);
            return <path key={p.id} d={p.d} fill={r.c} fillOpacity={r.o} stroke={TERRE_BORD} strokeWidth={3 * Math.max(0.5, pulse)} strokeOpacity={r.o} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
          })}
        </g>
        {/* éléments en coordonnées d'écran : tailles fixes, nets à tous les zooms */}
        {actifs
          .filter((e) => e.type === 'zone')
          .map((e, k) => {
            const ctr = e.data.centre as LonLat;
            const [x, y] = versEcran(cam, versMonde(ctr));
            const r0 = (e.data.rayon_km as number) * kmEnMonde(ctr[1]) * cam.k;
            const g = spring({frame: f - e.debut, fps: FPS, config: {damping: 14, stiffness: 120}});
            const c = COULEURS[(e.data.couleur as CouleurCarte) ?? 'rouge'];
            const o = presence(f, e);
            const onde = ((f - e.debut) % 45) / 45;
            return (
              <g key={`z${k}`} opacity={o}>
                <circle cx={x} cy={y} r={r0 * g} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={5} strokeDasharray="14 10" />
                <circle cx={x} cy={y} r={r0 * g * (1 + onde * 0.3)} fill="none" stroke={c} strokeWidth={4} opacity={(1 - onde) * 0.6} />
              </g>
            );
          })}
        {actifs
          .filter((e) => e.type === 'fleche')
          .map((e, k) => {
            const a = versEcran(cam, versMonde(e.data.de as LonLat));
            const b = versEcran(cam, versMonde(e.data.a as LonLat));
            const par = ((e.data.par as LonLat[] | undefined) ?? []).map((ll) => versEcran(cam, versMonde(ll)));
            const t = interpolate(f, [e.debut, e.debut + (par.length ? 40 : 26)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            let pt: (u: number) => [number, number];
            if (par.length) {
              // Catmull-Rom à travers les points de passage
              const P = [a, a, ...par, b, b];
              const nSeg = P.length - 3;
              pt = (u) => {
                const x = Math.min(nSeg - 1e-6, Math.max(0, u * nSeg));
                const i = Math.floor(x);
                const v = x - i;
                const [p0, p1, p2, p3] = [P[i], P[i + 1], P[i + 2], P[i + 3]];
                const c = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * v + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * v * v + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * v * v * v);
                return [c(0), c(1)];
              };
            } else {
              const dx = b[0] - a[0];
              const dy = b[1] - a[1];
              const courbe = (e.data.courbe as number) ?? 0.25;
              const m: [number, number] = [(a[0] + b[0]) / 2 - dy * courbe, (a[1] + b[1]) / 2 + dx * courbe];
              pt = (u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * m[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * m[1] + u * u * b[1]];
            }
            const n = par.length ? 90 : 40;
            const trace = Array.from({length: n + 1}, (_, j) => pt((j / n) * t));
            const fin = pt(t);
            const avant = pt(Math.max(0, t - 0.03));
            const ang = (Math.atan2(fin[1] - avant[1], fin[0] - avant[0]) * 180) / Math.PI;
            const c = COULEURS[(e.data.couleur as CouleurCarte) ?? 'rouge'];
            const boule = pt(((f - e.debut - 26) % 50) / 50);
            return (
              <g key={`f${k}`} opacity={presence(f, e)}>
                <polyline points={trace.map((p) => p.join(',')).join(' ')} fill="none" stroke="#FFFFFF" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={trace.map((p) => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="22 12" strokeDashoffset={-f * 1.5} />
                <polygon points="0,0 -30,-17 -30,17" fill={c} stroke="#FFFFFF" strokeWidth={4} transform={`translate(${fin[0]} ${fin[1]}) rotate(${ang})`} />
                {t >= 1 && <circle cx={boule[0]} cy={boule[1]} r={9} fill="#FFFFFF" stroke={c} strokeWidth={4} />}
              </g>
            );
          })}
        {actifs
          .filter((e) => e.type === 'point')
          .map((e, k) => {
            const [x, y] = versEcran(cam, versMonde(e.data.lieu as LonLat));
            const s = spring({frame: f - e.debut, fps: FPS, config: {damping: 9, stiffness: 190, mass: 0.7}});
            const c = COULEURS[(e.data.couleur as CouleurCarte) ?? 'rouge'];
            const onde = ((f - e.debut) % 40) / 40;
            return (
              <g key={`p${k}`} opacity={presence(f, e)}>
                <circle cx={x} cy={y} r={20 + onde * 60} fill="none" stroke={c} strokeWidth={5} opacity={(1 - onde) * 0.7} />
                <g transform={`translate(${x} ${y}) scale(${s * 1.3})`}>
                  <ellipse cx={0} cy={30} rx={24} ry={7} fill="#000" opacity={0.18} />
                  <Icon i={(e.data.icone as Icone) ?? 'epingle'} c={c} />
                </g>
              </g>
            );
          })}
      </svg>
    </AbsoluteFill>
  );
};
