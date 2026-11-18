/** 18/11 : une carte de la galerie : @handle, 3 miniatures 9:16 (nos copies), pastilles, stats, note et angle. */
import * as React from "react";
import { Check, Copy, ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

import { type Carte, estAutreApp, estNonTrie, nombreCourt } from "./modele";
import { TriRapide } from "./TriRapide";
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

/** Le @handle en entier, lien direct vers le profil (ouvre l'app TikTok sur téléphone), et « Copier ». */
export function HandleLien({ handle, className }: { handle: string; className?: string }) {
  const [copie, setCopie] = React.useState(false);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <a href={`https://www.tiktok.com/@${handle}`} target="_blank" rel="noreferrer" className="break-all font-semibold hover:underline" data-handle={handle}>
        @{handle}
      </a>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(`@${handle}`);
          } catch {
            // Presse-papier refusé : rien à faire de plus, le handle reste sélectionnable.
          }
          setCopie(true);
          window.setTimeout(() => setCopie(false), 1500);
        }}
        aria-label={`Copier @${handle}`}
      >
        {copie ? <><Check className="size-3" /> Copié</> : <><Copy className="size-3" /> Copier</>}
      </button>
    </span>
  );
}

export function Miniatures({ urls, handle, manquantes, liens }: { urls: string[]; handle: string; manquantes?: boolean; liens?: (string | null)[] }) {
  const cases = [0, 1, 2];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cases.map((i) => {
        const u = urls[i];
        const lien = liens?.[i] ?? null;
        const img = u ? <img src={u} alt={`@${handle}, post ${i + 1}`} loading="lazy" className="aspect-[9/16] w-full rounded-lg bg-muted object-cover" /> : null;
        return u ? (
          lien ? (
            <a key={i} href={lien} target="_blank" rel="noreferrer" aria-label={`Ouvrir le post ${i + 1} de @${handle}`} className="block transition hover:opacity-90">{img}</a>
          ) : (
            <div key={i}>{img}</div>
          )
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
        <HandleLien handle={c.handle} className="text-sm" />
        <Pastille className={COULEUR_STATUT[c.statut]}>{LIBELLE_STATUT[c.statut]}</Pastille>
      </div>
      <Miniatures urls={c.miniatures} liens={c.liensPosts} handle={c.handle} manquantes={c.kind === "bible" && c.miniaturesManquantes} />
      {c.autreApp && <p className="text-[11px]"><span className="font-medium">Idée d'app : </span><span className="text-muted-foreground">{c.autreApp}</span></p>}
      {c.bibleId && (estNonTrie(c) || estAutreApp(c)) && <TriRapide carte={c} />}
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
      <button type="button" onClick={() => onOuvrir(c)} className="self-start text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
        Ouvrir la fiche
      </button>
      {(c.note || c.angle) && (
        <div className="space-y-1 border-t pt-2 text-[11px] leading-snug">
          {c.note && <p><span className="font-medium">Import : </span><span className="text-muted-foreground">{c.note}</span></p>}
          {c.angle && <p><span className="font-medium">Angle : </span><span className="text-muted-foreground">{c.angle}</span></p>}
        </div>
      )}
    </article>
  );
}
