/** 18/11 : une carte de la galerie : @handle, 3 miniatures 9:16 (nos copies), pastilles, stats, note et angle. */
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

import { type Carte, nombreCourt } from "./modele";
import { LIBELLE_STATUT, type StatutBible } from "./types";

export const COULEUR_STATUT: Record<StatutBible, string> = {
  a_trier: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  a_importer: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  importe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  refuse: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  en_pause: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

export function Pastille({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

export function Miniatures({ urls, handle, manquantes }: { urls: string[]; handle: string; manquantes?: boolean }) {
  const cases = [0, 1, 2];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cases.map((i) => {
        const u = urls[i];
        return u ? (
          <img
            key={i}
            src={u}
            alt={`@${handle}, post ${i + 1}`}
            loading="lazy"
            className="aspect-[9/16] w-full rounded-lg bg-muted object-cover"
          />
        ) : (
          <div key={i} className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/40 p-1 text-center text-[10px] text-muted-foreground">
            <ImageOff className="size-3.5" aria-hidden />
            {manquantes && i === urls.length ? "ajouter 3 liens de posts" : null}
          </div>
        );
      })}
    </div>
  );
}

export function CarteCompte({ c, onOuvrir }: { c: Carte; onOuvrir: (c: Carte) => void }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm transition hover:shadow-md"
      data-carte={c.handle}
    >
      <div className="flex items-start justify-between gap-2">
        <a
          href={`https://www.tiktok.com/@${c.handle}`}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 truncate text-sm font-semibold hover:underline"
        >
          @{c.handle}
        </a>
        <Pastille className={COULEUR_STATUT[c.statut]}>{LIBELLE_STATUT[c.statut]}</Pastille>
      </div>
      <button type="button" className="text-left" onClick={() => onOuvrir(c)} aria-label={`Ouvrir la fiche de @${c.handle}`}>
        <Miniatures urls={c.miniatures} handle={c.handle} manquantes={c.kind === "bible" && c.miniaturesManquantes} />
      </button>
      <div className="flex flex-wrap gap-1">
        {c.nicheStatut === "oui" && <Pastille className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">100 % niché{c.niche ? ` · ${c.niche}` : ""}</Pastille>}
        {c.nicheStatut === "partiel" && <Pastille className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200">niché partiel{c.niche ? ` · ${c.niche}` : ""}</Pastille>}
        {c.polyvalent && <Pastille className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200">polyvalent</Pastille>}
        {c.langue && <Pastille className="bg-muted text-muted-foreground">{c.langue.toUpperCase()}{c.pays ? ` · ${c.pays}` : ""}</Pastille>}
      </div>
      <dl className="grid grid-cols-2 gap-x-2 text-[11px] text-muted-foreground">
        <div><dt className="inline">Abonnés </dt><dd className="inline font-medium text-foreground">{nombreCourt(c.abonnes)}</dd></div>
        <div><dt className="inline">Vues méd. </dt><dd className="inline font-medium text-foreground">{nombreCourt(c.vuesMediane)}</dd></div>
      </dl>
      {(c.note || c.angle) && (
        <div className="space-y-1 border-t pt-2 text-[11px] leading-snug">
          {c.note && <p><span className="font-medium">Import : </span><span className="text-muted-foreground">{c.note}</span></p>}
          {c.angle && <p><span className="font-medium">Angle : </span><span className="text-muted-foreground">{c.angle}</span></p>}
        </div>
      )}
    </article>
  );
}
