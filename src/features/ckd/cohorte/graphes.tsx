import * as React from "react";

import { useLargeur } from "@/components/charts/useLargeur";
import { cn } from "@/lib/utils";

import { echelle } from "./logique";

/**
 * Les graphes du suivi par cohorte, dessinés à la main comme le reste de l'OS
 * (pas de bibliothèque) : traits fins, bout arrondi côté valeur, carré côté
 * base, le texte dans les couleurs du texte et jamais dans celle de la donnée.
 * Chaque jour se survole (souris) ou se parcourt au clavier (un bouton par
 * jour) ; l'image entière se résume dans son `aria-label`.
 */

/** Les étapes du warm-up, du plus clair au plus foncé : une seule teinte, dans l'ordre. */
export const BLEUS = ["#86b6ef", "#3987e5", "#184f95"] as const;
/** La barre des posts publiés. */
export const BLEU_BARRE = "#2a78d6";

function barreArrondie(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function Infobulle({ x, largeur, children }: { x: number; largeur: number; children: React.ReactNode }) {
  const LARG = 200;
  const gauche = x + 14 + LARG < largeur ? x + 14 : Math.max(0, x - 14 - LARG);
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute top-2 z-10 flex flex-col gap-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: gauche, width: LARG }}
    >
      {children}
    </div>
  );
}

export interface JourBarre {
  cle: string;
  libelle: string;
  /** Pour l'infobulle et le lecteur d'écran (« mardi 20 oct. »). */
  libelleLong: string;
  prevus: number;
  publies: number;
  aVenir: boolean;
}

/** Les posts publiés par jour, sur fond des posts prévus. */
export function BarresPubliees({
  jours,
  jourActif,
  ariaLabel,
  texteJour,
  hauteur = 210,
}: {
  jours: JourBarre[];
  jourActif?: string | null;
  ariaLabel: string;
  texteJour: (j: JourBarre) => { titre: string; lignes: string[] };
  hauteur?: number;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(520);
  const [survol, setSurvol] = React.useState<number | null>(null);
  const { haut: max, ticks } = echelle(Math.max(...jours.map((j) => j.prevus), 1));
  const padL = 34;
  const padR = 8;
  const padT = 22;
  const padB = 26;
  const iw = Math.max(1, largeur - padL - padR);
  const ih = hauteur - padT - padB;
  const y = (v: number) => padT + ih - (v / max) * ih;
  const bande = iw / Math.max(1, jours.length);
  const larg = Math.min(44, bande * 0.5);
  const centre = (i: number) => padL + bande * (i + 0.5);

  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setSurvol(null)}>
      <svg width={largeur} height={hauteur} role="img" aria-label={ariaLabel} className="block max-w-full overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={largeur - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-border" : "stroke-border/50"} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {jours.map((j, i) => {
          const x = centre(i) - larg / 2;
          return (
            <g key={j.cle}>
              {j.prevus > 0 && (
                <path d={barreArrondie(x, y(j.prevus), larg, y(0) - y(j.prevus), 4)} className="fill-muted" />
              )}
              {j.publies > 0 && (
                <path
                  d={barreArrondie(x, y(j.publies), larg, y(0) - y(j.publies), 4)}
                  fill={BLEU_BARRE}
                  opacity={survol === null || survol === i ? 1 : 0.55}
                />
              )}
              {!j.aVenir && j.prevus > 0 && (
                <text x={centre(i)} y={y(j.publies) - 6} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">
                  {j.publies}
                </text>
              )}
              <text
                x={centre(i)}
                y={hauteur - 7}
                textAnchor="middle"
                className={cn("text-[11px]", j.cle === jourActif ? "fill-foreground font-semibold" : "fill-muted-foreground")}
              >
                {j.libelle}
              </text>
            </g>
          );
        })}
      </svg>
      {jours.map((j, i) => (
        <button
          key={j.cle}
          type="button"
          aria-label={[texteJour(j).titre, ...texteJour(j).lignes].join(" · ")}
          className="absolute cursor-crosshair rounded-sm bg-transparent focus-visible:outline-2 focus-visible:outline-ring"
          style={{ left: padL + bande * i, top: padT, width: bande, height: ih }}
          onMouseEnter={() => setSurvol(i)}
          onFocus={() => setSurvol(i)}
          onBlur={() => setSurvol(null)}
        />
      ))}
      {survol !== null && (
        <Infobulle x={centre(survol)} largeur={largeur}>
          <p className="text-sm font-semibold">{texteJour(jours[survol]!).titre}</p>
          {texteJour(jours[survol]!).lignes.map((l) => (
            <p key={l} className="tabular-nums text-muted-foreground first:text-foreground">
              {l}
            </p>
          ))}
        </Infobulle>
      )}
    </div>
  );
}

export interface SerieCourbe {
  cle: string;
  libelle: string;
  /** Le nom écrit au bout de la courbe, s'il faut plus court. */
  court?: string;
  couleur: string;
  valeurs: (number | null)[];
}

/** Des cumuls jour par jour, une courbe par étape, chacune nommée au bout. */
export function CourbesCumul({
  jours,
  series,
  aujourdhui,
  ariaLabel,
  libelleAVenir,
  hauteur = 230,
}: {
  /** `court` : l'étiquette de l'axe quand la place manque (« L 19 »). */
  jours: { cle: string; libelle: string; court?: string; libelleLong: string }[];
  series: SerieCourbe[];
  aujourdhui: string;
  ariaLabel: string;
  libelleAVenir: string;
  hauteur?: number;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(600);
  const [survol, setSurvol] = React.useState<number | null>(null);
  const { haut: max, ticks } = echelle(Math.max(...series.flatMap((s) => s.valeurs.map((v) => v ?? 0)), 1));
  // Sur un écran étroit, moins de marge pour les noms au bout des courbes.
  const padL = 34;
  const padR = largeur < 520 ? 96 : 132;
  const padT = 16;
  const padB = 26;
  const iw = Math.max(1, largeur - padL - padR);
  const ih = hauteur - padT - padB;
  const pas = iw / Math.max(1, jours.length - 1);
  const x = (i: number) => padL + pas * i;
  const etiquetteCourte = pas < 56;
  const y = (v: number) => padT + ih - (v / max) * ih;

  const trace = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .reduce<string[]>((segs, p, i, tout) => {
        if (p === null) return segs;
        segs.push(`${i === 0 || tout[i - 1] === null ? "M" : "L"}${p}`);
        return segs;
      }, [])
      .join(" ");

  // Les étiquettes au bout de chaque courbe, écartées d'au moins 14 px.
  const etiquettes = series
    .map((s) => {
      const i = s.valeurs.reduce<number>((dernier, v, k) => (v === null ? dernier : k), -1);
      return i < 0 ? null : { s, i, y: y(s.valeurs[i]!) };
    })
    .filter((e): e is { s: SerieCourbe; i: number; y: number } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < etiquettes.length; k++) {
    if (etiquettes[k]!.y - etiquettes[k - 1]!.y < 14) etiquettes[k]!.y = etiquettes[k - 1]!.y + 14;
  }
  const xEtiquette = Math.max(...etiquettes.map((e) => x(e.i)), padL) + 10;

  return (
    <div ref={ref} className="relative w-full min-w-0" onMouseLeave={() => setSurvol(null)}>
      <svg width={largeur} height={hauteur} role="img" aria-label={ariaLabel} className="block max-w-full overflow-visible">
        {jours.map((j, i) =>
          j.cle > aujourdhui ? (
            <rect key={j.cle} x={x(i) - pas / 2} y={padT} width={pas} height={ih} className="fill-muted/60" rx={4} />
          ) : null,
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={padL + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-border" : "stroke-border/50"} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {survol !== null && (
          <line x1={x(survol)} x2={x(survol)} y1={padT} y2={padT + ih} className="stroke-foreground/30" strokeWidth={1} />
        )}
        {series.map((s) => (
          <g key={s.cle}>
            <path d={trace(s.valeurs)} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.valeurs.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={survol === i ? 5 : 4} fill={s.couleur} className="stroke-card" strokeWidth={2} />
              ),
            )}
          </g>
        ))}
        {etiquettes.map((e) => (
          <text key={e.s.cle} x={xEtiquette} y={e.y + 4} className="fill-foreground text-[11.5px] font-medium tabular-nums">
            {e.s.court ?? e.s.libelle} · {e.s.valeurs[e.i]}
          </text>
        ))}
        {jours.map((j, i) => (
          <text
            key={j.cle}
            x={x(i)}
            y={hauteur - 7}
            textAnchor="middle"
            className={cn("text-[11px]", j.cle === aujourdhui ? "fill-foreground font-semibold" : "fill-muted-foreground")}
          >
            {etiquetteCourte ? (j.court ?? j.libelle) : j.libelle}
          </text>
        ))}
      </svg>
      {jours.map((j, i) => {
        const aVenir = j.cle > aujourdhui;
        const texte = aVenir
          ? `${j.libelleLong} : ${libelleAVenir}`
          : `${j.libelleLong} : ${series.map((s) => `${s.libelle} ${s.valeurs[i] ?? "—"}`).join(", ")}`;
        return (
          <button
            key={j.cle}
            type="button"
            aria-label={texte}
            className="absolute cursor-crosshair rounded-sm bg-transparent focus-visible:outline-2 focus-visible:outline-ring"
            style={{ left: x(i) - pas / 2, top: padT, width: pas, height: ih }}
            onMouseEnter={() => setSurvol(i)}
            onFocus={() => setSurvol(i)}
            onBlur={() => setSurvol(null)}
          />
        );
      })}
      {survol !== null && (
        <Infobulle x={x(survol)} largeur={largeur}>
          <p className="text-sm font-semibold">{jours[survol]!.libelleLong}</p>
          {jours[survol]!.cle > aujourdhui ? (
            <p className="text-muted-foreground">{libelleAVenir}</p>
          ) : (
            series.map((s) => (
              <p key={s.cle} className="flex items-center gap-2 tabular-nums">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.couleur }} aria-hidden />
                <span className="text-muted-foreground">{s.libelle}</span>
                <span className="ml-auto font-semibold">{s.valeurs[survol] ?? "—"}</span>
              </p>
            ))
          )}
        </Infobulle>
      )}
    </div>
  );
}
