// Formes papier du supervolcan (Yellowstone, cendres, froid, etc.)
import React from 'react';
import {random} from 'remotion';
import {noise2D} from '@remotion/noise';
import {C, boil, lerp, pop, starPoints, step} from './lib';

export const V = {
  lava: '#E8452C',
  lavaHot: '#FF8A1F',
  lavaGlow: '#FFD24A',
  magmaDark: '#9E2A1C',
  ash0: '#4A4550',
  ash1: '#5E5963',
  ash2: '#7D7882',
  ash3: '#A39DA6',
  ash4: '#C9C3C8',
  e1: '#9C6B45',
  e2: '#B07E55',
  e3: '#86593A',
  e4: '#6E4A31',
  e5: '#56392A',
  pine: '#3F6B4A',
  pineDark: '#2E5238',
  bison: '#5A3B26',
  bisonDark: '#3E2818',
  frost: '#E4F3FA',
  ice: '#BFE3F2',
  cold: '#4A90C8',
  sulfur: '#D8C878',
  space: '#17142A',
  sepia: '#E7D2A8',
  sepiaDark: '#B8955E',
  sand: '#F2D59A',
  sandDark: '#E0BC78',
  sea: '#4FA3C7',
  wheat: '#E9B949',
  wheatDark: '#C9932C',
  dead: '#8E7D63',
};

/** Pin (origine : pied du tronc) */
export const Pine: React.FC<{h?: number; c?: string}> = ({h = 200, c = V.pine}) => {
  const w = h * 0.42;
  return (
    <g>
      <rect x={-h * 0.04} y={-h * 0.2} width={h * 0.08} height={h * 0.2} fill={C.woodDark} />
      <polygon points={`0,${-h} ${-w * 0.55},${-h * 0.55} ${w * 0.55},${-h * 0.55}`} fill={c} />
      <polygon points={`0,${-h * 0.8} ${-w * 0.78},${-h * 0.36} ${w * 0.78},${-h * 0.36}`} fill={c} />
      <polygon points={`0,${-h * 0.6} ${-w},${-h * 0.16} ${w},${-h * 0.16}`} fill={c} />
      <polygon points={`0,${-h * 0.6} ${w},${-h * 0.16} ${w * 0.15},${-h * 0.16}`} fill="#000" opacity={0.12} />
    </g>
  );
};

/** Bison vers la droite (origine : sabots) */
export const Bison: React.FC<{walk?: number}> = ({walk = 0}) => {
  const leg = (x: number, k: number) => (
    <rect key={k} x={x} y={-62} width={16} height={62} rx={6} fill={V.bisonDark} transform={`rotate(${Math.sin(walk + k * 1.7) * 12} ${x + 8} -62)`} />
  );
  return (
    <g>
      {leg(-70, 0)}
      {leg(-40, 1)}
      {leg(30, 2)}
      {leg(58, 3)}
      <path d="M -96 -60 Q -104 -120 -60 -130 L 10 -138 Q 60 -196 100 -150 L 110 -80 Q 80 -50 30 -56 L -80 -50 Z" fill={V.bison} />
      <path d="M 10 -138 Q 60 -196 100 -150 L 112 -96 Q 60 -110 20 -100 Z" fill={V.bisonDark} />
      <path d="M 96 -146 Q 140 -140 142 -100 Q 140 -72 112 -70 Q 96 -90 96 -146 Z" fill={V.bisonDark} />
      <path d="M 104 -144 Q 112 -168 128 -164" stroke={C.cream} strokeWidth={6} fill="none" strokeLinecap="round" />
      <circle cx={124} cy={-118} r={4} fill={C.cream} />
      <path d="M -96 -90 Q -116 -84 -112 -60" stroke={V.bisonDark} strokeWidth={6} fill="none" />
    </g>
  );
};

/** Bassin aux anneaux colorés (Grand Prismatic) vu en perspective (origine : centre) */
export const Pool: React.FC<{rx?: number; frame: number}> = ({rx = 150, frame}) => {
  const cols = ['#B5562B', '#E8892B', '#F2C744', '#9CCB6B', '#56B3C2', '#2F7FB8'];
  return (
    <g>
      {cols.map((c, i) => {
        const k = 1 - i * 0.15;
        return <ellipse key={c} cx={0} cy={0} rx={rx * k + (i === 5 ? Math.sin(frame * 0.3) * 3 : 0)} ry={rx * 0.16 * k} fill={c} />;
      })}
    </g>
  );
};

/** Bouffées de vapeur qui montent (origine : la bouche du geyser) */
export const Steam: React.FC<{frame: number; jet?: number; seed: string; n?: number}> = ({frame, jet = 0, seed, n = 7}) => {
  const items = [];
  for (let i = 0; i < n; i++) {
    const per = 26;
    const t = ((frame + (i * per) / n) % per) / per;
    const x = Math.sin(t * 5 + i) * 18 + (random(`${seed}${i}`) - 0.5) * 40;
    const y = -t * (110 + jet * 420);
    const r = 16 + t * 34 + jet * 18;
    items.push(<circle key={i} cx={x} cy={y} r={r} fill={C.white} opacity={(1 - t) * 0.85} />);
  }
  return (
    <g>
      {jet > 0.02 && <path d={`M -16 0 Q -24 ${-260 * jet} -8 ${-430 * jet} L 8 ${-430 * jet} Q 24 ${-260 * jet} 16 0 Z`} fill={C.white} opacity={0.95} />}
      {items}
    </g>
  );
};

/** Paysage de surface de Yellowstone (sol à y = 0, sur toute la largeur) */
export const Surface: React.FC<{frame: number; jet?: number; bisonX?: number; trees?: number}> = ({frame, jet = 0, bisonX = 600, trees = 1}) => {
  const pines: [number, number][] = [
    [40, 230],
    [110, 180],
    [175, 250],
    [880, 210],
    [945, 260],
    [1020, 190],
    [1090, 230],
  ];
  return (
    <g>
      <g filter="url(#pp)">
        <path d="M -400 10 Q 200 -24 540 0 T 1500 4 L 1500 60 L -400 60 Z" fill={C.grass} />
      </g>
      {pines.map(([x, h], i) => (
        <g key={i} transform={`translate(${x} 4) scale(${trees}) rotate(${Math.sin(frame * 0.08 + i) * 1.5})`} filter="url(#pp)">
          <Pine h={h} c={i % 2 ? V.pine : V.pineDark} />
        </g>
      ))}
      <g transform="translate(720 8)" filter="url(#pp)">
        <Pool frame={frame} />
      </g>
      <g transform="translate(360 0)">
        <g filter="url(#pp)">
          <path d="M -70 6 Q -30 -34 0 -36 Q 30 -34 70 6 Z" fill="#E8E0D0" />
          <ellipse cx={0} cy={-32} rx={14} ry={5} fill="#A8C8D8" />
        </g>
        <g transform="translate(0 -32)">
          <Steam frame={frame} jet={jet} seed="gey" />
        </g>
      </g>
      <g transform={`translate(${bisonX} 6) scale(0.62)`} filter="url(#pp)">
        <Bison walk={frame * 0.35} />
      </g>
    </g>
  );
};

/** Chronomètre papier (origine : centre) */
export const Stopwatch: React.FC<{angle: number; r?: number}> = ({angle, r = 90}) => (
  <g filter="url(#pp)">
    <rect x={-r * 0.16} y={-r * 1.32} width={r * 0.32} height={r * 0.26} rx={6} fill={C.redDark} />
    <rect x={-r * 0.3} y={-r * 1.42} width={r * 0.6} height={r * 0.14} rx={6} fill={C.red} />
    <rect x={r * 0.62} y={-r * 0.98} width={r * 0.22} height={r * 0.18} rx={5} fill={C.redDark} transform={`rotate(40 ${r * 0.7} ${-r * 0.9})`} />
    <circle r={r} fill={C.red} />
    <circle r={r * 0.84} fill={C.cream} />
    {Array.from({length: 12}, (_, i) => (
      <rect key={i} x={-3} y={-r * 0.8} width={6} height={i % 3 === 0 ? r * 0.18 : r * 0.1} rx={2} fill={C.ink} transform={`rotate(${i * 30})`} />
    ))}
    <g transform={`rotate(${angle})`}>
      <path d={`M ${-r * 0.05} 0 L 0 ${-r * 0.7} L ${r * 0.05} 0 Z`} fill={C.red} />
    </g>
    <circle r={r * 0.09} fill={C.ink} />
  </g>
);

/** Bloc calendrier : une page s'arrache à chaque image de `tears` (origine : centre) */
export const Calendar: React.FC<{frame: number; tears: number[]; s?: number}> = ({frame, tears, s = 1}) => {
  const page = (k: string, extra?: React.ReactNode) => (
    <g key={k}>
      <rect x={-110} y={-80} width={220} height={190} rx={10} fill={C.cream} />
      {Array.from({length: 15}, (_, i) => (
        <rect key={i} x={-90 + (i % 5) * 38} y={-50 + Math.floor(i / 5) * 46} width={26} height={26} rx={4} fill={C.kraftDark} />
      ))}
      {extra}
    </g>
  );
  const left = tears.filter((t) => frame < t).length;
  return (
    <g transform={`scale(${s})`} filter="url(#pp)">
      <rect x={-118} y={-100} width={236} height={222} rx={14} fill={C.woodDark} />
      {page('base', <rect x={-90 + (left % 5) * 38} y={-50 + 46} width={26} height={26} rx={4} fill={C.red} />)}
      {left > 0 && page('top')}
      {tears.map((t, i) => {
        const u = frame - t;
        if (u < 0 || u > 16) return null;
        const q = lerp(u, [0, 16], [0, 1]);
        return (
          <g key={i} transform={`translate(${q * 260 * (i % 2 ? -1 : 1)} ${-q * 160 + q * q * 420}) rotate(${q * 140 * (i % 2 ? -1 : 1)})`} opacity={1 - q * 0.6}>
            {page(`p${i}`)}
          </g>
        );
      })}
      <rect x={-118} y={-104} width={236} height={44} rx={12} fill={C.red} />
      {[-60, 0, 60].map((x) => (
        <rect key={x} x={x - 6} y={-118} width={12} height={30} rx={6} fill={C.ink} />
      ))}
    </g>
  );
};

/** Voiture rouge vers la droite (origine : bas, au milieu) */
export const Car: React.FC<{spin: number}> = ({spin}) => (
  <g>
    <path d="M -150 -40 L -150 -90 Q -146 -104 -128 -106 L -70 -110 L -36 -164 Q -28 -172 -14 -172 L 64 -172 Q 80 -172 90 -160 L 124 -110 L 160 -102 Q 176 -96 178 -78 L 178 -40 Z" fill={C.red} />
    <path d="M -26 -158 L 50 -158 L 50 -114 L -54 -114 Z" fill={C.skyLight} />
    <path d="M 64 -158 Q 76 -158 82 -150 L 108 -114 L 64 -114 Z" fill={C.skyLight} />
    <rect x={-150} y={-76} width={328} height={10} fill={C.redDark} />
    <circle cx={170} cy={-88} r={8} fill={C.yellow} />
    <rect x={-152} y={-96} width={14} height={14} rx={3} fill={C.redDark} />
    {[-90, 110].map((x) => (
      <g key={x} transform={`translate(${x} -34) rotate(${spin})`}>
        <circle r={34} fill={C.ink} />
        <circle r={15} fill={C.grey} />
        <rect x={-3} y={-15} width={6} height={30} fill={C.ink} />
      </g>
    ))}
  </g>
);

/** Nuage de cendres qui bouillonne : un amas de cercles (origine : centre) */
export const Billow: React.FC<{
  frame: number;
  seed: string;
  pts: readonly (readonly [number, number, number])[];
  glow?: number;
  dark?: boolean;
}> = ({frame, seed, pts, glow = 0, dark}) => {
  const cols = dark ? [V.ash0, V.ash1, V.ash2] : [V.ash1, V.ash2, V.ash3];
  const st = step(frame, 3);
  const r = (i: number, k: number) => pts[i][2] * k * (1 + noise2D(`${seed}${i}`, st * 0.25, k) * 0.06);
  return (
    <g>
      {glow > 0 &&
        pts.map(([x, y], i) => <circle key={`g${i}`} cx={x} cy={y + pts[i][2] * 0.25} r={r(i, 1.04)} fill={i % 2 ? V.lava : V.lavaHot} opacity={glow} />)}
      {pts.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r={r(i, 1)} fill={cols[0]} />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={`b${i}`} cx={x - pts[i][2] * 0.14} cy={y - pts[i][2] * 0.16} r={r(i, 0.78)} fill={cols[1]} />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={`c${i}`} cx={x - pts[i][2] * 0.3} cy={y - pts[i][2] * 0.32} r={r(i, 0.42)} fill={cols[2]} />
      ))}
    </g>
  );
};

/** Maison (origine : bas, au milieu). `ash` : épaisseur de cendres sur le toit ; `crush` 0→1 : le toit s'effondre */
export const House: React.FC<{ash?: number; crush?: number; wall?: string; roof?: string}> = ({ash = 0, crush = 0, wall = C.cream, roof = C.red}) => {
  const sag = crush * 120;
  return (
    <g>
      <rect x={-130} y={-190 + sag * 0.35} width={260} height={190 - sag * 0.35} fill={wall} />
      <rect x={-40} y={-110 + sag * 0.2} width={70} height={110 - sag * 0.2} fill={C.woodDark} />
      <rect x={60} y={-150 + sag * 0.3} width={50} height={46} fill={crush > 0.3 ? C.ink : C.skyLight} />
      {crush > 0.3 && <path d="M -120 -150 L -80 -100 L -100 -60" stroke={C.ink} strokeWidth={5} fill="none" />}
      <g transform={`translate(-160 ${-190 + sag * 0.6}) rotate(${crush * 28})`}>
        <polygon points={`0,0 160,${-130 + sag * 1.05} 160,${-112 + sag * 1.05} 0,18`} fill={roof} />
        <polygon points={`0,${-ash * 0.5} 160,${-130 - ash + sag * 1.05} 160,${-130 + sag * 1.05} 0,0`} fill={V.ash3} />
      </g>
      <g transform={`translate(160 ${-190 + sag * 0.6}) rotate(${-crush * 28})`}>
        <polygon points={`0,0 -160,${-130 + sag * 1.05} -160,${-112 + sag * 1.05} 0,18`} fill={C.redDark} />
        <polygon points={`0,${-ash * 0.5} -160,${-130 - ash + sag * 1.05} -160,${-130 + sag * 1.05} 0,0`} fill={V.ash2} />
      </g>
    </g>
  );
};

/** Avion de ligne vers la droite (origine : centre) */
export const Plane: React.FC = () => (
  <g>
    <path d="M -190 -50 L -150 -50 L -110 -14 L -190 -14 Z" fill={C.red} />
    <path d="M -200 -14 L 160 -14 Q 220 -12 226 6 Q 220 26 160 28 L -180 28 Q -210 22 -200 -14 Z" fill={C.white} />
    <rect x={-170} y={2} width={360} height={7} fill={C.red} />
    {Array.from({length: 9}, (_, i) => (
      <circle key={i} cx={-120 + i * 30} cy={-2} r={6} fill={C.skyLight} />
    ))}
    <path d="M 176 -8 L 206 -8 Q 214 -2 210 4 L 176 4 Z" fill={C.skyLight} />
    <path d="M -40 14 L 50 14 L -40 84 L -70 84 Z" fill="#D9DDE3" />
    <rect x={-46} y={50} width={58} height={22} rx={10} fill={C.grey} />
  </g>
);

/** Panneau d'interdiction (origine : centre) */
export const NoSign: React.FC<{r?: number}> = ({r = 120}) => (
  <g>
    <circle r={r} fill="none" stroke={C.red} strokeWidth={r * 0.2} />
    <rect x={-r} y={-r * 0.1} width={r * 2} height={r * 0.2} fill={C.red} transform="rotate(-45)" />
  </g>
);

/** Thermomètre (origine : centre du bulbe) ; level 0→1 */
export const Thermometer: React.FC<{level: number; color: string; h?: number}> = ({level, color, h = 700}) => (
  <g>
    <rect x={-58} y={-h - 40} width={116} height={h + 40} rx={58} fill={C.white} />
    <circle r={92} fill={C.white} />
    <rect x={-26} y={-h - 10} width={52} height={h} rx={26} fill="#E6E1D8" />
    <rect x={-26} y={-h * level} width={52} height={h * level} fill={color} />
    <circle r={66} fill={color} />
    {Array.from({length: 9}, (_, i) => (
      <rect key={i} x={36} y={-h + 40 + i * ((h - 120) / 8)} width={i % 2 ? 22 : 36} height={8} rx={3} fill={C.ink} opacity={0.75} />
    ))}
    <ellipse cx={-26} cy={-20} rx={14} ry={24} fill={C.white} opacity={0.4} />
  </g>
);

/** Flocons ou cendres qui tombent sur une zone [x, y, w, h] */
export const Fall: React.FC<{
  frame: number;
  start: number;
  n: number;
  seed: string;
  area: [number, number, number, number];
  color?: string;
  size?: number;
  speed?: number;
  fadeIn?: number;
}> = ({frame, start, n, seed, area, color = C.white, size = 10, speed = 9, fadeIn = 10}) => {
  const t = frame - start;
  if (t < 0) return null;
  const [x0, y0, w, h] = area;
  const items = [];
  for (let i = 0; i < n; i++) {
    const sp = speed * (0.6 + random(`${seed}s${i}`) * 0.8);
    const y = y0 + ((random(`${seed}y${i}`) * h + t * sp) % h);
    const x = x0 + random(`${seed}x${i}`) * w + Math.sin(t * 0.08 + i) * 24;
    const r = size * (0.5 + random(`${seed}r${i}`));
    items.push(<circle key={i} cx={x} cy={y} r={r} fill={color} />);
  }
  return <g opacity={lerp(t, [0, fadeIn], [0, 1])}>{items}</g>;
};

/** Épi de blé (origine : pied) ; wilt 0→1 : il se fane */
export const Wheat: React.FC<{wilt: number; h?: number; seed: string}> = ({wilt, h = 260, seed}) => {
  const bend = wilt * (60 + random(seed) * 40);
  const col = wilt > 0.5 ? V.dead : V.wheat;
  const top = {x: Math.sin((bend * Math.PI) / 180) * h * 0.4, y: -h + wilt * h * 0.3};
  return (
    <g>
      <path d={`M 0 0 Q ${top.x * 0.2} ${-h * 0.6} ${top.x} ${top.y}`} stroke={wilt > 0.5 ? '#7A6C55' : V.wheatDark} strokeWidth={7} fill="none" />
      <g transform={`translate(${top.x} ${top.y}) rotate(${bend})`}>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <ellipse cx={-9} cy={-k * 18} rx={9} ry={14} fill={col} transform={`rotate(-20 -9 ${-k * 18})`} />
            <ellipse cx={9} cy={-k * 18 - 8} rx={9} ry={14} fill={col} transform={`rotate(20 9 ${-k * 18 - 8})`} />
          </g>
        ))}
        <ellipse cx={0} cy={-88} rx={7} ry={13} fill={col} />
      </g>
    </g>
  );
};

/** Parasol de plage (origine : pied du mât) */
export const Parasol: React.FC<{snow?: number}> = ({snow = 0}) => (
  <g>
    <rect x={-6} y={-360} width={12} height={360} fill={C.cream} />
    <path d="M -260 -330 Q 0 -500 260 -330 Z" fill={C.red} />
    {[-1, 1].map((s) => (
      <path key={s} d={`M ${s * 87} -386 Q ${s * 130} -360 ${s * 173} -330 L ${s * 87} -330 Z`} fill={C.white} />
    ))}
    <path d="M -43 -404 Q 0 -420 43 -404 L 43 -330 L -43 -330 Z" fill={C.white} />
    {snow > 0 && <path d={`M -268 -326 Q 0 ${-500 - snow * 70} 268 -326 Q 0 ${-470 - snow * 20} -268 -326 Z`} fill={C.snow} />}
  </g>
);

/** Château de sable (origine : bas, au milieu) */
export const Sandcastle: React.FC<{snow?: number}> = ({snow = 0}) => (
  <g>
    <rect x={-110} y={-110} width={220} height={110} fill={V.sandDark} />
    {[-110, -30, 50].map((x) => (
      <rect key={x} x={x} y={-150} width={60} height={50} fill={V.sandDark} />
    ))}
    <rect x={-30} y={-210} width={60} height={110} fill={V.sand} />
    <rect x={-14} y={-60} width={28} height={60} rx={14} fill="#B8935A" />
    <path d="M 0 -210 L 0 -260 L 40 -246 L 0 -232" fill={C.red} stroke={C.ink} strokeWidth={4} />
    {snow > 0 && (
      <g fill={C.snow}>
        <rect x={-114} y={-114 - snow * 12} width={228} height={snow * 14} rx={6} />
        <rect x={-34} y={-214 - snow * 16} width={68} height={snow * 18} rx={6} />
        {[-110, -30, 50].map((x) => (
          <rect key={x} x={x - 4} y={-154 - snow * 12} width={68} height={snow * 14} rx={6} />
        ))}
      </g>
    )}
  </g>
);

/** Scientifique en blouse (origine : pieds) */
export const Scientist: React.FC = () => (
  <g>
    <rect x={-30} y={-96} width={24} height={96} rx={8} fill={C.ink} />
    <rect x={6} y={-96} width={24} height={96} rx={8} fill={C.ink} />
    <path d="M -50 -190 L 50 -190 L 58 -70 L -58 -70 Z" fill={C.white} />
    <path d="M 0 -190 L 0 -70" stroke="#D7D2CA" strokeWidth={4} />
    <rect x={-74} y={-186} width={26} height={96} rx={12} fill={C.white} transform="rotate(10 -61 -186)" />
    <rect x={48} y={-186} width={26} height={90} rx={12} fill={C.white} transform="rotate(-30 61 -186)" />
    <rect x={64} y={-150} width={60} height={80} rx={6} fill={C.wood} transform="rotate(-20 94 -110)" />
    <rect x={72} y={-140} width={44} height={56} rx={3} fill={C.cream} transform="rotate(-20 94 -110)" />
    <rect x={-10} y={-206} width={20} height={18} fill={C.skin} />
    <circle cx={0} cy={-232} r={34} fill={C.skin} />
    <path d="M -36 -240 Q -30 -276 0 -276 Q 34 -276 36 -236 Q 20 -256 -36 -240 Z" fill="#6B4A2B" />
    <rect x={-30} y={-236} width={60} height={20} rx={10} fill="none" stroke={C.ink} strokeWidth={5} />
    <path d="M -10 -208 Q 0 -200 10 -208" stroke={C.ink} strokeWidth={3} fill="none" />
  </g>
);

/** Coche verte (origine : centre) */
export const Check: React.FC<{r?: number}> = ({r = 110}) => (
  <g>
    <circle r={r} fill="#4FAE5B" />
    <path d={`M ${-r * 0.45} 0 L ${-r * 0.12} ${r * 0.34} L ${r * 0.5} ${-r * 0.34}`} stroke={C.white} strokeWidth={r * 0.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </g>
);

/** Mammouth vers la droite (origine : pieds) */
export const Mammoth: React.FC = () => (
  <g>
    {[-80, -44, 34, 66].map((x) => (
      <rect key={x} x={x} y={-80} width={30} height={80} rx={10} fill="#6B4A2B" />
    ))}
    <path d="M -110 -70 Q -130 -190 -20 -210 Q 60 -230 110 -170 Q 140 -120 110 -70 Z" fill="#7A5534" />
    <path d="M 100 -170 Q 150 -160 150 -100 Q 150 -40 120 -20 Q 110 -30 124 -60 Q 128 -110 100 -120 Z" fill="#7A5534" />
    <path d="M 120 -110 Q 190 -100 180 -40" stroke={C.cream} strokeWidth={12} fill="none" strokeLinecap="round" />
    <circle cx={112} cy={-150} r={6} fill={C.ink} />
    <path d="M -40 -200 Q 0 -240 50 -205" stroke="#5E3F25" strokeWidth={8} fill="none" />
  </g>
);

/** Pyramide (origine : base, au milieu) */
export const Pyramid: React.FC = () => (
  <g>
    <polygon points="-170,0 0,-190 170,0" fill={V.sandDark} />
    <polygon points="0,-190 170,0 40,0" fill="#C99E5A" />
  </g>
);

/** Volcan vu de côté, large (origine : bas, au milieu ; cratère à y = -h) */
export const Volcano: React.FC<{w?: number; h?: number; glow?: number; c?: string; c2?: string}> = ({w = 900, h = 300, glow = 0, c = V.e4, c2 = V.e5}) => (
  <g>
    <path d={`M ${-w / 2} 0 Q ${-w * 0.28} ${-h * 0.3} ${-w * 0.12} ${-h} L ${w * 0.12} ${-h} Q ${w * 0.28} ${-h * 0.3} ${w / 2} 0 Z`} fill={c} />
    <path d={`M 0 0 L ${w * 0.04} ${-h} L ${w * 0.12} ${-h} Q ${w * 0.28} ${-h * 0.3} ${w / 2} 0 Z`} fill={c2} opacity={0.6} />
    {glow > 0 && <ellipse cx={0} cy={-h} rx={w * 0.12} ry={h * 0.06} fill={V.lavaHot} opacity={glow} />}
  </g>
);

/** Éclair (origine : haut) */
export const Bolt: React.FC<{seed: string; len?: number}> = ({seed, len = 300}) => {
  const pts: string[] = ['0,0'];
  let x = 0;
  for (let i = 1; i <= 6; i++) {
    x += (random(`${seed}${i}`) - 0.5) * 80;
    pts.push(`${x.toFixed(0)},${((len * i) / 6).toFixed(0)}`);
  }
  return (
    <g>
      <polyline points={pts.join(' ')} stroke={C.yellow} strokeWidth={16} fill="none" strokeLinejoin="round" />
      <polyline points={pts.join(' ')} stroke={C.white} strokeWidth={6} fill="none" strokeLinejoin="round" />
    </g>
  );
};

/** Gerbe d'étincelles (braises) */
export const Embers: React.FC<{frame: number; x: number; y: number; w: number; seed: string; n?: number}> = ({frame, x, y, w, seed, n = 18}) => {
  const items = [];
  for (let i = 0; i < n; i++) {
    const per = 30;
    const t = ((frame + random(`${seed}t${i}`) * per) % per) / per;
    const px = x + random(`${seed}x${i}`) * w + t * 40;
    const py = y - t * (120 + random(`${seed}h${i}`) * 200);
    items.push(
      <polygon
        key={i}
        points={starPoints(4, 10, 4, `${seed}${i}`)}
        transform={`translate(${px} ${py}) rotate(${frame * 12 + i * 40})`}
        fill={i % 2 ? V.lavaGlow : V.lavaHot}
        opacity={1 - t}
      />,
    );
  }
  return <g>{items}</g>;
};

/** Pop d'apparition générique */
export const Pop: React.FC<{f: number; at: number; x: number; y: number; s?: number; children: React.ReactNode; rot?: number}> = ({f, at, x, y, s = 1, children, rot = 0}) => {
  const p = pop(f, at, {damping: 9, stiffness: 220});
  if (p <= 0) return null;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot * (1 - p) + boil(f, `${x}${y}`, 1.2, 4)}) scale(${p * s})`} filter="url(#pp)">
      {children}
    </g>
  );
};

/** Chemin fermé lissé (Catmull-Rom) passant par des points */
export const smooth = (pts: readonly (readonly [number, number])[]) => {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
};

/** Tache irrégulière autour d'un centre (origine : centre) */
export const blob = (rx: number, ry: number, seed: string, n = 14, amp = 0.1, phase = 0) =>
  smooth(
    Array.from({length: n}, (_, i): [number, number] => {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + (random(`${seed}${i}`) - 0.5) * 2 * amp + Math.sin(phase + i * 1.3) * amp * 0.3;
      return [Math.cos(a) * rx * k, Math.sin(a) * ry * k];
    }),
  );
