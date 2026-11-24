/**
 * 24/11 (Adrien) : en tête de l'onglet « Propositions », les sujets donnés aux agents éclaireurs (0853). On écrit un
 * sujet, un agent le prend à son prochain réveil ; on voit qui cherche quoi, ce que ça a coûté, combien de cartes
 * sont arrivées, et le compte rendu une fois le sujet rendu. Sans sujet en attente, les agents cherchent librement.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { ajouterSujet, annulerSujet, engageUsd, erreurSujet, lireBudgetEclaireurs, lireSujets, LIBELLE_STATUT, type NouveauSujet, rangerSujets, type SujetRecherche } from "./sujets";

const VIDE: NouveauSujet = { sujet: "", consigne: "", langues: "", budgetUsd: null, cartesMax: null };
const dollars = (n: number): string => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} $`;
const CHAMP = "h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-xs text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100";

function LigneSujet({ s, onAnnuler, occupe }: { s: SujetRecherche; onAnnuler?: () => void; occupe: boolean }) {
  const [ouvert, setOuvert] = React.useState(false);
  const detail = s.statut === "fait" ? s.compteRendu : s.consigne;
  return (
    <li className="rounded-lg border border-stone-200/80 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900" data-sujet={s.id}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn(
          "rounded-full px-1.5 py-px text-[10px] font-medium ring-1",
          s.statut === "pris" ? "bg-sky-50 text-sky-700 ring-sky-200" : s.statut === "fait" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-stone-100 text-stone-600 ring-stone-200",
        )}>
          {LIBELLE_STATUT[s.statut]}{s.agent ? ` · ${s.agent}` : ""}
        </span>
        <span className="min-w-0 text-[13px] font-medium text-stone-900 dark:text-stone-100">{s.sujet}</span>
        <span className="text-[11px] tabular-nums text-stone-500">
          {s.langues.length > 0 ? s.langues.join(", ") : "toutes langues"}{s.labelNom ? ` · pour ${s.labelNom}` : ""} · {dollars(s.depenseUsd)} sur {dollars(s.budgetUsd)} · {s.cartes} carte{s.cartes > 1 ? "s" : ""} sur {s.cartesMax}
        </span>
        <span className="ml-auto flex gap-2">
          {detail && <button type="button" className="text-[11px] text-stone-500 underline-offset-2 hover:underline" onClick={() => setOuvert((o) => !o)}>{ouvert ? "Replier" : s.statut === "fait" ? "Compte rendu" : "Consigne"}</button>}
          {onAnnuler && <button type="button" disabled={occupe} className="inline-flex items-center gap-0.5 text-[11px] text-red-600 underline-offset-2 hover:underline disabled:opacity-50" onClick={onAnnuler}><X className="size-3" aria-hidden />Annuler</button>}
        </span>
      </div>
      {ouvert && detail && <p className="mt-1.5 whitespace-pre-line text-[11px] leading-snug text-stone-600 dark:text-stone-300">{detail}</p>}
    </li>
  );
}

export function PanneauSujets() {
  const qc = useQueryClient();
  const sujets = useQuery({ queryKey: ["eclaireurs", "sujets"], queryFn: lireSujets });
  const budget = useQuery({ queryKey: ["eclaireurs", "budget"], queryFn: lireBudgetEclaireurs });
  const [n, setN] = React.useState<NouveauSujet>(VIDE);
  const [occupe, setOccupe] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);

  const { ouverts, rendus } = rangerSujets(sujets.data ?? []);
  const engage = engageUsd(ouverts);
  const faire = async (action: () => Promise<void>) => {
    setOccupe(true);
    setErreur(null);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ["eclaireurs"] });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  const envoyer = (ev: React.FormEvent) => {
    ev.preventDefault();
    const pb = erreurSujet(n);
    if (pb) { setErreur(pb); return; }
    void faire(async () => { await ajouterSujet(n); setN(VIDE); });
  };
  const entier = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  return (
    <section className="space-y-2.5 rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-900/40" data-testid="panneau-sujets">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Sujets de recherche</h2>
        {budget.data && (
          <p className="text-[11px] tabular-nums text-stone-500" data-testid="budget-eclaireurs">
            Aujourd'hui : <b className="font-medium text-stone-800 dark:text-stone-200">{dollars(budget.data.depenseUsd)}</b> dépensés sur {dollars(budget.data.plafondUsd)}
            {engage > 0 && <> · {dollars(engage)} réservés par les sujets ouverts</>}
          </p>
        )}
      </div>
      <p className="text-[11px] leading-snug text-stone-500">
        Trois agents cherchent chaque jour. Chacun prend le plus ancien sujet en attente ; s'il n'y en a pas, il cherche librement
        (des sources pour les labels qui en manquent, des concepts nouveaux, les langues hors anglais).
      </p>

      <form onSubmit={envoyer} className="flex flex-wrap items-start gap-2" aria-label="Nouveau sujet de recherche">
        <input className={cn(CHAMP, "min-w-[220px] flex-[2]")} placeholder="Le sujet : « l'art : tableaux, sculptures »" value={n.sujet} maxLength={200}
          onChange={(e) => setN({ ...n, sujet: e.target.value })} aria-label="Sujet" />
        <input className={cn(CHAMP, "min-w-[220px] flex-[3]")} placeholder="Consigne (facultatif) : formats voulus, comptes modèles, ce qu'on ne veut pas" value={n.consigne}
          onChange={(e) => setN({ ...n, consigne: e.target.value })} aria-label="Consigne" />
        <input className={cn(CHAMP, "w-36")} placeholder="Langues : de, it… (vide : toutes)" value={n.langues}
          onChange={(e) => setN({ ...n, langues: e.target.value })} aria-label="Langues" />
        <input className={cn(CHAMP, "w-24")} inputMode="decimal" placeholder="Budget 12 $" value={n.budgetUsd ?? ""}
          onChange={(e) => setN({ ...n, budgetUsd: entier(e.target.value) })} aria-label="Budget en dollars" />
        <input className={cn(CHAMP, "w-24")} inputMode="numeric" placeholder="15 cartes" value={n.cartesMax ?? ""}
          onChange={(e) => setN({ ...n, cartesMax: entier(e.target.value) })} aria-label="Nombre de cartes" />
        <button type="submit" disabled={occupe || n.sujet.trim().length < 3}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-stone-900 bg-stone-900 px-3 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-50 dark:border-white dark:bg-white dark:text-stone-900">
          <Plus className="size-3.5" aria-hidden />Donner le sujet
        </button>
      </form>
      {erreur && <p className="text-xs text-destructive" role="alert">{erreur}</p>}
      {sujets.isError && <p className="text-xs text-destructive">Les sujets n'ont pas pu être lus : {(sujets.error as Error).message}</p>}

      {ouverts.length > 0 && (
        <ul className="space-y-1.5" data-testid="sujets-ouverts">
          {ouverts.map((s) => (
            <LigneSujet key={s.id} s={s} occupe={occupe} onAnnuler={() => {
              if (window.confirm(`Annuler le sujet « ${s.sujet} » ?${s.statut === "pris" ? ` ${s.agent} s'arrêtera à sa prochaine étape ; ses cartes déjà déposées restent.` : ""}`)) void faire(() => annulerSujet(s.id));
            }} />
          ))}
        </ul>
      )}
      {sujets.data && ouverts.length === 0 && <p className="text-[11px] text-stone-500" data-testid="sujets-vide">Aucun sujet en attente : les agents cherchent librement.</p>}
      {rendus.length > 0 && (
        <details className="text-[11px] text-stone-500">
          <summary className="cursor-pointer select-none">Derniers sujets rendus ({rendus.length})</summary>
          <ul className="mt-1.5 space-y-1.5" data-testid="sujets-rendus">
            {rendus.map((s) => <LigneSujet key={s.id} s={s} occupe={occupe} />)}
          </ul>
        </details>
      )}
    </section>
  );
}
