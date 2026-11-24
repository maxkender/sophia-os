/**
 * 24/11 : le suivi détaillé de l'onglet « En import ». Une carte par source neuve : le relevé de son profil, une
 * barre d'avancement, chaque étape du pipeline avec son nombre de slideshows, ce qui coince, et, dépliés, le journal
 * horodaté et la liste de ses slideshows. Se met à jour toutes les 10 secondes.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import type { SourceBible } from "./sources";
import {
  duree, estFinie, heure, ilYa, lireSuiviImport, type LigneJournal, type NiveauJournal, type Phase, PHASES, type SlideshowSuivi, type SuiviSource,
} from "./suiviImport";

const RAFRAICHIR_MS = 10_000;

const TON_PHASE: Record<Phase, string> = {
  a_recuperer: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  recuperation: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  lecture: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  pertinence: "bg-indigo-50 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  note: "bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  nettoyage: "bg-fuchsia-50 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  description: "bg-pink-50 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  garde: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ecarte: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  abandon: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const TON_NIVEAU: Record<NiveauJournal, string> = {
  info: "bg-stone-300 dark:bg-stone-600",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  erreur: "bg-red-500",
};

const s = (n: number) => (n > 1 ? "s" : "");

/** Le petit lien d'un post TikTok (« ↗ 123456 »). */
function LienPost({ url }: { url: string | null }) {
  if (!url) return null;
  const id = url.match(/\/(?:video|photo)\/(\d+)/)?.[1];
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-stone-400 hover:text-stone-900 dark:hover:text-white" title={url}>
      <ExternalLink className="size-3" aria-hidden />{id ? `…${id.slice(-6)}` : "post"}
    </a>
  );
}

/** Barre d'avancement : gardés, écartés, abandonnés, puis ce qui reste. */
function Barre({ suivi }: { suivi: SuiviSource }) {
  const t = Math.max(suivi.total, 1);
  const part = (n: number) => `${(n / t) * 100}%`;
  const enPipeline = suivi.enCours - suivi.compte.a_recuperer;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" role="progressbar" aria-valuemin={0} aria-valuemax={suivi.total} aria-valuenow={suivi.finis} aria-label={`@${suivi.handle} : ${suivi.finis} sur ${suivi.total} traités`}>
      <div className="bg-emerald-500" style={{ width: part(suivi.compte.garde) }} />
      <div className="bg-stone-400" style={{ width: part(suivi.compte.ecarte) }} />
      <div className="bg-red-500" style={{ width: part(suivi.compte.abandon) }} />
      <div className="animate-pulse bg-sky-300 dark:bg-sky-700" style={{ width: part(Math.max(enPipeline, 0)) }} />
    </div>
  );
}

function phraseReleve(r: SuiviSource["releve"]): { texte: string; alerte: boolean } {
  switch (r.etat) {
    case "a_relever": return { texte: "Relevé du profil dans la minute", alerte: false };
    case "en_cours": return { texte: `Relevé du profil en cours${r.essais > 1 ? ` (essai ${r.essais} sur 5)` : ""}`, alerte: false };
    case "rate": return { texte: `Relevé du profil raté${r.echec ? ` : ${r.echec}` : ""} (essai ${r.essais} sur 5), nouvel essai dans quelques minutes`, alerte: true };
    case "fait": return { texte: r.enfilees !== null ? `Profil relevé : ${r.enfilees} slideshow${s(r.enfilees)} mis dans la file` : "Profil relevé", alerte: false };
    default: return { texte: "", alerte: false };
  }
}

function Journal({ lignes, maintenant }: { lignes: LigneJournal[] | null; maintenant: number }) {
  const [problemes, setProblemes] = React.useState(false);
  const [tout, setTout] = React.useState(false);
  if (lignes === null) {
    return <p className="text-xs text-stone-500">Le journal horodaté s'active avec la migration 0852 (import_journal). En attendant, l'état de chaque slideshow est dans « Slideshows ».</p>;
  }
  const filtrees = problemes ? lignes.filter((l) => l.niveau === "erreur" || l.niveau === "warn") : lignes;
  const visibles = tout ? filtrees : filtrees.slice(0, 60);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <button type="button" aria-pressed={!problemes} onClick={() => setProblemes(false)} className={cn("rounded-full px-2.5 py-0.5", !problemes ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-900")}>Tout ({lignes.length})</button>
        <button type="button" aria-pressed={problemes} onClick={() => setProblemes(true)} className={cn("rounded-full px-2.5 py-0.5", problemes ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 hover:text-stone-900")}>
          Problèmes ({lignes.filter((l) => l.niveau === "erreur" || l.niveau === "warn").length})
        </button>
        {lignes[0] && <span className="ml-auto text-stone-400">dernière ligne {ilYa(lignes[0].at, maintenant)}</span>}
      </div>
      {visibles.length === 0
        ? <p className="text-xs text-stone-500">{problemes ? "Aucun problème noté." : "Rien de noté pour l'instant."}</p>
        : (
          <ol className="max-h-80 space-y-0.5 overflow-y-auto rounded-lg bg-stone-50 p-2 font-mono text-[11px] leading-relaxed dark:bg-stone-950" data-testid="journal-import">
            {visibles.map((l) => (
              <li key={l.id} className="flex items-start gap-2">
                <span className="shrink-0 tabular-nums text-stone-400">{heure(l.at)}</span>
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TON_NIVEAU[l.niveau])} aria-label={l.niveau} />
                <span className={cn("min-w-0 flex-1 break-words", l.niveau === "erreur" ? "text-red-700 dark:text-red-400" : l.niveau === "warn" ? "text-amber-800 dark:text-amber-400" : "text-stone-700 dark:text-stone-300")}>{l.message}</span>
                <LienPost url={l.post_url} />
              </li>
            ))}
          </ol>
        )}
      {filtrees.length > visibles.length && (
        <button type="button" onClick={() => setTout(true)} className="text-xs text-stone-500 underline hover:text-stone-900">Voir les {filtrees.length - visibles.length} lignes plus anciennes</button>
      )}
    </div>
  );
}

function Slideshows({ liste }: { liste: SlideshowSuivi[] }) {
  const [finis, setFinis] = React.useState(false);
  const enCours = liste.filter((x) => !estFinie(x.phase));
  const termines = liste.filter((x) => estFinie(x.phase));
  const ligne = (x: SlideshowSuivi) => {
    const libelle = PHASES.find((p) => p.cle === x.phase)!.libelle.replace(/s$/, "");
    return (
      <li key={x.cle} className="flex items-start gap-2 py-1">
        <span className={cn("shrink-0 rounded-full px-2 py-px text-[10px] font-medium", TON_PHASE[x.phase])}>{libelle}</span>
        <span className="min-w-0 flex-1 text-[11px] text-stone-600 dark:text-stone-400">
          {x.bloque && <span className="font-medium text-amber-700 dark:text-amber-400">Bail expiré, sera repris. </span>}
          {x.reporte && <span className="text-amber-700 dark:text-amber-400">Reporté (fournisseur saturé). </span>}
          {x.erreur && (
            <span className={estFinie(x.phase) ? "" : "text-red-700 dark:text-red-400"}>
              {!estFinie(x.phase) && x.tentatives > 0 ? `Échec ${x.tentatives} sur ${x.plafond}, repris : ` : ""}{x.erreur}
            </span>
          )}
        </span>
        <LienPost url={x.postUrl} />
      </li>
    );
  };
  return (
    <div className="space-y-2" data-testid="slideshows-import">
      {enCours.length === 0 ? <p className="text-xs text-stone-500">Plus rien en cours.</p> : <ul className="divide-y divide-stone-100 dark:divide-stone-800">{enCours.map(ligne)}</ul>}
      {termines.length > 0 && (
        <>
          <button type="button" onClick={() => setFinis((v) => !v)} className="text-xs text-stone-500 underline hover:text-stone-900">
            {finis ? "Masquer" : "Voir"} les {termines.length} terminé{s(termines.length)}
          </button>
          {finis && <ul className="divide-y divide-stone-100 dark:divide-stone-800">{termines.map(ligne)}</ul>}
        </>
      )}
    </div>
  );
}

function CarteSuivi({ suivi, maintenant }: { suivi: SuiviSource; maintenant: number }) {
  const [ouvert, setOuvert] = React.useState(false);
  const [onglet, setOnglet] = React.useState<"journal" | "slideshows">(suivi.journal ? "journal" : "slideshows");
  const releve = phraseReleve(suivi.releve);
  const fini = suivi.total > 0 && suivi.enCours === 0;
  const etapes = PHASES.filter((p) => suivi.compte[p.cle] > 0);

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900" data-testid={`suivi-${suivi.handle}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={`https://www.tiktok.com/@${suivi.handle}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-stone-900 hover:underline dark:text-white">@{suivi.handle}</a>
        {releve.texte && <span className={cn("text-xs", releve.alerte ? "text-amber-700 dark:text-amber-400" : "text-stone-500")}>{releve.texte}</span>}
        <span className="ml-auto text-xs tabular-nums text-stone-500">
          {suivi.total > 0 && <><b className="text-stone-900 dark:text-white">{suivi.finis}</b> / {suivi.total} traités</>}
          {suivi.resteMinutes !== null && <span title={`${suivi.rythme} slideshows terminés par heure (dernière demi-heure)`}> · {duree(suivi.resteMinutes)} restantes</span>}
          {fini && <span className="text-emerald-700 dark:text-emerald-400"> · terminé, passe à l'étape suivante</span>}
        </span>
      </div>

      {suivi.total > 0 && <div className="mt-2"><Barre suivi={suivi} /></div>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {etapes.map((p) => (
          <span key={p.cle} className={cn("rounded-full px-2 py-0.5 tabular-nums", TON_PHASE[p.cle])}>{p.libelle} {suivi.compte[p.cle]}</span>
        ))}
        {suivi.enErreur > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300">{suivi.enErreur} en erreur (repris)</span>}
        {suivi.bloques > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{suivi.bloques} bloqué{s(suivi.bloques)}</span>}
        {suivi.reportes > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{suivi.reportes} reporté{s(suivi.reportes)} (Apify saturé)</span>}
      </div>

      {suivi.immobileDepuis !== null && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-400" data-testid={`immobile-${suivi.handle}`}>
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Rien n'a bougé depuis {suivi.immobileDepuis} min alors qu'il reste du travail : la file d'import est peut-être saturée ou arrêtée.
        </p>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
        <span>Dernière activité {ilYa(suivi.derniereActivite, maintenant)}</span>
        <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} className="ml-auto inline-flex items-center gap-1 font-medium text-stone-700 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white">
          {ouvert ? "Masquer le détail" : "Journal et slideshows"}
          <ChevronDown className={cn("size-3.5 transition", ouvert && "rotate-180")} aria-hidden />
        </button>
      </div>

      {ouvert && (
        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3 dark:border-stone-800">
          <div role="tablist" className="inline-flex rounded-full bg-stone-100 p-0.5 text-xs dark:bg-stone-800">
            {(["journal", "slideshows"] as const).map((o) => (
              <button key={o} type="button" role="tab" aria-selected={onglet === o} onClick={() => setOnglet(o)} className={cn("rounded-full px-3 py-1", onglet === o ? "bg-white font-semibold text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white" : "text-stone-500")}>
                {o === "journal" ? "Journal" : `Slideshows (${suivi.slideshows.length})`}
              </button>
            ))}
          </div>
          {onglet === "journal" ? <Journal lignes={suivi.journal} maintenant={maintenant} /> : <Slideshows liste={suivi.slideshows} />}
        </div>
      )}
    </li>
  );
}

/** Le suivi des sources de l'onglet « En import ». */
export function SuiviImport({ sources }: { sources: SourceBible[] }) {
  const cibles = React.useMemo(() => sources.filter((x) => x.etape === "en_import").sort((a, b) => a.handle.localeCompare(b.handle)), [sources]);
  const cle = cibles.map((x) => `${x.id}:${x.neuve?.enfilees ?? ""}:${x.neuve?.releve ? 1 : 0}:${x.neuve?.essais ?? ""}`).join(",");
  const q = useQuery({
    queryKey: ["bible", "suivi-import", cle],
    queryFn: () => lireSuiviImport(cibles),
    enabled: cibles.length > 0,
    refetchInterval: RAFRAICHIR_MS,
    placeholderData: (avant) => avant,
  });
  // L'horloge des « il y a » avance entre deux lectures.
  const [maintenant, setMaintenant] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (cibles.length === 0) return null;
  const suivis = q.data?.suivis ?? [];
  // Ce qui coince en haut, puis ce qui tourne, puis ce qui a fini.
  const rang = (x: SuiviSource) => (x.immobileDepuis !== null || x.enErreur > 0 || x.bloques > 0 || x.releve.etat === "rate" ? 0 : x.enCours > 0 || x.total === 0 ? 1 : 2);
  const tries = [...suivis].sort((a, b) => rang(a) - rang(b) || a.handle.localeCompare(b.handle));
  const total = suivis.reduce((n, x) => n + x.total, 0);
  const finis = suivis.reduce((n, x) => n + x.finis, 0);

  return (
    <section className="space-y-2" data-testid="suivi-import" aria-label="Suivi de l'import">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        <span className="font-semibold uppercase tracking-wide text-stone-700 dark:text-stone-300">Suivi en direct</span>
        {total > 0 && <span className="tabular-nums">{finis} / {total} slideshows traités</span>}
        <span className="ml-auto inline-flex items-center gap-1.5">
          {q.isFetching && <RefreshCw className="size-3 animate-spin" aria-hidden />}
          {q.data ? `Actualisé ${ilYa(new Date(q.data.lu).toISOString(), maintenant)} · toutes les 10 s` : q.isLoading ? "Lecture…" : ""}
          <button type="button" onClick={() => void q.refetch()} className="underline hover:text-stone-900">Actualiser</button>
        </span>
      </div>
      {q.error && <p className="text-xs text-red-700">Suivi illisible : {(q.error as Error).message}</p>}
      {q.data && !q.data.journalDisponible && (
        <p className="text-xs text-stone-500">Journal horodaté pas encore activé (migration 0852) : l'avancement ci-dessous est exact, le journal et le temps restant arriveront avec elle.</p>
      )}
      <ul className="space-y-2">
        {tries.map((x) => <CarteSuivi key={x.id} suivi={x} maintenant={maintenant} />)}
      </ul>
    </section>
  );
}
