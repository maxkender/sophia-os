// Bibliothèque papier du Moyen Âge : personnages, décors et accessoires (tableaux calmes, peu d'animation).
import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {C} from './lib';

export const M = {
  sky: '#BFDDEB',
  skyWarm: '#F3D9AE',
  skyGrey: '#A7ADB4',
  night: '#24304A',
  nightDeep: '#18203A',
  hill: '#8DB46A',
  hillDark: '#6E9A52',
  hillFar: '#A9C78A',
  field: '#E2BC5C',
  fieldDark: '#C99B3A',
  mud: '#8A6A48',
  mudDark: '#6B4F33',
  dirt: '#9C7A55',
  plank: '#A8743F',
  plankDark: '#8A5B2E',
  stone: '#B7AE9E',
  stoneDark: '#8F8676',
  stoneLight: '#CFC7B8',
  thatch: '#D3A54A',
  thatchDark: '#B0842F',
  plaster: '#F1E6CC',
  timber: '#5A3A22',
  tunicBrown: '#8B6440',
  tunicGreen: '#6E8A4E',
  tunicRed: '#A8432F',
  tunicBlue: '#4F6E9A',
  tunicGrey: '#8E8A84',
  dress: '#7C5A8C',
  royal: '#7A2E3E',
  royalBlue: '#2F4C8A',
  gold: '#E2B23C',
  goldDark: '#B5862A',
  steel: '#B9C2CB',
  steelDark: '#8792A0',
  skin: '#F0C7A0',
  skinShade: '#DDAE84',
  hair: '#5B3B24',
  hairLight: '#B98C4E',
  hairGrey: '#C9C4BC',
  fire: '#F29A2E',
  fireHot: '#FFD25A',
  water: '#8EC3D6',
  candle: '#F3E7C6',
  grave: '#7D7468',
};

export type Chapeau = 'aucun' | 'capuche' | 'bonnet' | 'casque' | 'couronne' | 'voile' | 'heaume';

/** Personnage en papier découpé, origine aux pieds, ~360 px de haut à s = 1 */
export const Person: React.FC<{
  x?: number;
  y?: number;
  s?: number;
  tunic?: string;
  hair?: string;
  hat?: Chapeau;
  robe?: boolean;
  flip?: boolean;
  arm?: number; // angle du bras droit (0 = le long du corps, 90 = tendu devant)
  armL?: number;
  lie?: boolean;
  opacity?: number;
  cape?: string;
  armor?: boolean;
}> = ({x = 0, y = 0, s = 1, tunic = M.tunicBrown, hair = M.hair, hat = 'aucun', robe = false, flip = false, arm = 0, armL = 0, lie = false, opacity = 1, cape, armor = false}) => {
  const body = armor ? M.steel : tunic;
  const legs = armor ? M.steelDark : '#4E3A2A';
  const f = useCurrentFrame();
  const ph = x * 0.013 + y * 0.007;
  const souffle = lie ? 0 : Math.sin(f / 11 + ph) * 4;
  const cligne = (f + Math.round(x)) % 97 < 4;
  const balance = Math.sin(f / 17 + ph) * 4;
  arm = arm + balance;
  armL = armL - balance;
  return (
    <g transform={`translate(${x} ${y + souffle * s * 0.5}) scale(${flip ? -s : s} ${s * (1 + souffle * 0.002)}) ${lie ? 'rotate(-90)' : ''}`} opacity={opacity}>
      {cape && <path d="M -62 -250 Q -80 -120 -70 -30 L 70 -30 Q 80 -120 62 -250 Z" fill={cape} />}
      {!robe && (
        <>
          <rect x={-34} y={-100} width={26} height={100} rx={8} fill={legs} />
          <rect x={8} y={-100} width={26} height={100} rx={8} fill={legs} />
          <ellipse cx={-22} cy={-4} rx={22} ry={10} fill="#3A2A1C" />
          <ellipse cx={22} cy={-4} rx={22} ry={10} fill="#3A2A1C" />
        </>
      )}
      <g transform="translate(-48 -230)">
        <g transform={`rotate(${armL})`}>
          <rect x={-16} y={-4} width={30} height={130} rx={14} fill={body} />
          <circle cx={-1} cy={130} r={15} fill={armor ? M.steelDark : M.skin} />
        </g>
      </g>
      <path d={robe ? 'M -56 -250 L 56 -250 L 84 0 L -84 0 Z' : 'M -56 -250 L 56 -250 L 72 -84 L -72 -84 Z'} fill={body} />
      {armor && <path d="M -50 -240 L 50 -240 L 44 -150 L -44 -150 Z" fill={M.steelDark} opacity={0.35} />}
      <rect x={robe ? -66 : -62} y={-150} width={robe ? 132 : 124} height={14} fill={armor ? M.steelDark : '#4A3423'} />
      <g transform="translate(48 -230)">
        <g transform={`rotate(${-arm})`}>
          <rect x={-14} y={-4} width={30} height={130} rx={14} fill={body} />
          <circle cx={1} cy={130} r={15} fill={armor ? M.steelDark : M.skin} />
        </g>
      </g>
      <rect x={-14} y={-272} width={28} height={26} fill={M.skinShade} />
      <circle cx={0} cy={-305} r={44} fill={M.skin} />
      {hat !== 'heaume' && (
        <>
          <ellipse cx={-15} cy={-306} rx={5} ry={cligne ? 1 : 5} fill={C.ink} />
          <ellipse cx={15} cy={-306} rx={5} ry={cligne ? 1 : 5} fill={C.ink} />
          <path d="M -10 -284 Q 0 -278 10 -284" stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
        </>
      )}
      {hat === 'aucun' && <path d="M -46 -308 Q -44 -356 0 -354 Q 44 -356 46 -308 Q 30 -336 0 -334 Q -30 -336 -46 -308 Z" fill={hair} />}
      {hat === 'capuche' && <path d="M -58 -296 Q -60 -366 0 -368 Q 60 -366 58 -296 L 70 -246 L 46 -256 Q 44 -334 0 -336 Q -44 -334 -46 -256 L -70 -246 Z" fill={tunic === M.tunicBrown ? '#6F4E30' : tunic} />}
      {hat === 'bonnet' && (
        <>
          <path d="M -46 -308 Q -44 -356 0 -354 Q 44 -356 46 -308 Q 30 -336 0 -334 Q -30 -336 -46 -308 Z" fill={hair} />
          <path d="M -48 -322 Q -40 -372 10 -370 Q 54 -366 52 -326 Z" fill={M.tunicRed} />
        </>
      )}
      {hat === 'voile' && <path d="M -56 -290 Q -60 -364 0 -366 Q 60 -364 56 -290 L 62 -240 L 44 -250 Q 46 -330 0 -336 Q -46 -330 -44 -250 L -62 -240 Z" fill={M.plaster} />}
      {hat === 'casque' && <path d="M -50 -300 Q -50 -366 0 -368 Q 50 -366 50 -300 Z" fill={M.steel} />}
      {hat === 'heaume' && (
        <g>
          <path d="M -50 -262 L -50 -320 Q -50 -368 0 -370 Q 50 -368 50 -320 L 50 -262 Z" fill={M.steel} />
          <rect x={-40} y={-314} width={80} height={9} fill={C.ink} />
          <path d="M 0 -370 L 0 -262" stroke={M.steelDark} strokeWidth={6} />
        </g>
      )}
      {hat === 'couronne' && (
        <>
          <path d="M -46 -308 Q -44 -356 0 -354 Q 44 -356 46 -308 Q 30 -336 0 -334 Q -30 -336 -46 -308 Z" fill={hair} />
          <polygon points="-40,-336 -40,-380 -20,-356 0,-386 20,-356 40,-380 40,-336" fill={M.gold} />
          <circle cx={0} cy={-348} r={6} fill={C.red} />
        </>
      )}
    </g>
  );
};

/** Fond : ciel, collines, champ (origine 0,0 du plan 1080x1920) */
export const Countryside: React.FC<{sky?: string; hill?: string; field?: string; winter?: boolean; vie?: boolean}> = ({sky = M.sky, hill = M.hill, field = M.field, winter = false, vie = true}) => {
  const f = useCurrentFrame();
  return (
  <g>
    <rect x={-600} y={-600} width={2280} height={3200} fill={sky} />
    {vie && sky !== 'transparent' && (
      <>
        {[0, 1, 2].map((k) => (
          <g key={k} opacity={0.9}>
            <Cloudy x={((k * 520 + f * (0.8 + k * 0.3)) % 1900) - 450} y={420 + k * 130} s={0.9 + k * 0.25} c={winter ? '#F2F4F6' : '#FFFFFF'} />
          </g>
        ))}
        {!winter &&
          [0, 1, 2].map((k) => {
            const bx = ((f * 3.2 + k * 60) % 1700) - 300;
            const by = 640 + k * 34 + Math.sin(f / 9 + k) * 10;
            const w = Math.sin(f / 3 + k) * 10;
            return <path key={`b${k}`} d={`M ${bx - 22} ${by + w} Q ${bx - 10} ${by - 8} ${bx} ${by} Q ${bx + 10} ${by - 8} ${bx + 22} ${by + w}`} stroke="#3B3A44" strokeWidth={5} fill="none" strokeLinecap="round" />;
          })}
      </>
    )}
    <path d="M -600 1050 Q 0 880 540 980 Q 1100 1080 1680 920 L 1680 2600 L -600 2600 Z" fill={winter ? '#E6EBEF' : M.hillFar} filter="url(#pp)" />
    <path d="M -600 1200 Q 200 1060 700 1150 Q 1200 1240 1680 1110 L 1680 2600 L -600 2600 Z" fill={winter ? '#F4F6F8' : hill} filter="url(#pp)" />
    <path d="M -600 1420 Q 300 1340 1680 1400 L 1680 2600 L -600 2600 Z" fill={winter ? '#FBFCFD' : field} filter="url(#pp)" />
    {!winter &&
      Array.from({length: 9}, (_, i) => (
        <path key={i} d={`M -600 ${1500 + i * 70} Q ${540 + Math.sin(f / 20 + i) * 40} ${1460 + i * 72} 1680 ${1490 + i * 70}`} stroke={M.fieldDark} strokeWidth={6} fill="none" opacity={0.45} />
      ))}
  </g>
  );
};

export const Tree: React.FC<{x: number; y: number; s?: number; c?: string; bare?: boolean}> = ({x, y, s = 1, c = '#5E8A47', bare = false}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -16 0 L -10 -200 L 10 -200 L 16 0 Z" fill={M.timber} />
    {bare ? (
      <g stroke={M.timber} strokeWidth={10} strokeLinecap="round">
        <path d="M 0 -170 L -70 -260" />
        <path d="M 0 -190 L 60 -280" />
        <path d="M -40 -220 L -50 -300" />
      </g>
    ) : (
      <>
        <circle cx={0} cy={-260} r={110} fill={c} />
        <circle cx={-80} cy={-210} r={70} fill={c} />
        <circle cx={80} cy={-210} r={70} fill={c} />
        <circle cx={30} cy={-300} r={60} fill="#000" opacity={0.08} />
      </>
    )}
  </g>
);

/** Château sur une colline (origine : base au centre) */
export const Castle: React.FC<{x: number; y: number; s?: number; banner?: string; flag?: number}> = ({x, y, s = 1, banner = M.tunicRed, flag: flag0 = 0}) => {
  const flag = flag0 + Math.sin(useCurrentFrame() / 5) * 1.5;
  return (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <rect x={-220} y={-260} width={440} height={260} fill={M.stone} />
    {[-220, 160].map((tx) => (
      <g key={tx}>
        <rect x={tx} y={-380} width={60} height={380} fill={M.stoneDark} />
        <polygon points={`${tx - 10},-380 ${tx + 30},-450 ${tx + 70},-380`} fill={M.tunicBlue} />
      </g>
    ))}
    <rect x={-70} y={-420} width={140} height={160} fill={M.stoneDark} />
    <polygon points="-82,-420 0,-520 82,-420" fill={M.tunicBlue} />
    <path d={`M 0 -520 L 0 -600`} stroke={M.timber} strokeWidth={6} />
    <path d={`M 0 -600 Q 40 ${-590 + flag * 6} 80 -595 L 80 -560 Q 40 ${-555 + flag * 6} 0 -565 Z`} fill={banner} />
    {Array.from({length: 7}, (_, i) => (
      <rect key={i} x={-220 + i * 66} y={-284} width={36} height={26} fill={M.stone} />
    ))}
    <path d="M -45 0 L -45 -90 Q 0 -140 45 -90 L 45 0 Z" fill={M.timber} />
    {[-140, 110].map((wx) => (
      <rect key={wx} x={wx} y={-200} width={28} height={50} rx={14} fill={C.ink} opacity={0.7} />
    ))}
  </g>
  );
};

export const Church: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <rect x={-130} y={-180} width={200} height={180} fill={M.stoneLight} />
    <polygon points="-145,-180 -30,-270 85,-180" fill={M.stoneDark} />
    <rect x={70} y={-330} width={80} height={330} fill={M.stone} />
    <polygon points="62,-330 110,-430 158,-330" fill={M.stoneDark} />
    <rect x={106} y={-490} width={8} height={62} fill={M.timber} />
    <rect x={92} y={-472} width={36} height={8} fill={M.timber} />
    <path d="M -50 0 L -50 -70 Q -30 -100 -10 -70 L -10 0 Z" fill={M.timber} />
    <circle cx={110} cy={-270} r={18} fill={C.ink} opacity={0.6} />
  </g>
);

/** Chaumière vue de dehors (origine : bas du mur, au centre) */
const Fumee: React.FC<{x: number; y: number}> = ({x, y}) => {
  const f = useCurrentFrame();
  return (
    <g>
      {[0, 1, 2, 3].map((k) => {
        const t = ((f + k * 30) % 120) / 120;
        return <circle key={k} cx={x + Math.sin(t * 6 + k) * 20 + t * 40} cy={y - t * 260} r={22 + t * 40} fill="#E8E4DE" opacity={(1 - t) * 0.7} />;
      })}
    </g>
  );
};

export const Hut: React.FC<{x: number; y: number; s?: number; light?: number; snow?: boolean}> = ({x, y, s = 1, light = 0, snow = false}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <rect x={80} y={-300} width={40} height={90} fill={M.stoneDark} />
    <Fumee x={100} y={-310} />
    <rect x={-150} y={-170} width={300} height={170} fill={M.plaster} />
    {[-150, -40, 60, 145].map((bx) => (
      <rect key={bx} x={bx} y={-170} width={10} height={170} fill={M.timber} />
    ))}
    <polygon points="-190,-160 0,-320 190,-160" fill={snow ? '#F6F8FA' : M.thatch} />
    <polygon points="-190,-160 0,-320 0,-300 -160,-160" fill={snow ? '#E3E8EC' : M.thatchDark} />
    <rect x={-30} y={-110} width={60} height={110} fill={M.timber} />
    <rect x={70} y={-120} width={50} height={44} fill={light > 0 ? M.fireHot : C.ink} opacity={light > 0 ? 0.5 + light * 0.5 : 0.65} />
  </g>
);

/** Intérieur d'une chaumière : murs de planches, sol de terre, âtre */
export const Interior: React.FC<{fire?: number; dark?: number; window?: number}> = ({fire: fire0 = 1, dark = 0, window = 1}) => {
  const f = useCurrentFrame();
  const fire = fire0 * (0.85 + noise2D('feu', f / 6, 0) * 0.25);
  return (
  <g>
    <rect x={-600} y={-600} width={2280} height={3200} fill={M.plank} />
    {Array.from({length: 16}, (_, i) => (
      <rect key={i} x={-600 + i * 150} y={-600} width={8} height={2300} fill={M.plankDark} />
    ))}
    <rect x={620} y={560} width={220} height={200} fill={M.skyWarm} opacity={0.6 + window * 0.4} filter="url(#pp)" />
    <rect x={720} y={560} width={12} height={200} fill={M.timber} />
    <rect x={620} y={650} width={220} height={12} fill={M.timber} />
    <path d="M -600 1500 L 1680 1500 L 1680 2600 L -600 2600 Z" fill={M.dirt} filter="url(#pp)" />
    {Array.from({length: 14}, (_, i) => (
      <ellipse key={i} cx={-200 + random(`pi${i}`) * 1500} cy={1560 + random(`pj${i}`) * 500} rx={18} ry={7} fill={M.mudDark} opacity={0.4} />
    ))}
    <g transform="translate(160 1500)" filter="url(#pp)">
      {Array.from({length: 6}, (_, i) => (
        <ellipse key={i} cx={-90 + i * 36} cy={-14} rx={24} ry={16} fill={M.stoneDark} />
      ))}
      <path d={`M -60 -20 Q -40 ${-110 - fire * 30} -10 -40 Q 0 ${-150 - fire * 40} 20 -30 Q 50 ${-100 - fire * 30} 60 -20 Z`} fill={M.fire} opacity={fire} />
      <path d={`M -30 -22 Q 0 ${-90 - fire * 20} 30 -22 Z`} fill={M.fireHot} opacity={fire} />
      {fire0 > 0.05 &&
        [0, 1, 2, 3, 4].map((k) => {
          const t = ((f * 1.3 + k * 23) % 60) / 60;
          return <circle key={k} cx={Math.sin(k * 7 + t * 5) * 40} cy={-60 - t * 260} r={5} fill={M.fireHot} opacity={(1 - t) * fire0} />;
        })}
    </g>
    {window > 0.05 &&
      Array.from({length: 14}, (_, k) => {
        const px = 620 + random(`dx${k}`) * 260 + Math.sin(f / 40 + k) * 30;
        const py = 700 + ((random(`dy${k}`) * 700 + f * 0.6) % 700);
        return <circle key={k} cx={px} cy={py} r={3 + random(`dr${k}`) * 3} fill="#FFF3D0" opacity={0.5 * window} />;
      })}
    <rect x={-600} y={-600} width={2280} height={3200} fill={M.nightDeep} opacity={dark} />
  </g>
  );
};

export const Pig: React.FC<{x: number; y: number; s?: number; flip?: boolean}> = ({x, y, s = 1, flip}) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} filter="url(#pp)">
    {[-50, -20, 30, 60].map((lx) => (
      <rect key={lx} x={lx - 9} y={-40} width={18} height={40} rx={6} fill="#D88E8A" />
    ))}
    <ellipse cx={0} cy={-80} rx={100} ry={62} fill="#EBA6A0" />
    <circle cx={100} cy={-92} r={44} fill="#EBA6A0" />
    <ellipse cx={138} cy={-86} rx={16} ry={20} fill="#D88E8A" />
    <polygon points="86,-130 98,-160 112,-128" fill="#D88E8A" />
    <circle cx={108} cy={-104} r={5} fill={C.ink} />
    <path d="M -100 -96 q -24 -10 -16 -30" stroke="#D88E8A" strokeWidth={7} fill="none" />
  </g>
);

export const Cow: React.FC<{x: number; y: number; s?: number; flip?: boolean}> = ({x, y, s = 1, flip}) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} filter="url(#pp)">
    {[-90, -55, 55, 90].map((lx) => (
      <rect key={lx} x={lx - 12} y={-80} width={24} height={80} rx={6} fill="#7B5A3E" />
    ))}
    <rect x={-130} y={-200} width={260} height={130} rx={50} fill="#9C7552" />
    <ellipse cx={-40} cy={-150} rx={46} ry={34} fill={M.plaster} opacity={0.85} />
    <rect x={110} y={-250} width={90} height={110} rx={36} fill="#9C7552" />
    <ellipse cx={160} cy={-160} rx={44} ry={26} fill="#E6B9A2" />
    <path d="M 120 -246 q -20 -30 -6 -40 M 190 -246 q 20 -30 6 -40" stroke={M.plaster} strokeWidth={10} fill="none" strokeLinecap="round" />
    <circle cx={140} cy={-210} r={6} fill={C.ink} />
    <circle cx={176} cy={-210} r={6} fill={C.ink} />
  </g>
);

export const Crow: React.FC<{x: number; y: number; s?: number; flap?: number}> = ({x, y, s = 1, flap = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={0} cy={0} rx={34} ry={18} fill="#2B2A33" />
    <circle cx={32} cy={-10} r={14} fill="#2B2A33" />
    <polygon points="44,-12 62,-6 44,-2" fill={M.gold} />
    <path d={`M -10 -4 Q -30 ${-40 + flap * 50} -60 ${-30 + flap * 60} Q -30 -10 -10 -4 Z`} fill="#3B3A44" />
  </g>
);

export const Sack: React.FC<{x: number; y: number; s?: number; c?: string}> = ({x, y, s = 1, c = '#C9A66B'}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -60 0 Q -78 -80 -40 -130 L 40 -130 Q 78 -80 60 0 Z" fill={c} />
    <rect x={-30} y={-148} width={60} height={22} rx={8} fill={c} />
    <path d="M -34 -130 L 34 -130" stroke="#8C6A3A" strokeWidth={8} />
  </g>
);

export const Bowl: React.FC<{x: number; y: number; s?: number; fill?: number}> = ({x, y, s = 1, fill = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -80 -50 Q -70 10 0 14 Q 70 10 80 -50 Z" fill={M.plankDark} />
    <ellipse cx={0} cy={-50} rx={80} ry={16} fill="#5E3C20" />
    {fill > 0 && <ellipse cx={0} cy={-50} rx={70 * fill} ry={12 * fill} fill="#D8B068" />}
  </g>
);

export const Table: React.FC<{x: number; y: number; w?: number}> = ({x, y, w = 520}) => (
  <g transform={`translate(${x} ${y})`} filter="url(#pp)">
    <rect x={-w / 2} y={-30} width={w} height={30} fill={M.plankDark} />
    <rect x={-w / 2 + 30} y={0} width={26} height={180} fill={M.timber} />
    <rect x={w / 2 - 56} y={0} width={26} height={180} fill={M.timber} />
  </g>
);

export const Candle: React.FC<{x: number; y: number; s?: number; lit?: number}> = ({x, y, s = 1, lit = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {lit > 0 && <circle cx={0} cy={-150} r={120} fill={M.fireHot} opacity={0.18 * lit} />}
    <g filter="url(#pp)">
      <rect x={-22} y={-110} width={44} height={110} rx={6} fill={M.candle} />
      <ellipse cx={0} cy={0} rx={60} ry={14} fill={M.goldDark} />
      <rect x={-3} y={-128} width={6} height={20} fill={C.ink} />
    </g>
    {lit > 0 && <path d={`M 0 ${-128 - 50 * lit} Q 18 -150 0 -126 Q -18 -150 0 ${-128 - 50 * lit} Z`} fill={M.fire} opacity={lit} />}
    {lit < 1 && lit > 0.02 ? null : null}
    {lit <= 0.02 && <path d="M 0 -130 q 10 -30 -4 -60 q -12 -24 4 -50" stroke="#9A958F" strokeWidth={5} fill="none" opacity={0.6} />}
  </g>
);

export const Cradle: React.FC<{x: number; y: number; s?: number; baby?: number}> = ({x, y, s = 1, baby = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -130 -20 Q 0 40 130 -20" stroke={M.timber} strokeWidth={14} fill="none" />
    <path d="M -110 -120 L 110 -120 L 90 -20 L -90 -20 Z" fill={M.plank} />
    {baby > 0 && <circle cx={-40} cy={-130} r={32} fill={M.skin} opacity={baby} />}
    <path d="M -110 -120 L 110 -120" stroke={M.plankDark} strokeWidth={10} />
  </g>
);

export const Bed: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <rect x={-300} y={-120} width={600} height={90} fill={M.plankDark} />
    <rect x={-310} y={-220} width={30} height={220} fill={M.timber} />
    <rect x={280} y={-160} width={30} height={160} fill={M.timber} />
    <rect x={-280} y={-150} width={560} height={40} rx={16} fill="#D9CBA8" />
  </g>
);

export const Blanket: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -160 0 Q -170 -70 -60 -80 L 300 -80 L 300 0 Z" fill={M.tunicGreen} />
  </g>
);

export const GraveCross: React.FC<{x: number; y: number; s?: number; c?: string}> = ({x, y, s = 1, c = M.grave}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <ellipse cx={0} cy={0} rx={90} ry={22} fill={M.mud} />
    <rect x={-14} y={-200} width={28} height={200} fill={c} />
    <rect x={-60} y={-160} width={120} height={26} fill={c} />
  </g>
);

export const Flower: React.FC<{x: number; y: number; s?: number; c?: string}> = ({x, y, s = 1, c = '#D9534F'}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M 0 0 L 0 -80" stroke="#4E7A3A" strokeWidth={6} />
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse key={a} cx={0} cy={-100} rx={12} ry={22} fill={c} transform={`rotate(${a} 0 -80)`} />
    ))}
    <circle cx={0} cy={-80} r={10} fill={M.gold} />
  </g>
);

/** Rue de ville : maisons à colombages serrées */
export const TownStreet: React.FC<{dusk?: number; lit?: number[]; mud?: boolean}> = ({dusk = 0, lit = [], mud = true}) => {
  const houses = [
    {x: -200, w: 280, h: 760, c: M.plaster, r: M.tunicRed},
    {x: 90, w: 250, h: 900, c: '#EAD9B6', r: '#7A5638'},
    {x: 350, w: 300, h: 820, c: M.plaster, r: M.tunicBlue},
    {x: 660, w: 260, h: 950, c: '#E8D3C0', r: '#7A5638'},
    {x: 930, w: 300, h: 780, c: M.plaster, r: M.tunicRed},
  ];
  return (
    <g>
      <rect x={-600} y={-600} width={2280} height={3200} fill={dusk > 0 ? M.night : M.sky} />
      <rect x={-600} y={-600} width={2280} height={3200} fill={M.sky} opacity={1 - dusk} />
      {houses.map((h, i) => (
        <g key={i} filter="url(#pp)">
          <rect x={h.x} y={1450 - h.h} width={h.w} height={h.h} fill={h.c} />
          <polygon points={`${h.x - 20},${1450 - h.h} ${h.x + h.w / 2},${1450 - h.h - 180} ${h.x + h.w + 20},${1450 - h.h}`} fill={h.r} />
          {[0.33, 0.66].map((k) => (
            <rect key={k} x={h.x} y={1450 - h.h * k} width={h.w} height={12} fill={M.timber} />
          ))}
          <rect x={h.x} y={1450 - h.h} width={12} height={h.h} fill={M.timber} />
          <rect x={h.x + h.w - 12} y={1450 - h.h} width={12} height={h.h} fill={M.timber} />
          {[0.8, 0.5].map((k, j) => (
            <rect
              key={k}
              x={h.x + h.w / 2 - 40}
              y={1450 - h.h * k}
              width={80}
              height={90}
              fill={lit[i * 2 + j] ? M.fireHot : C.ink}
              opacity={lit[i * 2 + j] ? 0.4 + lit[i * 2 + j] * 0.6 : 0.6}
            />
          ))}
          <rect x={h.x + h.w / 2 - 45} y={1290} width={90} height={160} fill={M.timber} />
        </g>
      ))}
      <path d="M -600 1450 L 1680 1450 L 1680 2600 L -600 2600 Z" fill={M.stoneDark} filter="url(#pp)" />
      {Array.from({length: 40}, (_, i) => (
        <ellipse key={i} cx={-500 + (i % 10) * 240 + (Math.floor(i / 10) % 2) * 120} cy={1520 + Math.floor(i / 10) * 110} rx={90} ry={30} fill={M.stone} />
      ))}
      {mud && <path d="M 300 1460 Q 560 1700 400 2000 L 680 2000 Q 760 1700 720 1460 Z" fill={M.mudDark} opacity={0.85} filter="url(#pp)" />}
      <rect x={-600} y={-600} width={2280} height={3200} fill={M.nightDeep} opacity={dusk * 0.35} />
    </g>
  );
};

export const Shoe: React.FC<{x: number; y: number; s?: number; r?: number}> = ({x, y, s = 1, r = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`} filter="url(#pp)">
    <path d="M -90 0 L -90 -80 Q -60 -100 -20 -70 Q 40 -40 110 -30 Q 130 -10 110 0 Z" fill="#6B4528" />
    <rect x={-96} y={-6} width={210} height={14} rx={6} fill="#3A2614" />
  </g>
);

export const Workbench: React.FC<{x: number; y: number}> = ({x, y}) => (
  <g transform={`translate(${x} ${y})`} filter="url(#pp)">
    <rect x={-340} y={-260} width={680} height={50} fill={M.plankDark} />
    <rect x={-320} y={-210} width={36} height={210} fill={M.timber} />
    <rect x={284} y={-210} width={36} height={210} fill={M.timber} />
    <rect x={-300} y={-60} width={600} height={20} fill={M.timber} />
  </g>
);

export const Hourglass: React.FC<{x: number; y: number; s?: number; r?: number; t?: number}> = ({x, y, s = 1, r = 0, t = 0.5}) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`} filter="url(#pp)">
    <rect x={-110} y={-200} width={220} height={26} rx={6} fill={M.timber} />
    <rect x={-110} y={174} width={220} height={26} rx={6} fill={M.timber} />
    <path d="M -86 -174 L 86 -174 Q 86 -60 10 0 Q 86 60 86 174 L -86 174 Q -86 60 -10 0 Q -86 -60 -86 -174 Z" fill={M.water} opacity={0.45} />
    <path d={`M ${-70 * (1 - t)} ${-174 + 150 * t} L ${70 * (1 - t)} ${-174 + 150 * t} L 0 -10 Z`} fill={M.field} />
    <path d={`M -76 170 L 76 170 L ${60 * (1 - t) + 10} ${170 - 130 * t} L ${-60 * (1 - t) - 10} ${170 - 130 * t} Z`} fill={M.field} />
  </g>
);

export const Ship: React.FC<{x: number; y: number; s?: number; sail?: string}> = ({x, y, s = 1, sail = '#4A4550'}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -260 -80 L 260 -80 Q 220 30 0 40 Q -220 30 -260 -80 Z" fill={M.plankDark} />
    <rect x={-8} y={-420} width={16} height={340} fill={M.timber} />
    <path d="M -180 -400 Q 0 -350 180 -400 L 160 -130 Q 0 -100 -160 -130 Z" fill={sail} />
    <path d="M 8 -420 L 90 -400 L 8 -380 Z" fill={M.tunicRed} />
  </g>
);

export const Sea: React.FC<{y: number}> = ({y}) => {
  const f = useCurrentFrame();
  return (
  <g filter="url(#pp)">
    <rect x={-600} y={y} width={2280} height={2000} fill="#5E8FA8" />
    {Array.from({length: 6}, (_, i) => (
      <path key={i} transform={`translate(${((f * (1 + i * 0.3)) % 240) - 120} 0)`} d={`M -600 ${y + 60 + i * 90} q 60 -24 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0 t 120 0`} stroke="#86B3C8" strokeWidth={8} fill="none" />
    ))}
  </g>
  );
};

export const Sword: React.FC<{x: number; y: number; s?: number; r?: number}> = ({x, y, s = 1, r = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`} filter="url(#pp)">
    <polygon points="-14,0 14,0 10,-460 0,-500 -10,-460" fill={M.steel} />
    <rect x={-70} y={0} width={140} height={20} rx={6} fill={M.goldDark} />
    <rect x={-10} y={20} width={20} height={90} fill={M.timber} />
    <circle cx={0} cy={118} r={16} fill={M.goldDark} />
  </g>
);

export const Shield: React.FC<{x: number; y: number; s?: number; c?: string; c2?: string}> = ({x, y, s = 1, c = M.tunicRed, c2 = M.gold}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -80 -100 L 80 -100 L 80 0 Q 80 80 0 120 Q -80 80 -80 0 Z" fill={c} />
    <path d="M -10 -100 L 10 -100 L 10 110 Q 0 118 -10 110 Z" fill={c2} />
  </g>
);

export const Horse: React.FC<{x: number; y: number; s?: number; flip?: boolean; c?: string; lie?: number}> = ({x, y, s = 1, flip, c = '#7A5236', lie = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s}) rotate(${lie * -12})`} filter="url(#pp)">
    {[-120, -80, 80, 120].map((lx) => (
      <rect key={lx} x={lx - 14} y={-200} width={28} height={200} rx={8} fill={c} />
    ))}
    <rect x={-170} y={-330} width={340} height={150} rx={70} fill={c} />
    <path d="M 120 -300 L 200 -480 L 280 -440 L 220 -280 Z" fill={c} />
    <rect x={190} y={-500} width={120} height={70} rx={30} fill={c} />
    <path d="M 150 -330 L 210 -480 L 180 -470 L 130 -340 Z" fill="#3E2818" />
    <path d="M -170 -300 Q -240 -240 -220 -140" stroke="#3E2818" strokeWidth={26} fill="none" strokeLinecap="round" />
    <circle cx={260} cy={-475} r={7} fill={C.ink} />
    <rect x={-60} y={-350} width={120} height={60} rx={10} fill={M.tunicRed} />
  </g>
);

export const Tent: React.FC<{x: number; y: number; s?: number; c?: string; lit?: number}> = ({x, y, s = 1, c = M.plaster, lit = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <polygon points="-200,0 0,-280 200,0" fill={c} />
    <polygon points="-50,0 0,-160 50,0" fill={lit > 0 ? M.fireHot : M.timber} opacity={lit > 0 ? 0.5 + lit * 0.5 : 0.8} />
    <rect x={-4} y={-330} width={8} height={60} fill={M.timber} />
    <path d="M 4 -330 L 60 -316 L 4 -300 Z" fill={M.tunicRed} />
  </g>
);

export const Throne: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <rect x={-150} y={-560} width={300} height={560} rx={20} fill={M.goldDark} />
    <rect x={-120} y={-530} width={240} height={300} rx={16} fill={M.royal} />
    <rect x={-170} y={-230} width={340} height={70} rx={14} fill={M.gold} />
    <rect x={-150} y={-160} width={40} height={160} fill={M.goldDark} />
    <rect x={110} y={-160} width={40} height={160} fill={M.goldDark} />
    <circle cx={0} cy={-580} r={30} fill={M.gold} />
  </g>
);

const Torche: React.FC<{x: number; y: number}> = ({x, y}) => {
  const f = useCurrentFrame();
  const v = 0.8 + noise2D(`t${x}`, f / 5, 0) * 0.3;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={0} cy={-60} r={130} fill={M.fireHot} opacity={0.12 * v} />
      <rect x={-10} y={-20} width={20} height={90} fill={M.timber} />
      <path d={`M -22 -20 Q 0 ${-90 * v} 22 -20 Z`} fill={M.fire} />
      <path d={`M -10 -22 Q 0 ${-56 * v} 10 -22 Z`} fill={M.fireHot} />
    </g>
  );
};

export const ThroneRoom: React.FC = () => (
  <g>
    <rect x={-600} y={-600} width={2280} height={3200} fill={M.stoneDark} />
    {Array.from({length: 12}, (_, r) =>
      Array.from({length: 10}, (_, k) => (
        <rect key={`${r}-${k}`} x={-600 + k * 240 + (r % 2) * 120} y={-600 + r * 130} width={232} height={122} fill={M.stone} opacity={0.55} />
      )),
    )}
    {[80, 1000].map((px) => (
      <g key={px} filter="url(#pp)">
        <rect x={px - 60} y={-200} width={120} height={1700} fill={M.stoneLight} />
        <rect x={px - 110} y={60} width={220} height={520} fill={M.royal} />
        <polygon points={`${px - 110},580 ${px},500 ${px + 110},580`} fill={M.stoneDark} />
        <circle cx={px} cy={300} r={50} fill={M.gold} />
      </g>
    ))}
    <Torche x={300} y={760} />
    <Torche x={780} y={760} />
    <path d="M -600 1500 L 1680 1500 L 1680 2600 L -600 2600 Z" fill="#6A5F52" filter="url(#pp)" />
    <path d="M 380 1500 L 700 1500 L 900 2600 L 180 2600 Z" fill={M.tunicRed} filter="url(#pp)" />
  </g>
);

export const Goblet: React.FC<{x: number; y: number; s?: number; r?: number}> = ({x, y, s = 1, r = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s}) rotate(${r})`} filter="url(#pp)">
    <path d="M -60 -200 L 60 -200 Q 60 -100 0 -90 Q -60 -100 -60 -200 Z" fill={M.gold} />
    <ellipse cx={0} cy={-200} rx={60} ry={14} fill={M.royal} />
    <rect x={-8} y={-92} width={16} height={80} fill={M.goldDark} />
    <ellipse cx={0} cy={-8} rx={50} ry={12} fill={M.goldDark} />
  </g>
);

export const Chest: React.FC<{x: number; y: number; s?: number; open?: number; coins?: number}> = ({x, y, s = 1, open = 0, coins = 0}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <rect x={-160} y={-180} width={320} height={180} rx={10} fill={M.plankDark} />
    <rect x={-160} y={-120} width={320} height={16} fill={M.goldDark} />
    {coins > 0 && <ellipse cx={0} cy={-180} rx={140 * coins} ry={30 * coins} fill={M.gold} />}
    <g transform={`translate(0 -180) rotate(${-open * 100} -160 0)`}>
      <path d="M -160 0 Q -160 -90 0 -90 Q 160 -90 160 0 Z" fill={M.plank} />
    </g>
    <rect x={-22} y={-150} width={44} height={50} rx={6} fill={M.gold} />
  </g>
);

export const Tub: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <path d="M -200 -200 L 200 -200 L 180 0 L -180 0 Z" fill={M.plank} />
    {[-200, -60, 60].map((bx) => (
      <rect key={bx} x={bx + 60} y={-200} width={10} height={200} fill={M.plankDark} />
    ))}
    <rect x={-210} y={-150} width={420} height={18} fill={M.timber} />
    <rect x={-210} y={-60} width={420} height={18} fill={M.timber} />
    <ellipse cx={0} cy={-200} rx={200} ry={30} fill={M.water} />
  </g>
);

export const Steam: React.FC<{x: number; y: number; t: number; seed: string}> = ({x, y, t, seed}) => (
  <g transform={`translate(${x} ${y})`} opacity={t}>
    {[0, 1, 2].map((k) => {
      const ox = (k - 1) * 90 + (random(`${seed}${k}`) - 0.5) * 30;
      return <path key={k} d={`M ${ox} 0 q 30 -60 0 -120 q -30 -60 0 -120`} stroke="#FFFFFF" strokeWidth={18} strokeLinecap="round" fill="none" opacity={0.7} />;
    })}
  </g>
);

export const Moon: React.FC<{x: number; y: number}> = ({x, y}) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={80} fill="#F5EBC8" />
    <circle cx={34} cy={-20} r={70} fill={M.night} />
  </g>
);

export const Stars: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <g>
      {Array.from({length: 40}, (_, i) => (
        <circle key={i} cx={random(`sx${i}`) * 1080} cy={random(`sy${i}`) * 900} r={2 + random(`sr${i}`) * 4} fill="#F5EBC8" opacity={0.45 + 0.4 * Math.sin(f / 8 + i * 1.7)} />
      ))}
    </g>
  );
};

/** Lucioles de nuit */
export const Fireflies: React.FC<{y?: number}> = ({y = 1100}) => {
  const f = useCurrentFrame();
  return (
    <g>
      {Array.from({length: 16}, (_, i) => (
        <circle
          key={i}
          cx={random(`fx${i}`) * 1080 + Math.sin(f / 25 + i) * 40}
          cy={y + random(`fy${i}`) * 500 + Math.cos(f / 30 + i * 2) * 30}
          r={5}
          fill="#F8E58A"
          opacity={0.3 + 0.6 * Math.max(0, Math.sin(f / 10 + i * 2.3))}
        />
      ))}
    </g>
  );
};

export const Rain: React.FC<{t: number; f: number}> = ({t, f}) => (
  <g opacity={t}>
    {Array.from({length: 70}, (_, i) => {
      const x = random(`rx${i}`) * 1400 - 160;
      const y = ((random(`ry${i}`) * 2000 + f * 22) % 2000) - 80;
      return <path key={i} d={`M ${x} ${y} l -14 56`} stroke="#E6EEF2" strokeWidth={5} strokeLinecap="round" opacity={0.7} />;
    })}
  </g>
);

export const Snow: React.FC<{t: number; f: number}> = ({t, f}) => (
  <g opacity={t}>
    {Array.from({length: 60}, (_, i) => {
      const x = random(`snx${i}`) * 1200 - 60 + Math.sin(f / 30 + i) * 20;
      const y = ((random(`sny${i}`) * 2000 + f * 3) % 2000) - 40;
      return <circle key={i} cx={x} cy={y} r={5 + random(`snr${i}`) * 6} fill="#FFFFFF" opacity={0.85} />;
    })}
  </g>
);

export const Sun: React.FC<{x: number; y: number; r?: number; c?: string}> = ({x, y, r = 110, c = '#F6C64E'}) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={r * 1.6} fill={c} opacity={0.2} />
    <circle r={r} fill={c} />
  </g>
);

export const Cloudy: React.FC<{x: number; y: number; s?: number; c?: string}> = ({x, y, s = 1, c = '#FFFFFF'}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#pp)">
    <circle cx={0} cy={0} r={70} fill={c} />
    <circle cx={80} cy={-40} r={90} fill={c} />
    <circle cx={170} cy={0} r={66} fill={c} />
    <rect x={0} y={0} width={170} height={66} fill={c} />
  </g>
);

/** Marches des quatre vies (aucun texte) : la marche n est mise en avant */
export const Steps: React.FC<{n: number; t: number}> = ({n, t}) => (
  <g filter="url(#pp)">
    {[0, 1, 2, 3].map((k) => {
      const on = k + 1 === n;
      const x = 120 + k * 210;
      const h = 220 + k * 170;
      return <rect key={k} x={x} y={1500 - h} width={210} height={h} fill={on ? M.gold : k + 1 < n ? M.stoneDark : M.stone} opacity={on ? 0.6 + t * 0.4 : 1} />;
    })}
  </g>
);
