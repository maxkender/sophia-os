import React from 'react';
import {random} from 'remotion';
import {C, boil, lerp, pop, starPoints, step} from './lib';

/** Filtres papier : bords déchirés qui "vibrent" + ombre portée */
export const PaperDefs: React.FC<{frame: number}> = ({frame}) => {
  const seed = (step(frame) % 4) + 1;
  return (
    <defs>
      <filter id="pp" x="-12%" y="-12%" width="124%" height="130%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={2} seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={3.5} xChannelSelector="R" yChannelSelector="G" result="d" />
        <feDropShadow in="d" dx={0} dy={6} stdDeviation={4} floodColor="#3b2a12" floodOpacity={0.4} />
      </filter>
      <filter id="ppl" x="-15%" y="-15%" width="130%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" result="d" />
        <feDropShadow in="d" dx={0} dy={16} stdDeviation={10} floodColor="#2e1f0c" floodOpacity={0.45} />
      </filter>
      <filter id="rough" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={3.5} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  );
};

export const SwissFlagRect: React.FC<{s: number}> = ({s}) => (
  <g>
    <rect width={s} height={s} fill={C.red} />
    <rect x={(s * 6) / 32} y={(s * 13) / 32} width={(s * 20) / 32} height={(s * 6) / 32} fill={C.white} />
    <rect x={(s * 13) / 32} y={(s * 6) / 32} width={(s * 6) / 32} height={(s * 20) / 32} fill={C.white} />
  </g>
);

/** Croix suisse seule, centrée */
export const SwissCross: React.FC<{s: number; fill?: string}> = ({s, fill = C.white}) => (
  <g>
    <rect x={-s / 2} y={-s * 0.15} width={s} height={s * 0.3} fill={fill} />
    <rect x={-s * 0.15} y={-s / 2} width={s * 0.3} height={s} fill={fill} />
  </g>
);

export const RedCrossRect: React.FC<{w: number; h: number}> = ({w, h}) => {
  const a = h * 0.2;
  return (
    <g>
      <rect width={w} height={h} fill={C.white} />
      <rect x={w / 2 - a * 1.5} y={h / 2 - a / 2} width={a * 3} height={a} fill={C.red} />
      <rect x={w / 2 - a / 2} y={h / 2 - a * 1.5} width={a} height={a * 3} fill={C.red} />
    </g>
  );
};

/** Drapeau sur mât qui pousse puis se déplie et flotte */
export const FlagPole: React.FC<{
  x: number;
  y: number;
  h: number;
  s: number;
  frame: number;
  start: number;
  kind?: 'swiss' | 'redcross';
}> = ({x, y, h, s, frame, start, kind = 'swiss'}) => {
  if (frame < start) return null;
  const p = pop(frame, start, {damping: 12, stiffness: 170});
  const u = pop(frame, start + 5, {damping: 7, stiffness: 150});
  const wave = Math.sin(frame * 0.38) * 7;
  const fw = kind === 'redcross' ? s * 1.5 : s;
  return (
    <g transform={`translate(${x} ${y})`} filter="url(#pp)">
      <g transform={`scale(1 ${p})`}>
        <rect x={-6} y={-h} width={12} height={h} rx={5} fill="#6b4a2b" />
        <circle cx={0} cy={-h - 6} r={12} fill={C.gold} />
      </g>
      <g transform={`translate(5 ${-h * p + 6}) scale(${Math.max(u, 0.001)} ${1 + Math.sin(frame * 0.38 + 1) * 0.03}) skewY(${wave})`}>
        {kind === 'redcross' ? <RedCrossRect w={fw} h={s} /> : <SwissFlagRect s={s} />}
        <rect width={fw} height={s} fill="#000" opacity={0.08 + Math.sin(frame * 0.38) * 0.06} />
      </g>
    </g>
  );
};

/** Explosion en papier découpé (4 couches qui scintillent) */
export const Boom: React.FC<{
  x: number;
  y: number;
  size: number;
  frame: number;
  start: number;
  seed: string;
  life?: number;
}> = ({x, y, size, frame, start, seed, life}) => {
  if (frame < start) return null;
  const t = frame - start;
  const sc = pop(frame, start, {damping: 7, stiffness: 280, mass: 0.6});
  const st = step(frame, 2);
  const fl = 1 + Math.sin(frame * 1.7 + size) * 0.05;
  const fade = life ? lerp(t, [life - 8, life], [1, 0]) : 1;
  if (fade <= 0) return null;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${(sc * fl * size) / 100}) rotate(${boil(frame, seed, 5, 3)})`}
      opacity={fade}
      filter="url(#pp)"
    >
      <polygon points={starPoints(11, 100, 58, `${seed}a${st}`)} fill={C.red} />
      <polygon points={starPoints(10, 76, 44, `${seed}b${st}`)} fill={C.orange} />
      <polygon points={starPoints(9, 52, 30, `${seed}c${st}`)} fill={C.yellow} />
      <polygon points={starPoints(7, 26, 16, `${seed}d${st}`)} fill="#FFF6D8" />
    </g>
  );
};

/** Anneau d'onde de choc */
export const Ring: React.FC<{x: number; y: number; frame: number; start: number; r: number; color?: string; dur?: number}> = ({
  x,
  y,
  frame,
  start,
  r,
  color = C.cream,
  dur = 14,
}) => {
  const t = frame - start;
  if (t < 0 || t > dur) return null;
  return (
    <circle
      cx={x}
      cy={y}
      r={lerp(t, [0, dur], [r * 0.2, r])}
      fill="none"
      stroke={color}
      strokeWidth={lerp(t, [0, dur], [28, 2])}
      opacity={lerp(t, [0, dur], [0.95, 0])}
    />
  );
};

/** Éclats de papier / cailloux projetés */
export const Debris: React.FC<{
  x: number;
  y: number;
  frame: number;
  start: number;
  n: number;
  seed: string;
  colors: string[];
  speed?: number;
  gravity?: number;
  size?: number;
  spread?: number;
  dir?: number;
  rocks?: boolean;
}> = ({x, y, frame, start, n, seed, colors, speed = 30, gravity = 1.4, size = 26, spread = Math.PI * 2, dir = -Math.PI / 2, rocks}) => {
  const t = frame - start;
  if (t < 0 || t > 60) return null;
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = dir + (random(`${seed}a${i}`) - 0.5) * spread;
    const v = speed * (0.35 + random(`${seed}v${i}`) * 0.9);
    const px = x + Math.cos(a) * v * t;
    const py = y + Math.sin(a) * v * t + 0.5 * gravity * t * t;
    const rot = random(`${seed}r${i}`) * 360 + t * (random(`${seed}s${i}`) - 0.5) * 50;
    const w = size * (0.5 + random(`${seed}w${i}`));
    const col = colors[Math.floor(random(`${seed}c${i}`) * colors.length)];
    items.push(
      <g key={i} transform={`translate(${px} ${py}) rotate(${rot})`}>
        {rocks ? (
          <polygon points={starPoints(3, w * 0.6, w * 0.45, `${seed}p${i}`)} fill={col} />
        ) : (
          <rect x={-w / 2} y={-w * 0.3} width={w} height={w * 0.6} fill={col} />
        )}
      </g>,
    );
  }
  return (
    <g filter="url(#pp)" opacity={lerp(t, [40, 60], [1, 0])}>
      {items}
    </g>
  );
};

/** Char d'assaut (origine : milieu du bas des chenilles) */
export const Tank: React.FC<{spin?: number; color?: string; barrel?: number}> = ({spin = 0, color = C.olive, barrel = 0}) => (
  <g>
    <g transform={`translate(30 -110) rotate(${barrel})`}>
      <rect x={0} y={-8} width={150} height={17} rx={5} fill={C.oliveDark} />
      <rect x={140} y={-12} width={22} height={25} rx={4} fill={C.oliveDark} />
    </g>
    <path d="M -62 -86 Q -58 -142 8 -142 Q 72 -142 76 -86 Z" fill={color} />
    <rect x={-22} y={-160} width={34} height={22} rx={5} fill={C.oliveDark} />
    <path d="M -122 -50 L -100 -92 L 104 -92 L 132 -50 Z" fill={color} />
    <rect x={-128} y={-58} width={256} height={58} rx={29} fill={C.tread} />
    {[-90, -45, 0, 45, 90].map((wx) => (
      <g key={wx} transform={`translate(${wx} -29) rotate(${spin})`}>
        <circle r={21} fill="#5d6052" />
        <rect x={-3} y={-18} width={6} height={36} fill={C.tread} />
        <rect x={-18} y={-3} width={36} height={6} fill={C.tread} />
      </g>
    ))}
  </g>
);

/** Chalet (origine : milieu du bas). door : 0 fermé → 1 ouvert */
export const Chalet: React.FC<{door?: number}> = ({door = 0}) => (
  <g>
    <rect x={-170} y={-262} width={340} height={262} fill={C.wood} />
    {[-236, -210, -184, -158, -132, -106, -80, -54].map((py) => (
      <rect key={py} x={-170} y={py} width={340} height={3} fill={C.woodDark} opacity={0.35} />
    ))}
    <rect x={-180} y={-36} width={360} height={36} fill="#9b9aa3" />
    {/* fenêtres */}
    {[-95, 95].map((wx) => (
      <g key={wx} transform={`translate(${wx} -200)`}>
        <rect x={-58} y={-34} width={22} height={68} fill={C.red} />
        <rect x={36} y={-34} width={22} height={68} fill={C.red} />
        <rect x={-36} y={-34} width={72} height={68} fill={C.skyLight} />
        <rect x={-36} y={-3} width={72} height={6} fill={C.cream} />
        <rect x={-3} y={-34} width={6} height={68} fill={C.cream} />
        <rect x={-44} y={34} width={88} height={16} rx={3} fill={C.woodDark} />
        {[-30, -12, 6, 24].map((fx, i) => (
          <circle key={fx} cx={fx + 3} cy={32} r={9} fill={i % 2 ? '#E8508A' : C.red} />
        ))}
      </g>
    ))}
    {/* porte */}
    <rect x={-48} y={-142} width={96} height={142} fill="#2a1a10" />
    <g transform={`translate(-48 0) scale(${Math.max(1 - door, 0.02)} 1) translate(48 0)`}>
      <rect x={-48} y={-142} width={96} height={142} fill={C.woodDark} />
      <rect x={-36} y={-128} width={72} height={52} fill="#8a5330" />
      <rect x={-36} y={-66} width={72} height={52} fill="#8a5330" />
      <circle cx={34} cy={-70} r={6} fill={C.gold} />
    </g>
    {/* toit */}
    <polygon points="-238,-232 0,-424 238,-232" fill={C.roof} />
    <polygon points="-238,-232 238,-232 226,-214 -226,-214" fill="#4a2612" />
    <polygon points="-152,-301 0,-424 152,-301 118,-292 84,-312 44,-288 0,-318 -42,-290 -84,-312 -120,-293" fill={C.snow} />
    <circle cx={0} cy={-286} r={22} fill={C.skyLight} stroke={C.woodDark} strokeWidth={6} />
  </g>
);

/** Soldat en guirlande de papier (origine : pieds). Bras : -75 → 75 */
export const Doll: React.FC = () => (
  <g>
    <rect x={-30} y={-96} width={24} height={96} rx={8} fill={C.greenDark} />
    <rect x={6} y={-96} width={24} height={96} rx={8} fill={C.greenDark} />
    <rect x={-37} y={-16} width={34} height={16} rx={6} fill={C.ink} />
    <rect x={3} y={-16} width={34} height={16} rx={6} fill={C.ink} />
    <path d="M -42 -186 L 42 -186 L 36 -90 L -36 -90 Z" fill={C.green} />
    <rect x={-38} y={-112} width={76} height={10} fill="#3b2f22" />
    <rect x={-75} y={-186} width={150} height={26} rx={12} fill={C.green} />
    <circle cx={-72} cy={-173} r={14} fill={C.skin} />
    <circle cx={72} cy={-173} r={14} fill={C.skin} />
    <rect x={38} y={-184} width={18} height={18} fill={C.red} />
    <rect x={45} y={-180} width={4} height={10} fill={C.white} />
    <rect x={42} y={-177} width={10} height={4} fill={C.white} />
    <rect x={-10} y={-202} width={20} height={18} fill={C.skin} />
    <circle cx={0} cy={-228} r={34} fill={C.skin} />
    <path d="M -40 -232 Q -40 -280 0 -280 Q 40 -280 40 -232 Z" fill={C.greenDark} />
    <rect x={-47} y={-238} width={94} height={11} rx={5} fill={C.greenDark} />
    <circle cx={-12} cy={-218} r={4} fill={C.ink} />
    <circle cx={12} cy={-218} r={4} fill={C.ink} />
    <path d="M -10 -205 Q 0 -198 10 -205" stroke={C.ink} strokeWidth={3} fill="none" />
  </g>
);

/** Guirlande de soldats qui se déplie depuis le centre */
export const DollChain: React.FC<{n: number; frame: number; start: number; gap?: number}> = ({n, frame, start, gap = 4}) => {
  const mid = (n - 1) / 2;
  const items = [];
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - mid);
    const s0 = start + Math.ceil(d) * gap;
    const p = pop(frame, s0, {damping: 10, stiffness: 230});
    if (p <= 0) continue;
    const x = (i - mid) * 150;
    // pivote depuis la main qui touche le voisin côté centre
    const hinge = i < mid ? 75 : i > mid ? -75 : 0;
    const flip = i % 2 === 0 ? 1 : -1;
    // une fois dépliés, ils sautillent au garde-à-vous
    const hop = frame - s0 > 10 ? -Math.abs(Math.sin((frame - s0 - 10) * 0.42 + i * 0.9)) * 18 : 0;
    items.push(
      <g key={i} transform={`translate(${x + hinge} ${hop}) scale(${p * flip} ${i === Math.round(mid) ? p : 1}) translate(${-hinge * flip} 0)`}>
        <Doll />
      </g>,
    );
  }
  return <g filter="url(#pp)">{items}</g>;
};

/** Fusil d'assaut générique (origine : centre) */
export const Rifle: React.FC = () => (
  <g>
    <path d="M -290 -14 L -150 -26 L -150 30 L -276 56 Q -300 42 -290 -14 Z" fill="#33363C" />
    <rect x={-152} y={-32} width={214} height={50} rx={8} fill="#2A2C31" />
    <path d="M -96 18 L -62 18 L -74 84 L -106 84 Z" fill="#2A2C31" />
    <path d="M -20 18 L 22 18 L 32 104 L -4 108 Z" fill="#7C8A96" />
    <rect x={60} y={-26} width={124} height={38} rx={10} fill="#3B3E45" />
    {[78, 104, 130, 156].map((vx) => (
      <rect key={vx} x={vx} y={-18} width={12} height={22} rx={4} fill="#2A2C31" />
    ))}
    <rect x={182} y={-14} width={130} height={13} rx={4} fill="#1E2024" />
    <rect x={-70} y={-50} width={60} height={18} rx={5} fill="#1E2024" />
    <rect x={292} y={-28} width={9} height={16} fill="#1E2024" />
  </g>
);

/** Train rouge (origine : bas de l'avant de la locomotive, vers la droite) */
export const Train: React.FC<{spin: number}> = ({spin}) => {
  const car = (x: number, k: number) => (
    <g key={k} transform={`translate(${x} 0)`}>
      <rect x={-262} y={-150} width={256} height={124} rx={14} fill={C.red} />
      <rect x={-262} y={-74} width={256} height={12} fill={C.white} />
      {[-240, -180, -120, -60].map((wx) => (
        <rect key={wx} x={wx} y={-132} width={44} height={40} rx={6} fill={C.skyLight} />
      ))}
      {[-226, -176, -90, -40].map((wx) => (
        <g key={wx} transform={`translate(${wx} -20) rotate(${spin})`}>
          <circle r={17} fill="#3d3b44" />
          <rect x={-2} y={-15} width={4} height={30} fill="#888" />
        </g>
      ))}
    </g>
  );
  return (
    <g>
      {car(-540, 1)}
      {car(-270, 2)}
      <path d="M -262 -150 L -48 -150 Q 0 -150 10 -110 L 18 -26 L -262 -26 Z" fill={C.red} />
      <rect x={-262} y={-74} width={276} height={12} fill={C.white} />
      <path d="M -46 -134 L -10 -134 Q 4 -130 6 -104 L -46 -104 Z" fill={C.skyLight} />
      {[-230, -170, -110].map((wx) => (
        <rect key={wx} x={wx} y={-132} width={44} height={40} rx={6} fill={C.skyLight} />
      ))}
      <rect x={-180} y={-172} width={90} height={10} fill="#3d3b44" />
      <path d="M -160 -172 L -130 -196 L -100 -172" stroke="#3d3b44" strokeWidth={5} fill="none" />
      <circle cx={6} cy={-50} r={8} fill={C.yellow} />
      {[-226, -176, -90, -40].map((wx) => (
        <g key={wx} transform={`translate(${wx} -20) rotate(${spin})`}>
          <circle r={17} fill="#3d3b44" />
          <rect x={-2} y={-15} width={4} height={30} fill="#888" />
        </g>
      ))}
    </g>
  );
};

/** Paquet de dynamite (origine : centre) */
export const Dynamite: React.FC = () => (
  <g>
    {[-40, -13, 14].map((dx) => (
      <rect key={dx} x={dx} y={-55} width={26} height={110} rx={11} fill={C.red} />
    ))}
    <rect x={-44} y={-30} width={88} height={11} fill={C.ink} />
    <rect x={-44} y={20} width={88} height={11} fill={C.ink} />
  </g>
);

/** Couronne (origine : milieu du bas) */
export const Crown: React.FC<{color: string; gem: string; velvet: string}> = ({color, gem, velvet}) => (
  <g>
    <path d="M -72 -60 Q 0 -160 72 -60 Z" fill={velvet} />
    <polygon points="-82,-40 -82,-112 -48,-70 -20,-128 0,-80 20,-128 48,-70 82,-112 82,-40" fill={color} />
    {[
      [-82, -114],
      [-20, -130],
      [20, -130],
      [82, -114],
    ].map(([cx, cy]) => (
      <circle key={cx} cx={cx} cy={cy} r={10} fill={color} />
    ))}
    <circle cx={0} cy={-150} r={13} fill={color} />
    <rect x={-3} y={-178} width={6} height={22} fill={color} />
    <rect x={-10} y={-171} width={20} height={6} fill={color} />
    <rect x={-88} y={-46} width={176} height={46} rx={6} fill={color} />
    {[-52, 0, 52].map((gx) => (
      <circle key={gx} cx={gx} cy={-23} r={10} fill={gem} />
    ))}
    <rect x={-94} y={-8} width={188} height={18} rx={9} fill={C.white} />
    {[-70, -40, -10, 20, 50, 80].map((dx) => (
      <rect key={dx} x={dx - 3} y={-4} width={6} height={9} fill={C.ink} />
    ))}
  </g>
);

export const Coin: React.FC = () => (
  <g>
    <circle r={34} fill={C.gold} />
    <circle r={24} fill="none" stroke={C.goldDark} strokeWidth={4} />
    <path d="M -16 -20 Q -24 -6 -18 8" stroke={C.goldLight} strokeWidth={5} fill="none" strokeLinecap="round" />
  </g>
);

export const GoldBar: React.FC = () => (
  <g>
    <polygon points="-62,0 62,0 48,-40 -48,-40" fill={C.gold} />
    <polygon points="-48,-40 48,-40 40,-52 -40,-52" fill={C.goldLight} />
    <rect x={-30} y={-28} width={60} height={8} rx={3} fill={C.goldDark} opacity={0.6} />
  </g>
);

/** Colombe (origine : centre, vers la droite). flap : -1 → 1 */
export const Dove: React.FC<{flap: number}> = ({flap}) => (
  <g>
    <polygon points="-55,-6 -100,-30 -96,18" fill="#ECECEC" />
    <ellipse cx={-4} cy={0} rx={56} ry={28} fill={C.white} />
    <circle cx={48} cy={-18} r={21} fill={C.white} />
    <polygon points="66,-22 88,-15 66,-9" fill={C.orange} />
    <circle cx={54} cy={-23} r={3.5} fill={C.ink} />
    <path d="M 84 -12 Q 98 2 110 -4" stroke={C.grassDark} strokeWidth={4} fill="none" />
    <ellipse cx={100} cy={-10} rx={9} ry={5} fill={C.grass} />
    <ellipse cx={108} cy={2} rx={9} ry={5} fill={C.grass} />
    <g transform={`translate(-8 -6) scale(1 ${flap})`}>
      <path d="M -34 0 Q -14 -86 42 -74 Q 18 -34 30 0 Z" fill="#F4F4F4" />
      <path d="M -20 -10 Q 0 -50 30 -56" stroke="#DADADA" strokeWidth={3} fill="none" />
    </g>
  </g>
);

/** Poignée de main (origine : centre) */
export const Handshake: React.FC = () => (
  <g>
    <path d="M -620 -46 L -112 -64 L -100 56 L -620 76 Z" fill="#2E4A7D" />
    <rect x={-134} y={-68} width={36} height={128} rx={6} fill={C.white} />
    <path d="M 620 -46 L 112 -64 L 100 56 L 620 76 Z" fill={C.red} />
    <rect x={98} y={-68} width={36} height={128} rx={6} fill={C.white} />
    <path d="M -100 -48 Q -20 -74 62 -42 Q 98 -26 92 6 Q 86 34 40 44 L -100 50 Z" fill={C.skin} />
    <path d="M 100 -54 Q 22 -80 -52 -48 Q -80 -32 -64 -8 Q -42 8 0 -4 L 100 48 Z" fill="#E6B489" />
    <path d="M -46 -34 Q -10 -46 26 -44" stroke="#C48E62" strokeWidth={5} fill="none" strokeLinecap="round" />
    <path d="M -50 -16 Q -12 -26 30 -24" stroke="#C48E62" strokeWidth={5} fill="none" strokeLinecap="round" />
    <path d="M -38 0 Q 0 -8 34 -4" stroke="#C48E62" strokeWidth={5} fill="none" strokeLinecap="round" />
    <path d="M -30 -62 Q 10 -84 52 -66" stroke="#C48E62" strokeWidth={5} fill="none" strokeLinecap="round" />
  </g>
);

export const Bomb: React.FC<{frame: number}> = ({frame}) => (
  <g>
    <circle r={52} fill="#26262E" />
    <ellipse cx={-18} cy={-20} rx={13} ry={8} fill={C.white} opacity={0.45} />
    <rect x={-14} y={-68} width={28} height={20} rx={4} fill="#55555E" />
    <path d="M 0 -68 Q 8 -100 30 -100" stroke="#8B6B3A" strokeWidth={6} fill="none" />
    <polygon points={starPoints(6, 16, 7, `spark${step(frame, 2)}`)} transform="translate(32 -102)" fill={C.yellow} />
  </g>
);

export const Cloud: React.FC = () => (
  <g>
    <circle cx={0} cy={0} r={52} fill={C.white} />
    <circle cx={56} cy={-24} r={64} fill={C.white} />
    <circle cx={118} cy={0} r={46} fill={C.white} />
    <rect x={0} y={0} width={118} height={46} fill={C.white} />
    <circle cx={0} cy={0} r={46} fill={C.white} transform="translate(0 6)" />
  </g>
);

/** Rayons de soleil en papier */
export const Rays: React.FC<{cx: number; cy: number; n: number; color: string; rot: number; r?: number; opacity?: number}> = ({
  cx,
  cy,
  n,
  color,
  rot,
  r = 2400,
  opacity = 1,
}) => {
  const tris = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + Math.PI / n;
    tris.push(
      <polygon
        key={i}
        points={`${cx},${cy} ${cx + Math.cos(a0) * r},${cy + Math.sin(a0) * r} ${cx + Math.cos(a1) * r},${cy + Math.sin(a1) * r}`}
        fill={color}
      />,
    );
  }
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`} opacity={opacity}>
      {tris}
    </g>
  );
};

/** Calottes de neige automatiques sur les sommets d'une chaîne de montagnes */
export const snowCaps = (pts: readonly (readonly [number, number])[], frac = 0.3) => {
  const caps: string[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const [lx, ly] = pts[i - 1];
    const [rx, ry] = pts[i + 1];
    if (py < ly && py < ry) {
      const a: [number, number] = [px + (rx - px) * frac, py + (ry - py) * frac];
      const b: [number, number] = [px + (lx - px) * frac, py + (ly - py) * frac];
      const zig: [number, number][] = [];
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        zig.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + (k % 2 ? 24 : -4)]);
      }
      caps.push([[px, py], a, ...zig, b].map((p) => p.join(',')).join(' '));
    }
  }
  return caps;
};

export const Mountain: React.FC<{pts: readonly (readonly [number, number])[]; fill: string; snow?: boolean}> = ({pts, fill, snow = true}) => (
  <g>
    <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={fill} />
    {snow && snowCaps(pts).map((c) => <polygon key={c} points={c} fill={C.snow} />)}
  </g>
);

/** Petites étoiles qui tournent (étourdi / brillance) */
export const Sparkle: React.FC<{x: number; y: number; frame: number; size?: number; color?: string}> = ({
  x,
  y,
  frame,
  size = 22,
  color = C.yellow,
}) => (
  <polygon
    points={starPoints(4, size, size * 0.32, `sp${x}${y}`)}
    transform={`translate(${x} ${y}) rotate(${frame * 9}) scale(${0.8 + Math.abs(Math.sin(frame * 0.5)) * 0.4})`}
    fill={color}
  />
);
