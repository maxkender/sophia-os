/**
 * 19/11 (Adrien) : « Lancer l'import » du prochain batch. La fenêtre liste les comptes prêts (un vrai label, pas à
 * podzer, pas déjà source), demande la langue de leurs TikToks (l'import l'exige), puis crée les sources et les met
 * dans la file : tout le batch dans une même séquence, une source à la fois. Elle montre ensuite ce qui est parti.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";

import { type CarteLabel, type CompteBible, lancerBatch, nomCarte, type ResultatLancement } from "./moodboard";
import { labelNeuf, ligneResultat, type ReglesSources } from "./sources";

const CHAMP = "h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs dark:border-stone-700 dark:bg-stone-900";

export interface ComptePret {
  compte: CompteBible;
  carte: CarteLabel;
}

function ChoixLangue({ valeur, onChange, libelle, vide }: { valeur: string; onChange: (v: string) => void; libelle: string; vide: string }) {
  return (
    <select className={CHAMP} value={valeur} onChange={(e) => onChange(e.target.value)} aria-label={libelle}>
      <option value="">{vide}</option>
      {LANGUES_CIBLES.map((l) => <option key={l} value={l}>{nomLangue(l)}</option>)}
    </select>
  );
}

function Contenu({ prets, regles, onFermer, onFini, onVoir }: {
  prets: ComptePret[]; regles: ReglesSources; onFermer: () => void; onFini: () => void; onVoir: () => void;
}) {
  const [langues, setLangues] = React.useState<Record<string, string>>(() => Object.fromEntries(prets.map((p) => [p.compte.id, p.compte.langue ?? ""])));
  const [exclus, setExclus] = React.useState<Set<string>>(new Set());
  const [resultats, setResultats] = React.useState<ResultatLancement[] | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);

  const choisis = prets.filter((p) => !exclus.has(p.compte.id));
  const sansLangue = choisis.filter((p) => !langues[p.compte.id]).length;
  const basculer = (id: string) => setExclus((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pourTous = (l: string) => { if (l) setLangues(Object.fromEntries(prets.map((p) => [p.compte.id, l]))); };

  const lancer = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      setResultats(await lancerBatch(choisis.map((p) => ({ id: p.compte.id, langue: langues[p.compte.id]! }))));
      onFini();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  if (resultats) {
    const partis = resultats.filter((r) => r.statut === "lancee" || r.statut === "attente").length;
    return (
      <DialogPanel className="space-y-3 pb-5">
        <p className="text-sm font-medium">{partis} source{partis > 1 ? "s" : ""} créée{partis > 1 ? "s" : ""} sur {resultats.length}.</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2 text-xs dark:border-stone-800 dark:bg-stone-900/40" data-testid="resultats-lancement">
          {resultats.map((r) => {
            const l = ligneResultat(r, regles);
            return <li key={r.id} className={l.ok ? "text-stone-700 dark:text-stone-300" : "text-amber-700 dark:text-amber-400"}>{l.texte}</li>;
          })}
        </ul>
        <p className="text-xs text-stone-500">Les sources passent une par une. Elles sont dans l'onglet « En import », puis avancent toutes seules.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFermer}>Fermer</Button>
          <Button onClick={onVoir}>Voir « En import »</Button>
        </div>
      </DialogPanel>
    );
  }

  return (
    <DialogPanel className="space-y-4 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-stone-500">{choisis.length} compte{choisis.length > 1 ? "s" : ""} à lancer · la langue de ses TikToks pour chacun</p>
        <ChoixLangue valeur="" onChange={pourTous} libelle="Langue pour tous" vide="Langue pour tous…" />
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-1.5 dark:border-stone-800 dark:bg-stone-900/40">
        {prets.map(({ compte, carte }) => (
          <li key={compte.id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 dark:bg-stone-900">
            <input type="checkbox" checked={!exclus.has(compte.id)} onChange={() => basculer(compte.id)} className="size-3.5 accent-stone-900" aria-label={`Lancer @${compte.handle}`} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium" title={`@${compte.handle}`}>@{compte.handle}</span>
            <code className="shrink-0 text-[11px] text-stone-500">{nomCarte(carte)}</code>
            <ChoixLangue valeur={langues[compte.id] ?? ""} onChange={(l) => setLangues((x) => ({ ...x, [compte.id]: l }))} libelle={`Langue de @${compte.handle}`} vide="Langue…" />
          </li>
        ))}
      </ul>
      <p className="text-xs text-stone-500">
        La source démarre par un essai de {regles.essaiPosts} posts ; dans un label neuf ({labelNeuf(regles)}), par ses {regles.postsMaxParMaj} posts
        les plus vus. Coût : un relevé Apify par compte, puis l'analyse de chaque post importé (Gemini).
      </p>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <div className="flex items-center justify-end gap-2">
        {sansLangue > 0 && <span className="mr-auto text-xs text-amber-700">{sansLangue} sans langue</span>}
        <Button variant="outline" onClick={onFermer}>Annuler</Button>
        <Button onClick={lancer} disabled={occupe || choisis.length === 0 || sansLangue > 0}>
          {occupe ? "Lancement…" : `Lancer l'import de ${choisis.length} compte${choisis.length > 1 ? "s" : ""}`}
        </Button>
      </div>
    </DialogPanel>
  );
}

/**
 * `prets` : la liste figée par la page à l'ouverture (`null` : fermée). Le lancement vide le prochain batch ; avec
 * une liste vivante, le bilan disparaîtrait de l'écran au moment où il arrive.
 */
export function DialogueLancement({ prets, regles, onFermer, onFini, onVoir }: {
  prets: ComptePret[] | null; regles: ReglesSources; onFermer: () => void; onFini: () => void; onVoir: () => void;
}) {
  return (
    <Dialog open={prets !== null} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">Lancer l'import</DialogTitle>
          <DialogDescription>Chaque compte devient une source et part dans la file d'import, avec le label de sa carte.</DialogDescription>
        </DialogHeader>
        {prets && <Contenu prets={prets} regles={regles} onFermer={onFermer} onFini={onFini} onVoir={onVoir} />}
      </DialogPopup>
    </Dialog>
  );
}
