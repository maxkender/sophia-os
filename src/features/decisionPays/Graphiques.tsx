import { Info } from "lucide-react";
import type * as React from "react";

import { useLargeur } from "@/components/charts/useLargeur";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** (i) : une phrase qui explique l'indicateur. */
export function InfoBulle({ texte }: { texte: string }) {
  return (
    <Tooltip>
      <TooltipTrigger delay={120} closeOnClick={false} aria-label={texte} className="inline-flex align-middle text-muted-foreground hover:text-foreground">
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipPopup side="top" className="w-72 max-w-[min(18rem,var(--available-width))] p-2.5 text-left text-xs leading-relaxed">
        {texte}
      </TooltipPopup>
    </Tooltip>
  );
}

const HAUT = 180;
const MARGE = { haut: 10, bas: 22, gauche: 4, droite: 4 };

function etiquette(i: number, n: number): boolean {
  return n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1;
}

/** Barres par semaine : deux séries côte à côte (proceeds en noir, paie en orange). */
export function BarresDoubles({
  points,
  legendes,
  format,
}: {
  points: { label: string; a: number; b: number }[];
  legendes: [string, string];
  format: (n: number) => string;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(560);
  const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b]));
  const zone = largeur - MARGE.gauche - MARGE.droite;
  const pas = zone / Math.max(1, points.length);
  const barre = Math.max(4, Math.min(22, pas / 2 - 4));
  const h = (v: number) => ((HAUT - MARGE.haut - MARGE.bas) * Math.max(0, v)) / max;
  return (
    <div ref={ref} className="w-full">
      <Legende items={[{ nom: legendes[0], classe: "bg-foreground/85" }, { nom: legendes[1], classe: "bg-amber-500" }]} />
      <svg width={largeur} height={HAUT} className="block" role="img" aria-label={`${legendes[0]} / ${legendes[1]}`}>
        {points.map((p, i) => {
          const x = MARGE.gauche + i * pas + pas / 2;
          return (
            <g key={p.label}>
              <rect x={x - barre - 1} y={HAUT - MARGE.bas - h(p.a)} width={barre} height={h(p.a)} rx={2} className="fill-foreground/85">
                <title>{`${p.label} · ${legendes[0]} ${format(p.a)}`}</title>
              </rect>
              <rect x={x + 1} y={HAUT - MARGE.bas - h(p.b)} width={barre} height={h(p.b)} rx={2} className="fill-amber-500">
                <title>{`${p.label} · ${legendes[1]} ${format(p.b)}`}</title>
              </rect>
              {etiquette(i, points.length) && (
                <text x={x} y={HAUT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Une courbe par semaine, avec un point par valeur. */
export function Courbe({
  points,
  format,
  classe = "stroke-sky-600",
  hauteur = HAUT,
}: {
  points: { label: string; v: number | null }[];
  format: (n: number) => string;
  classe?: string;
  hauteur?: number;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(560);
  const vals = points.map((p) => p.v).filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals);
  const min = 0;
  const zone = largeur - MARGE.gauche - MARGE.droite - 8;
  const x = (i: number) => MARGE.gauche + 4 + (i / Math.max(1, points.length - 1)) * zone;
  const y = (v: number) => MARGE.haut + (1 - (v - min) / (max - min || 1)) * (hauteur - MARGE.haut - MARGE.bas);
  const pts = points.map((p, i) => (p.v === null ? null : { i, v: p.v, label: p.label })).filter((p): p is { i: number; v: number; label: string } => p !== null);
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <div ref={ref} className="w-full">
      <svg width={largeur} height={hauteur} className="block" role="img">
        <path d={d} fill="none" className={cn("stroke-[2]", classe)} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={3} className={cn("fill-background stroke-[2]", classe)}>
            <title>{`${p.label} · ${format(p.v)}`}</title>
          </circle>
        ))}
        {points.map((p, i) =>
          etiquette(i, points.length) ? (
            <text key={p.label} x={x(i)} y={hauteur - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** Barres (proceeds) et courbe (vues), deux échelles, pour le détail d'un pays. */
export function BarresEtCourbe({
  points,
  legendes,
  formatBarres,
  formatCourbe,
}: {
  points: { label: string; barre: number; courbe: number }[];
  legendes: [string, string];
  formatBarres: (n: number) => string;
  formatCourbe: (n: number) => string;
}) {
  const [ref, largeur] = useLargeur<HTMLDivElement>(560);
  const maxB = Math.max(1, ...points.map((p) => p.barre));
  const maxC = Math.max(1, ...points.map((p) => p.courbe));
  const zone = largeur - MARGE.gauche - MARGE.droite;
  const pas = zone / Math.max(1, points.length);
  const barre = Math.max(6, Math.min(30, pas - 10));
  const utile = HAUT - MARGE.haut - MARGE.bas;
  const xc = (i: number) => MARGE.gauche + i * pas + pas / 2;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${xc(i).toFixed(1)},${(MARGE.haut + utile * (1 - p.courbe / maxC)).toFixed(1)}`).join(" ");
  return (
    <div ref={ref} className="w-full">
      <Legende items={[{ nom: legendes[0], classe: "bg-foreground/80" }, { nom: legendes[1], classe: "bg-sky-600" }]} />
      <svg width={largeur} height={HAUT} className="block" role="img">
        {points.map((p, i) => (
          <g key={p.label}>
            <rect x={xc(i) - barre / 2} y={HAUT - MARGE.bas - (utile * p.barre) / maxB} width={barre} height={(utile * p.barre) / maxB} rx={2} className="fill-foreground/80">
              <title>{`${p.label} · ${legendes[0]} ${formatBarres(p.barre)} · ${legendes[1]} ${formatCourbe(p.courbe)}`}</title>
            </rect>
            {etiquette(i, points.length) && <text x={xc(i)} y={HAUT - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>}
          </g>
        ))}
        <path d={d} fill="none" className="stroke-sky-600 stroke-[2]" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={`c${p.label}`} cx={xc(i)} cy={MARGE.haut + utile * (1 - p.courbe / maxC)} r={3} className="fill-background stroke-sky-600 stroke-[2]" />
        ))}
      </svg>
    </div>
  );
}

export interface SegmentPile {
  valeur: number;
  classe: string;
  nom: string;
}

/** Barres horizontales empilées, une par ligne, avec un trait pour l'objectif. */
export function BarresEmpilees({
  lignes,
  legende,
  libelleObjectif,
}: {
  lignes: { cle: string; libelle: React.ReactNode; segments: SegmentPile[]; objectif: number; fin: React.ReactNode }[];
  legende: { nom: string; classe: string }[];
  libelleObjectif: string;
}) {
  const max = Math.max(1, ...lignes.map((l) => Math.max(l.objectif, l.segments.reduce((n, s) => n + s.valeur, 0))));
  return (
    <div className="space-y-2">
      <Legende items={legende} objectif={libelleObjectif} />
      {lignes.map((l) => (
        <div key={l.cle} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-2 text-sm">
          <div className="truncate">{l.libelle}</div>
          <div className="relative h-5 rounded bg-muted/50">
            <div className="flex h-full overflow-hidden rounded">
              {l.segments.map((s) =>
                s.valeur > 0 ? (
                  <div key={s.nom} className={cn("h-full", s.classe)} style={{ width: `${(100 * s.valeur) / max}%` }} title={`${s.nom} : ${s.valeur}`} />
                ) : null,
              )}
            </div>
            {l.objectif > 0 && (
              <div className="absolute inset-y-[-3px] w-0.5 bg-foreground" style={{ left: `calc(${(100 * l.objectif) / max}% - 1px)` }} title={`${libelleObjectif} ${l.objectif}`} />
            )}
          </div>
          <div className="text-right tabular-nums">{l.fin}</div>
        </div>
      ))}
    </div>
  );
}

function Legende({ items, objectif }: { items: { nom: string; classe: string }[]; objectif?: string }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.nom} className="inline-flex items-center gap-1">
          <span className={cn("inline-block size-2.5 rounded-sm", i.classe)} />
          {i.nom}
        </span>
      ))}
      {objectif && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-foreground" />
          {objectif}
        </span>
      )}
    </div>
  );
}
