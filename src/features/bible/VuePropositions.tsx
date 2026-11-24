/**
 * 19/11 (Adrien) : l'onglet « Propositions » de la Bible. Les comptes trouvés par l'agent éclaireur, rangés par
 * jour : ceux à décider et ceux mis à plus tard. Chaque tuile dit pourquoi l'agent propose le compte (ses chiffres,
 * son format, ses meilleurs posts) et le fait passer dans « À importer » ou « Prochain batch ».
 */
import * as React from "react";
import { ArrowRight, Clock, ImageOff, Loader2, Rocket, RotateCcw, X } from "lucide-react";

import { vuesCourtes } from "@/features/moteur/candidatsSources";
import { drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import type { EtapeManuelle, Section } from "./moodboard";
import { compterPropositions, type FiltreStatut, jourEnLettres, type Proposition, rangerPropositions } from "./propositions";

export interface ActionsProposition {
  onPasser: (p: Proposition, etape: EtapeManuelle) => void;
  onDecider: (p: Proposition, statut: "plus_tard" | "propose" | "refuse", raison?: string) => void;
}

const FILTRES: { cle: FiltreStatut; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "a_decider", libelle: "À décider" },
  { cle: "plus_tard", libelle: "Plus tard" },
];

function Bouton({ icone: Icone, libelle, onClick, fort, danger, disabled }: {
  icone: typeof Clock; libelle: string; onClick: () => void; fort?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition disabled:opacity-50",
        fort ? "border-stone-900 bg-stone-900 text-white hover:bg-stone-800 dark:border-white dark:bg-white dark:text-stone-900" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
        danger && "text-red-600 hover:border-red-300 hover:bg-red-50",
      )}
    >
      <Icone className="size-3.5" aria-hidden />
      {libelle}
    </button>
  );
}

function TuileProposition({ p, dejaBible, actions, occupe }: { p: Proposition; dejaBible: boolean; actions: ActionsProposition; occupe: boolean }) {
  const c = p.chiffres;
  const chiffres = [
    c.slideshows != null ? `${c.slideshows} slideshow${c.slideshows > 1 ? "s" : ""}${c.posts != null ? ` sur ${c.posts} posts` : ""}` : null,
    c.vuesMediane != null ? `méd. ${vuesCourtes(c.vuesMediane)}` : null,
    c.vuesMax != null ? `pic ${vuesCourtes(c.vuesMax)}` : null,
    c.posts100k ? `${c.posts100k} à 100 k ou plus` : null,
    c.abonnes != null ? `${vuesCourtes(c.abonnes)} abonnés` : null,
  ].filter(Boolean).join(" · ");
  // L'aperçu, comme sur les autres onglets : les 3 posts d'exemple (les plus vus), en miniatures cliquables.
  const apercus = p.exemples.slice(0, 3);
  const refuser = () => {
    const raison = window.prompt(`Pourquoi refuser @${p.handle} ? L'agent éclaireur relit la raison pour mieux chercher.`, "");
    if (raison !== null) actions.onDecider(p, "refuse", raison);
  };

  return (
    <article
      className={cn("flex w-[300px] shrink-0 flex-col gap-2 rounded-xl border border-stone-200/80 bg-white p-3 dark:border-stone-800 dark:bg-stone-900", occupe && "opacity-60")}
      data-proposition={p.handle}
    >
      <div className="flex items-start justify-between gap-1.5">
        <a href={`https://www.tiktok.com/@${p.handle}`} target="_blank" rel="noreferrer" className="block min-w-0 truncate text-[13px] font-semibold leading-snug text-stone-900 hover:underline dark:text-stone-100">
          @{p.handle}
        </a>
        <span className="shrink-0 text-sm leading-snug" title={nomLangue(p.langue)}>{drapeauLangue(p.langue)}</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {p.sorte === "label" && p.labelNom
          ? <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">pour {p.labelNom}</span>
          : <span className="rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">concept nouveau</span>}
        {p.statut === "plus_tard" && <span className="rounded-full bg-stone-100 px-1.5 py-px text-[10px] font-medium text-stone-600 ring-1 ring-stone-200">plus tard</span>}
        {dejaBible && <span className="rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-700 ring-1 ring-sky-200">déjà dans la Bible</span>}
      </div>

      {chiffres && <p className="text-[11px] leading-snug tabular-nums text-stone-600 dark:text-stone-300">{chiffres}</p>}
      {p.concept && <p className="line-clamp-3 text-xs font-medium leading-snug text-stone-800 dark:text-stone-200" title={p.concept}>{p.concept}</p>}
      {p.pourquoi && <p className="line-clamp-4 text-[11px] leading-snug text-stone-500" title={p.pourquoi}>{p.pourquoi}</p>}
      {p.risques && <p className="line-clamp-2 rounded-md bg-amber-50 px-1.5 py-1 text-[11px] leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" title={p.risques}>À savoir : {p.risques}</p>}
      {p.note && <p className="text-[11px] leading-snug text-stone-600 dark:text-stone-300"><b className="font-medium">Note :</b> {p.note}</p>}

      {apercus.length > 0 && (
        <div className="grid grid-cols-3 gap-1" data-testid={`apercus-${p.handle}`}>
          {apercus.map((e, i) => (e.miniature ? (
            <a key={e.url} href={e.url} target="_blank" rel="noreferrer" title={e.accroche || undefined} className="relative block aspect-[9/16] overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800">
              <img src={e.miniature} alt={`@${p.handle}, TikTok ${i + 1}`} loading="lazy" className="size-full object-cover" />
              {e.vues != null && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] font-medium text-white">{vuesCourtes(e.vues)}</span>}
            </a>
          ) : (
            <a key={e.url} href={e.url} target="_blank" rel="noreferrer" title={e.sansMiniature ? "TikTok n'a pas rendu l'image" : "Aperçu en cours"} className="flex aspect-[9/16] items-center justify-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-800">
              {e.sansMiniature ? <ImageOff className="size-3.5" aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            </a>
          )))}
        </div>
      )}

      {p.exemples.length > 0 && (
        <ul className="space-y-0.5">
          {p.exemples.slice(0, 3).map((e) => (
            <li key={e.url} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
              <span className="w-10 shrink-0 text-right tabular-nums text-stone-400">{vuesCourtes(e.vues)}</span>
              <a href={e.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-stone-700 underline-offset-2 hover:underline dark:text-stone-300" title={e.accroche}>
                {e.accroche || "voir le post"}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-1 pt-1">
        <Bouton icone={ArrowRight} libelle="À importer" fort disabled={occupe} onClick={() => actions.onPasser(p, "a_importer")} />
        <Bouton icone={Rocket} libelle="Prochain batch" disabled={occupe} onClick={() => actions.onPasser(p, "prochain_batch")} />
        {p.statut === "plus_tard"
          ? <Bouton icone={RotateCcw} libelle="Remettre à décider" disabled={occupe} onClick={() => actions.onDecider(p, "propose")} />
          : <Bouton icone={Clock} libelle="Plus tard" disabled={occupe} onClick={() => actions.onDecider(p, "plus_tard")} />}
        <Bouton icone={X} libelle="Refuser" danger disabled={occupe} onClick={refuser} />
      </div>
    </article>
  );
}

export function VuePropositions({ propositions, recherche, section, sectionDe, handlesBible, actions, occupes }: {
  propositions: Proposition[]; recherche: string; section: Section | "sans" | ""; sectionDe: (labelId: string) => Section;
  /** Les handles déjà dans la Bible (ajoutés à la main) : la tuile le dit. */
  handlesBible: Set<string>; actions: ActionsProposition; occupes: Set<string>;
}) {
  const [statut, setStatut] = React.useState<FiltreStatut>("toutes");
  const n = compterPropositions(propositions);
  const jours = rangerPropositions(propositions, { statut, recherche, section }, sectionDe);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900" data-testid="propositions-en-bref">
        <p className="text-sm text-stone-600">
          <b className="text-stone-900 dark:text-white">{n.a_decider}</b> proposition{n.a_decider > 1 ? "s" : ""} à décider,{" "}
          <b className="text-stone-900 dark:text-white">{n.plus_tard}</b> mise{n.plus_tard > 1 ? "s" : ""} à plus tard. L'agent éclaireur en dépose de nouvelles chaque jour.
        </p>
        <div role="group" aria-label="Propositions affichées" className="inline-flex rounded-full bg-stone-100 p-0.5 dark:bg-stone-800">
          {FILTRES.map((f) => (
            <button
              key={f.cle}
              type="button"
              aria-pressed={statut === f.cle}
              onClick={() => setStatut(f.cle)}
              className={cn("rounded-full px-3 py-1 text-xs transition", statut === f.cle ? "bg-white font-semibold text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white" : "text-stone-500 hover:text-stone-800")}
            >
              {f.libelle} <span className="tabular-nums text-stone-400">{n[f.cle]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-7" data-testid="moodboard-propositions">
        {jours.length === 0 && <p className="py-10 text-center text-sm text-stone-500">Aucune proposition ici.</p>}
        {jours.map((j) => (
          <section key={j.jour} className="space-y-3" data-jour={j.jour}>
            <h2 className="flex items-baseline gap-2.5">
              <span className="text-base font-semibold tracking-tight text-stone-900 first-letter:uppercase dark:text-white">{jourEnLettres(j.jour)}</span>
              <span className="text-xs tabular-nums text-stone-400">· {j.propositions.length} proposition{j.propositions.length > 1 ? "s" : ""}</span>
            </h2>
            <div className="flex flex-wrap gap-3">
              {j.propositions.map((p) => <TuileProposition key={p.id} p={p} dejaBible={handlesBible.has(p.handle)} actions={actions} occupe={occupes.has(p.id)} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
