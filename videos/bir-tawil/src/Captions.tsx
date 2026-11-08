import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/fonts";
import { lerp, pop } from "./lib";
import { useTimeline } from "./timeline";

const POLICE = "MontserratCaps";
[800, 900].forEach((w) => {
  loadFont({
    family: POLICE,
    url: staticFile(`fonts/montserrat-latin-${w}-normal.woff2`),
    weight: String(w),
  });
});

// contour noir épais façon CapCut (ombres en anneau) + ombre portée
const contour = (r: number) => {
  const out: string[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    out.push(
      `${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 #000`,
    );
  }
  out.push("0px 10px 18px rgba(0,0,0,0.45)");
  return out.join(", ");
};
const CONTOUR = contour(7);

/** Sous-titres dynamiques : 1 à 3 mots, le mot prononcé passe en jaune et grossit */
export const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const { pages } = useTimeline();
  const page = pages.find((p) => f >= p.de && f < p.a);
  if (!page) return null;
  const entree = pop(f, page.de, { damping: 12, stiffness: 320, mass: 0.6 });
  const outro = page.zone === "outro";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 110,
          right: 110,
          top: outro ? 110 : 1240,
          height: outro ? 220 : 260,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "center",
          justifyContent: "center",
          columnGap: outro ? 26 : 36,
          rowGap: 0,
          fontFamily: POLICE,
          fontWeight: 900,
          fontSize: outro ? 66 : 84,
          lineHeight: 1.12,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          textAlign: "center",
          scale: String(0.82 + 0.18 * entree),
          opacity: lerp(f, [page.de, page.de + 2], [0, 1]),
        }}
      >
        {page.mots.map((m, i) => {
          const actif =
            f >= m.de &&
            (i === page.mots.length - 1 || f < page.mots[i + 1].de);
          const p = actif
            ? pop(f, m.de, { damping: 9, stiffness: 400, mass: 0.5 })
            : 0;
          const grossi = actif ? 0.1 * Math.min(p, 1.2) : 0;
          // le mot actif grossit : on écarte ses voisins d'autant pour qu'ils ne se touchent pas
          const marge =
            (grossi * m.texte.length * 0.72 * (outro ? 66 : 84)) / 2;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: `0 ${marge.toFixed(1)}px`,
                color: actif ? "#FFE14D" : "#FFFFFF",
                textShadow: CONTOUR,
                scale: String(1 + grossi),
                rotate: actif ? `${(i % 2 ? 1 : -1) * 2}deg` : "0deg",
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

/** Sous-titres du rendu réaliste : un seul mot à la fois, blanc dans un encadré rouge, en haut de l'écran */
export const CaptionsMot: React.FC = () => {
  const f = useCurrentFrame();
  const { pages } = useTimeline();
  const page = pages.find((p) => f >= p.de && f < p.a);
  if (!page) return null;
  const k = page.mots.findIndex(
    (m, i) =>
      f >= m.de && (i === page.mots.length - 1 || f < page.mots[i + 1].de),
  );
  const m = page.mots[Math.max(0, k)];
  if (!m || f < m.de) return null;
  const p = pop(f, m.de, { damping: 14, stiffness: 420, mass: 0.5 });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: page.zone === "outro" ? 70 : 250,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: POLICE,
            fontWeight: 800,
            fontSize: 54,
            color: "#FFFFFF",
            background: "#D7263D",
            padding: "6px 22px 8px",
            borderRadius: 14,
            boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
            scale: String(0.9 + 0.1 * Math.min(p, 1.1)),
            whiteSpace: "nowrap",
          }}
        >
          {m.texte}
        </span>
      </div>
    </AbsoluteFill>
  );
};
