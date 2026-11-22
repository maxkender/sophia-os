import type { ReactNode } from "react";

import type { T } from "./i18n";

// L'animation du téléphone (~18 s en boucle) : 7 scènes qui se suivent, en CSS pur.
// Avec prefers-reduced-motion, seule la première scène reste affichée (styles.css).
const DUREE = 18;

function Scene({ i, children }: { i: number; children: ReactNode }) {
  return (
    <g className={`scene s${i}`} style={{ animationDelay: `${(i * DUREE) / 7}s` }}>
      {children}
    </g>
  );
}

const Carte = ({ y, h = 40, fill = "var(--carte)" }: { y: number; h?: number; fill?: string }) => (
  <rect x="26" y={y} width="168" height={h} rx="10" fill={fill} />
);

export default function Telephone({ t }: { t: T }) {
  const legendes = [1, 2, 3, 4, 5, 6, 7].map((n) => t(`anim.${n}`));
  return (
    <figure className="telephone" aria-label={legendes.join(" → ")}>
      <svg viewBox="0 0 220 440" role="img" aria-hidden="true">
        <rect x="4" y="4" width="212" height="432" rx="34" fill="var(--coque)" />
        <rect x="14" y="16" width="192" height="408" rx="26" fill="var(--ecran)" />
        <rect x="80" y="24" width="60" height="10" rx="5" fill="var(--coque)" />

        <Scene i={0}>
          <text x="30" y="70" className="svg-titre">Dashboard</text>
          <Carte y={86} h={56} />
          <text x="40" y="110" className="svg-txt">Today</text>
          <text x="40" y="130" className="svg-fort">3 posts</text>
          <Carte y={152} />
          <Carte y={202} />
          <rect x="26" y="360" width="168" height="40" rx="20" fill="var(--accent)" />
          <text x="110" y="385" textAnchor="middle" className="svg-bouton">Start</text>
        </Scene>

        <Scene i={1}>
          <text x="30" y="70" className="svg-titre">Photos</text>
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <rect key={k} x={26 + (k % 3) * 58} y={86 + Math.floor(k / 3) * 74} width="52" height="68" rx="8"
              fill={k % 2 ? "var(--photo2)" : "var(--photo1)"} />
          ))}
          <circle cx="110" cy="300" r="26" fill="var(--accent)" />
          <path d="M110 286 v22 M100 300 l10 10 l10 -10" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
        </Scene>

        <Scene i={2}>
          <rect x="14" y="16" width="192" height="408" rx="26" fill="#000" />
          <text x="110" y="200" textAnchor="middle" fontSize="64" fill="#fff">♪</text>
          <rect x="88" y="370" width="44" height="30" rx="8" fill="#fff" />
          <path d="M110 377 v16 M102 385 h16" stroke="#000" strokeWidth="3" />
        </Scene>

        <Scene i={3}>
          <text x="30" y="70" className="svg-titre">Caption</text>
          <Carte y={86} h={120} />
          {[0, 1, 2, 3].map((k) => (
            <rect key={k} x="38" y={102 + k * 22} width={k === 3 ? 80 : 140} height="10" rx="5" fill="var(--ligne)" />
          ))}
          <rect x="120" y="220" width="74" height="30" rx="15" fill="var(--accent)" />
          <text x="157" y="240" textAnchor="middle" className="svg-bouton">Paste</text>
        </Scene>

        <Scene i={4}>
          <text x="30" y="70" className="svg-titre">Sound</text>
          <Carte y={86} h={48} />
          <text x="40" y="116" className="svg-txt">♪ original sound</text>
          <Carte y={146} h={48} />
          <text x="40" y="176" className="svg-fort">#learn #facts</text>
        </Scene>

        <Scene i={5}>
          <rect x="26" y="330" width="168" height="48" rx="24" fill="#fe2c55" />
          <text x="110" y="360" textAnchor="middle" className="svg-bouton">Post</text>
          <circle cx="110" cy="190" r="50" fill="var(--carte)" />
          <path d="M88 190 l16 16 l30 -32" stroke="var(--ok)" strokeWidth="8" fill="none" strokeLinecap="round" />
        </Scene>

        <Scene i={6}>
          <text x="30" y="70" className="svg-titre">Dashboard</text>
          <Carte y={86} h={48} />
          <text x="40" y="115" className="svg-txt">tiktok.com/@you/…</text>
          <circle cx="174" cy="110" r="12" fill="var(--ok)" />
          <path d="M168 110 l5 5 l9 -10" stroke="#fff" strokeWidth="3" fill="none" />
          <text x="110" y="200" textAnchor="middle" className="svg-fort">+ $</text>
        </Scene>
      </svg>
      <figcaption className="legendes" aria-hidden="true">
        {legendes.map((l, i) => (
          <span key={i} className={`scene s${i}`} style={{ animationDelay: `${(i * DUREE) / 7}s` }}>
            {i + 1}. {l}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
