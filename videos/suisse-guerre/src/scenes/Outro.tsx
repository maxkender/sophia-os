import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {loadFont} from '@remotion/fonts';
import {C, ease, lerp, pop} from '../lib';
import {Coin, Debris, PaperDefs, Rays, SwissFlagRect} from '../shapes';
import {SOPHIA_MARK} from '../sophia';

// Police de l'appli Sophia
const F = 'Jakarta';
[400, 500, 600, 700, 800].forEach((w) => {
  loadFont({family: F, url: staticFile(`fonts/plus-jakarta-sans-latin-${w}-normal.woff2`), weight: String(w)});
});

const NAVY = '#1B3A6A';
const INK = '#1C2233';
const GREY = '#6B7385';
const LINE = '#E2E6EC';
const BG = '#F6F8FA';
const BLUE = '#3D6BB3';
const GREEN = '#2EAD67';
const GREEN_BG = '#E7F7EE';
const PINK = '#FC84B4';
const SHOT = staticFile('sophia-home.webp');

// Téléphone : écran 660x1428 px = 390x844 pt (×1.692)
const PT = 660 / 390;
const PHONE = {left: 192, top: 372, w: 696, h: 1464};
const SCREEN = {left: PHONE.left + 18, top: PHONE.top + 18};
const toPx = (x: number, y: number): [number, number] => [SCREEN.left + x * PT, SCREEN.top + y * PT];

// Chronologie (images, 30 i/s)
export const PUSH = {lesson: 48, quiz1: 120, quiz2: 176, done: 232};
export const TAPS: {f: number; x: number; y: number}[] = [
  {f: 44, x: 195, y: 452}, // Start
  {f: 116, x: 195, y: 787}, // Continue (cours)
  {f: 154, x: 195, y: 448}, // bonne réponse 1
  {f: 172, x: 195, y: 785}, // Continue
  {f: 208, x: 195, y: 448}, // bonne réponse 2
  {f: 228, x: 195, y: 785}, // Continue
];
const HAND: [number, number, number][] = [
  [0, 480, 1050],
  [22, 480, 1050],
  [40, 200, 456],
  [50, 200, 456],
  [64, 352, 705],
  [100, 352, 720],
  [112, 200, 790],
  [122, 200, 790],
  [138, 320, 700],
  [150, 205, 452],
  [158, 205, 452],
  [166, 200, 788],
  [178, 200, 788],
  [194, 330, 700],
  [204, 205, 452],
  [214, 205, 452],
  [222, 200, 788],
  [234, 200, 788],
  [252, 480, 1050],
];

const QUIZ = [
  {
    q: 'Since when has Swiss neutrality been officially recognized?',
    options: ['1648', '1815', '1914', '1945'],
    good: 1,
    fact: 'Congress of Vienna, 1815.',
  },
  {
    q: 'What did Switzerland rig with explosives during WW2?',
    options: ['Its banks', 'Its Alpine tunnels', 'Its lakes', 'Its cheese caves'],
    good: 1,
    fact: 'Gotthard and Simplon were ready to blow.',
  },
];

const press = (f: number, t: number) => (f >= t - 3 && f <= t + 4 ? 1 - Math.sin((Math.PI * (f - (t - 3))) / 7) * 0.06 : 1);
const pushX = (f: number, enter: number, exit?: number) =>
  (f < enter ? 390 : lerp(f, [enter, enter + 12], [390, 0], ease.inOut)) + (exit !== undefined ? lerp(f, [exit, exit + 12], [0, -120], ease.inOut) : 0);

const StatusBar: React.FC = () => (
  <div style={{position: 'absolute', left: 0, top: 0, width: 390, height: 50, overflow: 'hidden', background: BG}}>
    <Img src={SHOT} style={{width: 390, height: 844, display: 'block'}} />
  </div>
);

const Circle: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div
    style={{
      width: 40,
      height: 40,
      borderRadius: 20,
      background: '#fff',
      border: `1px solid ${LINE}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {children}
  </div>
);

const TopBar: React.FC<{progress: number; label: string}> = ({progress, label}) => (
  <div style={{position: 'absolute', top: 54, left: 16, right: 16, height: 44, display: 'flex', alignItems: 'center', gap: 12}}>
    <Circle>
      <svg width={16} height={16} viewBox="0 0 16 16">
        <path d="M3 3 L13 13 M13 3 L3 13" stroke="#3A4152" strokeWidth={2.2} strokeLinecap="round" />
      </svg>
    </Circle>
    <div style={{flex: 1, height: 6, borderRadius: 3, background: LINE, overflow: 'hidden'}}>
      <div style={{width: `${progress * 100}%`, height: '100%', background: NAVY, borderRadius: 3}} />
    </div>
    <div style={{fontFamily: F, fontSize: 15, color: GREY, fontWeight: 500}}>{label}</div>
    <Circle>
      <svg width={16} height={18} viewBox="0 0 16 18">
        <path d="M4 8 V5.5 a4 4 0 0 1 8 0 V8" stroke="#3A4152" strokeWidth={2} fill="none" />
        <rect x={2} y={8} width={12} height={9} rx={2.5} fill="#3A4152" />
      </svg>
    </Circle>
  </div>
);

const Button: React.FC<{label: string; color?: string; scale?: number; top?: number}> = ({label, color = NAVY, scale = 1, top = 760}) => (
  <div
    style={{
      position: 'absolute',
      left: 16,
      width: 358,
      top,
      height: 54,
      borderRadius: 27,
      background: color,
      color: '#fff',
      fontFamily: F,
      fontWeight: 600,
      fontSize: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      scale: String(scale),
    }}
  >
    {label}
    <svg width={18} height={14} viewBox="0 0 18 14">
      <path d="M1 7 H16 M10 1 L16 7 L10 13" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const Mark: React.FC<{p: number; children: React.ReactNode}> = ({p, children}) => (
  <span
    style={{
      backgroundImage: 'linear-gradient(transparent 52%, #FFE27A 52%)',
      backgroundSize: `${p * 100}% 100%`,
      backgroundRepeat: 'no-repeat',
      fontWeight: 600,
    }}
  >
    {children}
  </span>
);

/** Le cours (inventé) qui s'ouvre au clic sur Start */
const Lesson: React.FC<{f: number}> = ({f}) => {
  const scroll = lerp(f, [86, 110], [0, -165], ease.inOut);
  const para = (s: number) => ({opacity: lerp(f, [s, s + 8], [0, 1]), translate: `0px ${lerp(f, [s, s + 8], [14, 0])}px`});
  return (
    <AbsoluteFill style={{background: BG}}>
      <div style={{position: 'absolute', left: 16, top: 106 + scroll, width: 358, fontFamily: F}}>
        <div style={{width: 358, height: 220, borderRadius: 16, overflow: 'hidden', position: 'relative'}}>
          <Img src={SHOT} style={{position: 'absolute', width: 648, height: 1403, left: -143, top: -228, maxWidth: 'none'}} />
        </div>
        <div style={{marginTop: 18, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.3, color: BLUE}}>CURRENT AFFAIRS</div>
        <div style={{marginTop: 8, fontSize: 30, fontWeight: 500, lineHeight: 1.18, color: INK, letterSpacing: -0.3}}>
          Why is Switzerland never at war?
        </div>
        <div style={{marginTop: 10, fontSize: 18.5, lineHeight: 1.35, color: GREY}}>Neutral since 1815 and armed to the teeth.</div>
        <p style={{marginTop: 16, marginBottom: 0, fontSize: 15.5, lineHeight: 1.72, color: '#2A2F3B', textAlign: 'justify', ...para(62)}}>
          For more than 200 years, Switzerland has not fought a single foreign war. Not by luck, but by design: its mountains turn any
          invasion into a trap, its neutrality has been <Mark p={lerp(f, [74, 84], [0, 1])}>officially recognized since 1815</Mark>, and{' '}
          <Mark p={lerp(f, [84, 94], [0, 1])}>most men serve in a citizen army</Mark>.
        </p>
        <p style={{marginTop: 12, fontSize: 15.5, lineHeight: 1.72, color: '#2A2F3B', textAlign: 'justify', ...para(70)}}>
          In 1940, General Guisan planned to pull the whole army back into the Alps, the famous “Réduit”, ready to{' '}
          <Mark p={lerp(f, [96, 106], [0, 1])}>blow up the Alpine tunnels</Mark> if anyone invaded.
        </p>
      </div>
      <div style={{position: 'absolute', left: 0, top: 0, width: 390, height: 104, background: BG}} />
      <StatusBar />
      <TopBar progress={lerp(f, [56, 112], [0.12, 0.33])} label="1/3" />
      <div style={{position: 'absolute', left: 0, top: 690, width: 390, height: 154, background: `linear-gradient(rgba(246,248,250,0), ${BG} 45%)`}} />
      <Button label="Continue" scale={press(f, TAPS[1].f)} />
    </AbsoluteFill>
  );
};

/** Écran de quiz */
const Quiz: React.FC<{f: number; k: 0 | 1; enter: number; tap: number; next: number}> = ({f, k, enter, tap, next}) => {
  const q = QUIZ[k];
  const answered = f >= tap + 1;
  const panelY = lerp(f, [tap + 4, tap + 14], [270, 0], ease.out);
  return (
    <AbsoluteFill style={{background: BG, fontFamily: F}}>
      <StatusBar />
      <TopBar progress={answered ? lerp(f, [tap + 1, tap + 10], [0.33 + k * 0.33, 0.66 + k * 0.34]) : 0.33 + k * 0.33} label={`${k + 2}/3`} />
      <div style={{position: 'absolute', left: 16, top: 122, display: 'flex', alignItems: 'center', gap: 8}}>
        <svg width={16} height={20} viewBox="0 0 80 100">
          <path d={SOPHIA_MARK} fill={PINK} />
        </svg>
        <div style={{fontSize: 12.5, fontWeight: 700, letterSpacing: 1.3, color: BLUE}}>QUIZ · {k + 1} OF 2</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 16,
          top: 152,
          width: 358,
          fontSize: 27,
          fontWeight: 600,
          lineHeight: 1.24,
          color: INK,
          letterSpacing: -0.3,
          opacity: lerp(f, [enter + 8, enter + 14], [0, 1]),
          translate: `0px ${lerp(f, [enter + 8, enter + 14], [12, 0])}px`,
        }}
      >
        {q.q}
      </div>
      {q.options.map((o, i) => {
        const p = pop(f, enter + 14 + i * 3, {damping: 11, stiffness: 220});
        const good = answered && i === q.good;
        const bump = good ? 1 + 0.07 * (1 - pop(f, tap + 1, {damping: 7, stiffness: 300})) : 1;
        return (
          <div
            key={o}
            style={{
              position: 'absolute',
              left: 16,
              top: 340 + i * 76,
              width: 358,
              height: 64,
              borderRadius: 18,
              boxSizing: 'border-box',
              background: good ? GREEN_BG : '#fff',
              border: good ? `2px solid ${GREEN}` : `1.5px solid ${LINE}`,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 16px',
              opacity: Math.min(p, 1),
              scale: String((0.9 + 0.1 * p) * bump),
              translate: `0px ${(1 - p) * 24}px`,
              boxShadow: '0 2px 6px rgba(20,30,60,0.05)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: good ? GREEN : '#F1F3F7',
                color: good ? '#fff' : '#3D4558',
                fontWeight: 700,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {good ? (
                <svg width={16} height={12} viewBox="0 0 16 12">
                  <path d="M1.5 6 L6 10.5 L14.5 1.5" stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                'ABCD'[i]
              )}
            </div>
            <div style={{fontSize: 18, fontWeight: 600, color: good ? '#1F7A48' : INK}}>{o}</div>
          </div>
        );
      })}
      {/* bonne réponse : panneau du bas */}
      {answered && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 844 - 250,
            width: 390,
            height: 260,
            background: '#fff',
            borderRadius: '28px 28px 0 0',
            boxShadow: '0 -8px 30px rgba(20,30,60,0.12)',
            translate: `0px ${panelY}px`,
          }}
        >
          <div style={{position: 'absolute', left: 20, top: 24, display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={{width: 40, height: 40, borderRadius: 20, background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <svg width={20} height={15} viewBox="0 0 16 12">
                <path d="M1.5 6 L6 10.5 L14.5 1.5" stroke="#fff" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{fontSize: 24, fontWeight: 800, color: '#1F7A48'}}>Correct!</div>
            <div
              style={{
                marginLeft: 8,
                padding: '5px 12px',
                borderRadius: 14,
                background: '#FFF3D1',
                color: '#B7791F',
                fontWeight: 800,
                fontSize: 15,
                scale: String(pop(f, tap + 10, {damping: 8})),
              }}
            >
              +10 XP
            </div>
          </div>
          <div style={{position: 'absolute', left: 20, top: 80, fontSize: 16, color: GREY}}>{q.fact}</div>
        </div>
      )}
      {answered && <Button label="Continue" color={GREEN} scale={press(f, next)} top={760 + panelY} />}
    </AbsoluteFill>
  );
};

const Flame: React.FC<{s: number}> = ({s}) => (
  <svg width={34 * s} height={42 * s} viewBox="0 0 34 42">
    <path d="M17 1 C 20 10 32 16 32 27 A 15 15 0 0 1 2 27 C 2 19 8 15 10 8 C 13 13 15 14 17 1 Z" fill="#FF7A1A" />
    <path d="M17 18 C 19 23 25 26 25 31 A 8 8 0 0 1 9 31 C 9 27 13 25 17 18 Z" fill="#FFC93C" />
  </svg>
);

/** Fin du cours : série + XP */
const Done: React.FC<{f: number; enter: number}> = ({f, enter}) => {
  const t = (d: number) => pop(f, enter + d, {damping: 9, stiffness: 200});
  const flipped = f >= enter + 26;
  return (
    <AbsoluteFill style={{background: BG, fontFamily: F}}>
      <StatusBar />
      <div style={{position: 'absolute', left: 0, top: 120, width: 390, display: 'flex', justifyContent: 'center'}}>
        <svg width={120} height={150} viewBox="0 0 80 100" style={{scale: String(t(6)), rotate: `${Math.sin(f * 0.25) * 4}deg`, overflow: 'visible'}}>
          <path d={SOPHIA_MARK} fill={PINK} stroke="#111" strokeWidth={7} strokeLinejoin="round" paintOrder="stroke" />
        </svg>
      </div>
      <div style={{position: 'absolute', left: 0, top: 296, width: 390, textAlign: 'center', fontSize: 32, fontWeight: 800, color: INK, scale: String(t(10))}}>
        Lesson complete!
      </div>
      <div style={{position: 'absolute', left: 0, top: 344, width: 390, textAlign: 'center', fontSize: 17, color: GREY, opacity: lerp(f, [enter + 14, enter + 20], [0, 1])}}>
        2/2 correct answers
      </div>
      <div style={{position: 'absolute', left: 16, top: 400, width: 358, display: 'flex', gap: 14}}>
        <div
          style={{
            flex: 1,
            height: 130,
            borderRadius: 22,
            background: '#fff',
            border: `1.5px solid ${LINE}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            scale: String(t(16)),
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <Flame s={flipped ? 1 + 0.25 * (1 - pop(f, enter + 26, {damping: 6})) : 1} />
            <div style={{fontSize: 40, fontWeight: 800, color: flipped ? '#FF7A1A' : INK, scale: String(flipped ? 0.6 + 0.4 * pop(f, enter + 26, {damping: 7}) : 1)}}>
              {flipped ? 3 : 2}
            </div>
          </div>
          <div style={{fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: GREY}}>DAYS STREAK</div>
        </div>
        <div
          style={{
            flex: 1,
            height: 130,
            borderRadius: 22,
            background: '#fff',
            border: `1.5px solid ${LINE}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            scale: String(t(20)),
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <svg width={26} height={36} viewBox="0 0 26 36">
              <polygon points="15,1 2,21 12,21 9,35 24,13 14,13" fill="#F5B82E" />
            </svg>
            <div style={{fontSize: 40, fontWeight: 800, color: '#B7791F'}}>+20</div>
          </div>
          <div style={{fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: GREY}}>XP EARNED</div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 16, top: 560, width: 358, opacity: lerp(f, [enter + 24, enter + 32], [0, 1])}}>
        <div style={{fontSize: 12.5, fontWeight: 700, letterSpacing: 1.3, color: BLUE}}>UP NEXT</div>
        <div style={{marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 18, padding: 12}}>
          <div style={{width: 58, height: 58, borderRadius: 12, overflow: 'hidden', position: 'relative', flexShrink: 0}}>
            <Img src={SHOT} style={{position: 'absolute', width: 362, height: 784, left: -60, top: -640, maxWidth: 'none'}} />
          </div>
          <div style={{fontSize: 16, fontWeight: 600, color: INK, lineHeight: 1.3}}>Why did Sisyphus never give up?</div>
        </div>
      </div>
      <Button label="Next lesson" top={760} />
    </AbsoluteFill>
  );
};

/** Main qui tape sur l'écran (pointe du doigt en 0,0) */
const Hand: React.FC<{scale: number}> = ({scale}) => (
  <svg width={260} height={320} viewBox="-60 -10 260 320" style={{overflow: 'visible', filter: 'drop-shadow(0 14px 16px rgba(40,25,10,0.35))'}}>
    <g transform={`rotate(-16) scale(${1.15 * scale})`} stroke="#B9805A" strokeWidth={4} strokeLinejoin="round">
      <rect x={-17} y={0} width={34} height={124} rx={17} fill={C.skin} />
      <rect x={14} y={70} width={30} height={74} rx={15} fill={C.skin} />
      <rect x={42} y={80} width={30} height={66} rx={15} fill={C.skin} />
      <rect x={68} y={92} width={26} height={58} rx={13} fill={C.skin} />
      <path d="M -24 120 Q -46 104 -50 130 Q -44 160 -18 178" fill={C.skin} />
      <rect x={-26} y={112} width={124} height={104} rx={40} fill={C.skin} />
      <rect x={-12} y={200} width={104} height={80} rx={12} fill={NAVY} stroke="none" />
      <rect x={-16} y={196} width={112} height={18} rx={8} fill="#fff" stroke="none" />
    </g>
  </svg>
);

// 0:36–0:45 — « réponds à toutes ces questions avec Sophia » : le cours s'ouvre, puis les quiz
export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const slam = pop(f, 2, {damping: 12, stiffness: 140, mass: 0.9});
  const drift = lerp(f, [20, 275], [1, 1.035], ease.linear);

  // position de la main
  const hx = lerp(f, HAND.map((h) => h[0]), HAND.map((h) => h[1]), ease.inOut);
  const hy = lerp(f, HAND.map((h) => h[0]), HAND.map((h) => h[2]), ease.inOut);
  const tapping = TAPS.reduce((m, t) => m * press(f, t.f) * press(f, t.f), 1);
  const [px, py] = toPx(hx, hy);

  const startDark = f >= 41 && f <= 50 ? Math.sin(((f - 41) / 9) * Math.PI) * 0.28 : 0;

  return (
    <AbsoluteFill style={{backgroundColor: '#F6C6D9'}}>
      {/* fond papier rose + bouts de papier qui flottent */}
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <PaperDefs frame={f / 1.2} />
        <rect width={1080} height={1920} fill="#F6C6D9" />
        <Rays cx={540} cy={1000} n={22} color="#FADAE6" rot={f * 0.6} />
        {[
          [95, 1500, 0.9, 0],
          [990, 1250, 0.8, 1],
          [80, 700, 0.7, 2],
          [1000, 560, 0.75, 3],
          [120, 1080, 0.6, 4],
          [970, 1620, 0.7, 5],
        ].map(([x, y, s, i]) => (
          <g
            key={i}
            transform={`translate(${x} ${y - ((f * (1.4 + i * 0.25)) % 400)}) rotate(${f * (i % 2 ? 2 : -2) + i * 40}) scale(${s * pop(f, 4 + i * 3)})`}
            filter="url(#pp)"
          >
            {i % 2 ? <SwissFlagRect s={80} /> : <Coin />}
          </g>
        ))}
      </svg>

      {/* téléphone + main */}
      <AbsoluteFill
        style={{
          translate: `0px ${(1 - slam) * 1600}px`,
          rotate: `${(1 - slam) * 14}deg`,
          scale: String(drift),
          transformOrigin: '540px 1100px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: PHONE.left,
            top: PHONE.top,
            width: PHONE.w,
            height: PHONE.h,
            borderRadius: 104,
            background: '#111114',
            boxShadow: '0 50px 90px rgba(90,20,50,0.35), inset 0 0 0 3px #3a3a40',
          }}
        >
          <div style={{position: 'absolute', left: -6, top: 300, width: 6, height: 90, borderRadius: 3, background: '#2a2a30'}} />
          <div style={{position: 'absolute', left: -6, top: 420, width: 6, height: 90, borderRadius: 3, background: '#2a2a30'}} />
          <div style={{position: 'absolute', right: -6, top: 360, width: 6, height: 140, borderRadius: 3, background: '#2a2a30'}} />
          <div style={{position: 'absolute', left: 18, top: 18, width: 660, height: 1428, borderRadius: 86, overflow: 'hidden', background: BG}}>
            <div style={{position: 'absolute', left: 0, top: 0, width: 390, height: 844, scale: String(PT), transformOrigin: '0 0'}}>
              {/* accueil (capture de l'appli) */}
              {f < PUSH.lesson + 12 && (
                <AbsoluteFill style={{translate: `${pushX(f, -100, PUSH.lesson)}px 0px`}}>
                  <Img src={SHOT} style={{width: 390, height: 844}} />
                  <div style={{position: 'absolute', left: 32, top: 425, width: 325, height: 54, borderRadius: 27, background: `rgba(0,0,0,${startDark})`}} />
                </AbsoluteFill>
              )}
              {f >= PUSH.lesson && f < PUSH.quiz1 + 12 && (
                <AbsoluteFill style={{translate: `${pushX(f, PUSH.lesson, PUSH.quiz1)}px 0px`}}>
                  <Lesson f={f} />
                </AbsoluteFill>
              )}
              {f >= PUSH.quiz1 && f < PUSH.quiz2 + 12 && (
                <AbsoluteFill style={{translate: `${pushX(f, PUSH.quiz1, PUSH.quiz2)}px 0px`}}>
                  <Quiz f={f} k={0} enter={PUSH.quiz1} tap={TAPS[2].f} next={TAPS[3].f} />
                </AbsoluteFill>
              )}
              {f >= PUSH.quiz2 && f < PUSH.done + 12 && (
                <AbsoluteFill style={{translate: `${pushX(f, PUSH.quiz2, PUSH.done)}px 0px`}}>
                  <Quiz f={f} k={1} enter={PUSH.quiz2} tap={TAPS[4].f} next={TAPS[5].f} />
                </AbsoluteFill>
              )}
              {f >= PUSH.done && (
                <AbsoluteFill style={{translate: `${pushX(f, PUSH.done)}px 0px`}}>
                  <Done f={f} enter={PUSH.done} />
                </AbsoluteFill>
              )}
              {/* ondes de tap + confettis dans l'écran */}
              <svg viewBox="0 0 390 844" width={390} height={844} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
                <PaperDefs frame={f / 1.2} />
                {TAPS.map((t, i) =>
                  f >= t.f && f <= t.f + 12 ? (
                    <circle key={i} cx={t.x} cy={t.y} r={lerp(f, [t.f, t.f + 12], [6, 46])} fill={NAVY} opacity={lerp(f, [t.f, t.f + 12], [0.3, 0])} />
                  ) : null,
                )}
                {[TAPS[2].f, TAPS[4].f].map((t, i) => (
                  <Debris
                    key={i}
                    x={195}
                    y={448}
                    frame={f}
                    start={t + 1}
                    n={30}
                    seed={`qz${i}`}
                    colors={[GREEN, PINK, C.yellow, NAVY, C.red]}
                    speed={9}
                    gravity={0.55}
                    size={11}
                  />
                ))}
              </svg>
            </div>
          </div>
          {/* Dynamic Island */}
          <div style={{position: 'absolute', left: PHONE.w / 2 - 95, top: 36, width: 190, height: 54, borderRadius: 27, background: '#000'}} />
        </div>
        {/* la main */}
        {f >= 20 && f <= 254 && (
          <div style={{position: 'absolute', left: px - 60, top: py + 10 - 10, width: 0, height: 0}}>
            <div style={{position: 'absolute', left: 0, top: -10}}>
              <Hand scale={tapping} />
            </div>
          </div>
        )}
      </AbsoluteFill>

      {/* gros confettis de fin */}
      <svg viewBox="0 0 1080 1920" width={1080} height={1920} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
        <PaperDefs frame={f / 1.2} />
        <Debris x={120} y={1800} frame={f} start={PUSH.done + 14} n={40} seed="cf1" colors={[PINK, NAVY, C.yellow, C.red, C.cream, GREEN]} speed={46} gravity={1.5} size={30} spread={0.9} dir={-Math.PI / 2.6} />
        <Debris x={960} y={1800} frame={f} start={PUSH.done + 17} n={40} seed="cf2" colors={[PINK, NAVY, C.yellow, C.red, C.cream, GREEN]} speed={46} gravity={1.5} size={30} spread={0.9} dir={-Math.PI + Math.PI / 2.6} />
      </svg>
    </AbsoluteFill>
  );
};
