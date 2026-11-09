// Bibliothèque papier du sujet « How do planes fly? » : avion de ligne, profil d'aile, filets d'air,
// flèches, ballon, rotor, manuel, tampon, bras et main, piste, compteur, île, passagers.
import React from 'react';
import {random} from 'remotion';
import {C, boil} from './lib';
import {smooth} from './volcan';

export const A = {
  fuselage: '#FBFAF6',
  fuselageShade: '#DCDDE2',
  tail: '#2F5DA8',
  tailLight: '#4F7FCB',
  wing: '#B9BEC8',
  wingDark: '#8E94A1',
  engine: '#6F7684',
  engineDark: '#4D5361',
  window: '#7FB6DE',
  air: '#5FA8E8',
  airLight: '#CDE7FB',
  push: '#F6C64E',
  pushDark: '#D9A21F',
  low: '#EAF6FF',
  runway: '#4B4D57',
  night: '#141B33',
  nightSea: '#22325A',
  sand: '#EBCB8B',
  palm: '#4E8B45',
};

/** Avion de ligne géant vu de profil, nez à droite (origine : centre ; ~1000 de long). */
export const Airliner: React.FC<{gear?: number; glow?: number; wingGlow?: number}> = ({gear = 0, glow = 1, wingGlow = 0}) => (
  <g>
    {/* dérive et stabilisateur */}
    <path d="M -470 -40 L -430 -40 L -330 -150 L -360 -330 L -420 -330 Z" fill={A.tail} />
    <path d="M -400 -300 L -360 -330 L -350 -300 Z" fill={A.tailLight} />
    <path d="M -480 -10 L -330 -20 L -300 10 L -470 20 Z" fill={A.wingDark} />
    {/* fuselage double pont */}
    <path d="M -500 -40 Q -480 -150 -300 -170 L 300 -175 Q 420 -170 470 -110 Q 520 -40 500 20 Q 470 70 380 80 L -380 80 Q -470 70 -500 -40 Z" fill={A.fuselage} />
    <path d="M -500 -40 Q -470 70 -380 80 L 380 80 Q 470 70 500 20 L 500 40 Q 470 100 380 100 L -380 100 Q -480 90 -500 -40 Z" fill={A.fuselageShade} />
    <rect x={-470} y={6} width={940} height={10} fill={A.tail} />
    {/* hublots : deux rangées */}
    {Array.from({length: 22}, (_, i) => (
      <rect key={`h${i}`} x={-400 + i * 36} y={-40} width={16} height={22} rx={7} fill={A.window} />
    ))}
    {Array.from({length: 16}, (_, i) => (
      <rect key={`b${i}`} x={-300 + i * 36} y={-118} width={16} height={22} rx={7} fill={A.window} />
    ))}
    <path d="M 430 -120 Q 470 -100 482 -70 L 430 -70 Z" fill={A.window} />
    {/* aile (vue de profil, en biais) */}
    <path d="M -120 40 L 140 40 L -60 180 L -200 180 Z" fill={A.wing} />
    {wingGlow > 0 && (
      <path
        d="M -120 40 L 140 40 L -60 180 L -200 180 Z"
        fill={C.yellow}
        opacity={0.55 * wingGlow}
        stroke={C.goldLight}
        strokeWidth={10 * wingGlow}
      />
    )}
    {/* réacteurs */}
    {[
      [-20, 150],
      [-150, 175],
    ].map(([x, y], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        <rect x={-70} y={-26} width={150} height={52} rx={24} fill={A.engine} />
        <rect x={60} y={-22} width={22} height={44} rx={8} fill={A.engineDark} />
        <ellipse cx={-70} cy={0} rx={10} ry={22} fill={glow > 0.5 ? C.orange : A.engineDark} opacity={0.4 + 0.6 * glow} />
      </g>
    ))}
    {/* train d'atterrissage */}
    {gear > 0.01 && (
      <g opacity={gear}>
        {[
          [330, 100],
          [-60, 100],
          [-160, 100],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x={-6} y={0} width={12} height={46 * gear} fill={A.engineDark} />
            <circle cy={46 * gear + 16} r={20} fill={C.ink} />
            <circle cy={46 * gear + 16} r={8} fill={C.grey} />
          </g>
        ))}
      </g>
    )}
  </g>
);

/** Profil d'aile vu en coupe, bord d'attaque à gauche (origine : centre ; corde = 2 × demi). */
export const airfoilPath = (half = 360, thick = 80) =>
  `M ${-half} 0 C ${-half} ${-thick * 0.9} ${-half * 0.55} ${-thick * 1.25} ${-half * 0.1} ${-thick * 1.15} ` +
  `C ${half * 0.35} ${-thick} ${half * 0.75} ${-thick * 0.45} ${half} 6 ` +
  `C ${half * 0.6} ${thick * 0.2} ${-half * 0.3} ${thick * 0.45} ${-half * 0.8} ${thick * 0.35} ` +
  `C ${-half * 0.95} ${thick * 0.3} ${-half} ${thick * 0.15} ${-half} 0 Z`;

export const Airfoil: React.FC<{half?: number; thick?: number; glow?: number}> = ({half = 360, thick = 80, glow = 0}) => (
  <g>
    <path d={airfoilPath(half, thick)} fill={A.wing} />
    <path d={airfoilPath(half * 0.92, thick * 0.6)} transform={`translate(${-half * 0.04} ${-thick * 0.18})`} fill={A.fuselageShade} opacity={0.6} />
    {glow > 0 && <path d={airfoilPath(half, thick)} fill="none" stroke={C.goldLight} strokeWidth={12 * glow} />}
  </g>
);

/**
 * Un filet d'air autour du profil (repère du profil, bord d'attaque à -half) : arrive à plat à la hauteur y0,
 * longe l'aile (au-dessus si y0 < 0), puis repart rabattu vers le bas de `down` (0→1).
 */
export const filet = (y0: number, down: number, half = 360, thick = 80) => {
  const dessus = y0 < 0;
  const marge = Math.abs(y0);
  const pts: [number, number][] = [
    [-1100, y0],
    [-half - 260, y0],
    [-half - 60, y0 + (dessus ? -thick * 0.25 : thick * 0.1) * Math.min(1, 220 / marge)],
    [-half * 0.1, dessus ? y0 - thick * 1.1 * Math.min(1, 240 / marge) : y0 + thick * 0.25 * Math.min(1, 240 / marge)],
    [half * 0.7, y0 + (dessus ? -thick * 0.3 : thick * 0.15)],
    [half + 220, y0 + down * (dessus ? 120 : 160)],
    [half + 600, y0 + down * (dessus ? 330 : 420)],
    [half + 1100, y0 + down * (dessus ? 560 : 680)],
  ];
  return smooth(pts);
};

/** Filet qui « coule » : tirets qui avancent (vitesse en px/image), apparition de gauche à droite (reveal 0→1). */
export const Filet: React.FC<{d: string; id: string; frame: number; speed?: number; reveal?: number; color?: string; w?: number; dash?: number}> = ({
  d,
  id,
  frame,
  speed = 14,
  reveal = 1,
  color = A.air,
  w = 14,
  dash = 120,
}) => {
  if (reveal <= 0) return null;
  return (
    <g>
      {reveal < 1 && (
        <clipPath id={id}>
          <rect x={-1200} y={-3000} width={reveal * 2900} height={6000} />
        </clipPath>
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${dash * 0.55}`}
        strokeDashoffset={-frame * speed}
        clipPath={reveal < 1 ? `url(#${id})` : undefined}
      />
    </g>
  );
};

/** Grosse flèche en papier, pointe vers +x (origine : base) */
export const Arrow: React.FC<{len: number; w?: number; fill?: string; edge?: string}> = ({len, w = 70, fill = A.push, edge = A.pushDark}) => {
  const head = Math.min(len * 0.45, w * 1.5);
  const body = Math.max(0, len - head);
  return (
    <g>
      <path d={`M 0 ${-w / 2} L ${body} ${-w / 2} L ${body} ${-w} L ${len} 0 L ${body} ${w} L ${body} ${w / 2} L 0 ${w / 2} Z`} fill={fill} />
      <path d={`M 0 ${w / 2} L ${body} ${w / 2} L ${body} ${w} L ${len} 0 L ${len - 10} 4 L ${body + 4} ${w - 14} L ${body + 4} ${w / 2 - 10} L 0 ${w / 2 - 10} Z`} fill={edge} opacity={0.5} />
    </g>
  );
};

/** Montgolfière (origine : bas de la nacelle) */
export const Balloon: React.FC = () => (
  <g>
    <path d="M -150 -420 Q -160 -600 0 -620 Q 160 -600 150 -420 Q 130 -300 40 -230 L -40 -230 Q -130 -300 -150 -420 Z" fill={C.red} />
    <path d="M -55 -612 Q -90 -420 -40 -230 L -14 -230 Q -50 -420 -18 -618 Z" fill={C.yellow} />
    <path d="M 55 -612 Q 90 -420 40 -230 L 14 -230 Q 50 -420 18 -618 Z" fill={C.yellow} />
    <path d="M -36 -230 L -30 -120 M 36 -230 L 30 -120" stroke={C.woodDark} strokeWidth={6} />
    <rect x={-46} y={-120} width={92} height={120} rx={10} fill={C.wood} />
    <rect x={-46} y={-120} width={92} height={20} rx={8} fill={C.woodDark} />
  </g>
);

/** Rotor d'hélicoptère qui tourne (origine : moyeu) */
export const Rotor: React.FC<{angle: number; r?: number}> = ({angle, r = 420}) => {
  const k = Math.cos((angle * Math.PI) / 180);
  return (
    <g>
      <rect x={-12} y={0} width={24} height={70} fill={C.ink} />
      <g transform={`scale(${Math.max(0.08, Math.abs(k))} 1)`}>
        <rect x={-r} y={-14} width={r * 2} height={28} rx={14} fill={C.rockDark} />
      </g>
      <ellipse rx={r * 0.95} ry={20} fill={C.ink} opacity={0.08} />
      <circle r={30} fill={C.ink} />
      <circle r={12} fill={C.grey} />
    </g>
  );
};

/** Manuel scolaire ouvert (origine : centre de la reliure) ; open 0 → 1 ; schéma faux sur la page de droite. */
export const Textbook: React.FC<{open: number; diagram: number}> = ({open, diagram}) => (
  <g>
    <rect x={-470} y={-330} width={940} height={640} rx={20} fill={C.redDark} />
    <g transform={`scale(${Math.max(0.02, open)} 1)`}>
      <path d="M 0 -300 Q 220 -330 440 -300 L 440 290 Q 220 260 0 290 Z" fill={C.cream} />
    </g>
    <path d="M 0 -300 Q -220 -330 -440 -300 L -440 290 Q -220 260 0 290 Z" fill={C.cream} />
    {/* page de gauche : lignes de texte (des traits, pas de lettres) */}
    {Array.from({length: 9}, (_, i) => (
      <rect key={i} x={-400} y={-240 + i * 56} width={i % 3 === 2 ? 200 : 330} height={14} rx={7} fill={C.parchmentDark} />
    ))}
    <rect x={-6} y={-300} width={12} height={590} fill={C.parchmentDark} />
    {open > 0.9 && (
      <g transform="translate(220 0) scale(0.42)" opacity={diagram > 0 ? 1 : 0}>
        <Airfoil half={340} thick={80} />
        <path d={`M -700 -40 Q -360 -40 -340 -100 Q 0 -230 340 0`} fill="none" stroke={C.red} strokeWidth={16} strokeDasharray="1500" strokeDashoffset={1500 * (1 - diagram)} />
        <path d={`M -700 60 Q -360 60 -300 70 Q 0 100 340 0`} fill="none" stroke={C.m4} strokeWidth={16} strokeDasharray="1500" strokeDashoffset={1500 * (1 - diagram)} />
        {diagram > 0.95 && <circle cx={340} cy={0} r={34} fill="none" stroke={C.ink} strokeWidth={10} />}
      </g>
    )}
  </g>
);

/** Tampon croix rouge (origine : centre) */
export const StampX: React.FC<{r?: number}> = ({r = 150}) => (
  <g opacity={0.92}>
    <circle r={r} fill="none" stroke={C.red} strokeWidth={r * 0.12} />
    <rect x={-r * 0.75} y={-r * 0.13} width={r * 1.5} height={r * 0.26} rx={8} fill={C.red} transform="rotate(45)" />
    <rect x={-r * 0.75} y={-r * 0.13} width={r * 1.5} height={r * 0.26} rx={8} fill={C.red} transform="rotate(-45)" />
  </g>
);

/** Bras qui sort d'une fenêtre, main à plat au bout (origine : épaule, bras vers +x ; tilt en degrés pour la main). */
export const Arm: React.FC<{len: number; tilt: number; sleeve?: string}> = ({len, tilt, sleeve = C.m3}) => (
  <g>
    <rect x={0} y={-30} width={len * 0.55} height={60} rx={28} fill={sleeve} />
    <rect x={len * 0.5} y={-24} width={len * 0.5} height={48} rx={22} fill={C.skin} />
    <g transform={`translate(${len} 0) rotate(${tilt})`}>
      <path d="M -10 -24 L 120 -22 Q 168 -18 170 0 Q 168 18 120 22 L -10 24 Z" fill={C.skin} />
      {[-12, 0, 12].map((y) => (
        <path key={y} d={`M 120 ${y} L 160 ${y}`} stroke="#D9A882" strokeWidth={3} />
      ))}
      <path d="M 30 -22 Q 60 -46 92 -40 Q 96 -30 70 -20 Z" fill={C.skin} />
    </g>
  </g>
);

/** Compteur de vitesse sans chiffres : arc, graduations et aiguille (origine : centre ; value 0→1). */
export const Gauge: React.FC<{value: number; r?: number}> = ({value, r = 170}) => {
  const a0 = -210;
  const a1 = 30;
  const a = a0 + (a1 - a0) * value;
  const pt = (deg: number, rr: number) => [Math.cos((deg * Math.PI) / 180) * rr, Math.sin((deg * Math.PI) / 180) * rr];
  return (
    <g>
      <circle r={r} fill={C.ink} />
      <circle r={r * 0.9} fill={C.cream} />
      <path d={`M ${pt(-60, r * 0.78).join(' ')} A ${r * 0.78} ${r * 0.78} 0 0 1 ${pt(30, r * 0.78).join(' ')}`} fill="none" stroke={C.red} strokeWidth={r * 0.1} />
      {Array.from({length: 13}, (_, i) => {
        const d = a0 + ((a1 - a0) * i) / 12;
        const [x1, y1] = pt(d, r * 0.84);
        const [x2, y2] = pt(d, r * (i % 3 === 0 ? 0.62 : 0.72));
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.ink} strokeWidth={i % 3 === 0 ? 10 : 6} strokeLinecap="round" />;
      })}
      <g transform={`rotate(${a})`}>
        <path d={`M -14 0 L 0 -10 L ${r * 0.78} 0 L 0 10 Z`} fill={C.red} />
      </g>
      <circle r={r * 0.12} fill={C.ink} />
    </g>
  );
};

/** Petite île avec un palmier (origine : centre du rivage) */
export const Island: React.FC = () => (
  <g>
    <path d="M -420 20 Q -300 -90 0 -100 Q 300 -90 420 20 Z" fill={A.sand} />
    <path d="M 120 -90 Q 140 -260 110 -380" stroke={C.woodDark} strokeWidth={22} fill="none" strokeLinecap="round" />
    {[-150, -60, 20, 100].map((a, i) => (
      <path key={i} d={`M 110 -380 Q ${110 + Math.cos((a * Math.PI) / 180) * 140} ${-380 + Math.sin((a * Math.PI) / 180) * 140 - 30} ${110 + Math.cos((a * Math.PI) / 180) * 230} ${-380 + Math.sin((a * Math.PI) / 180) * 230 + 40}`} stroke={A.palm} strokeWidth={34} fill="none" strokeLinecap="round" />
    ))}
  </g>
);

/** Petit passager en papier (origine : pieds) */
export const Passenger: React.FC<{c: string; hair?: string; arms?: number}> = ({c, hair = '#5A3A22', arms = 0}) => (
  <g>
    <rect x={-16} y={-50} width={12} height={50} rx={5} fill={C.ink} />
    <rect x={4} y={-50} width={12} height={50} rx={5} fill={C.ink} />
    <path d="M -28 -118 L 28 -118 L 32 -46 L -32 -46 Z" fill={c} />
    {[-1, 1].map((s) => (
      <rect key={s} x={-8} y={-10} width={16} height={56} rx={8} fill={c} transform={`translate(${s * 30} -112) rotate(${s * (20 + arms * 140)})`} />
    ))}
    <circle cy={-140} r={24} fill={C.skin} />
    <path d="M -24 -146 Q -20 -170 0 -170 Q 22 -170 24 -144 Q 12 -158 -24 -146 Z" fill={hair} />
  </g>
);

/** Gros poids en fonte (origine : bas) */
export const Weight: React.FC = () => (
  <g>
    <path d="M -110 -150 Q -70 -210 0 -210 Q 70 -210 110 -150" fill="none" stroke={C.rockDark} strokeWidth={36} />
    <path d="M -170 0 L -130 -170 L 130 -170 L 170 0 Z" fill={C.rockDark} />
    <path d="M -130 -170 L 130 -170 L 120 -140 L -122 -140 Z" fill={C.rock} />
  </g>
);

/** Bulles claires de basse pression au-dessus de l'aile */
export const LowBubbles: React.FC<{frame: number; k: number; seed: string; n?: number}> = ({frame, k, seed, n = 7}) => (
  <g>
    {Array.from({length: n}, (_, i) => {
      const x = -260 + (i / (n - 1)) * 520;
      const y = -170 - random(`${seed}y${i}`) * 90;
      const r = (24 + random(`${seed}r${i}`) * 26) * k * (1 + 0.12 * Math.sin(frame * 0.3 + i));
      return <circle key={i} cx={x + boil(frame, `${seed}${i}`, 3)} cy={y} r={Math.max(0, r)} fill={A.low} opacity={0.85} stroke={C.white} strokeWidth={4} />;
    })}
  </g>
);
