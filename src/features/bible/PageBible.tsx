/**
 * 19/11 (Max) : la Bible des comptes, en moodboard. Trois onglets (À importer · Prochain batch · Importés), les comptes
 * rangés par app (Runvik, Micabo, Sophia, Idées, puis Sans label) puis par label (nom, badge, DA), chacun avec ses
 * 3 derniers TikToks en miniatures. « Marquer le batch comme importé » ne change que l'étape dans la Bible.
 * Admin au sens strict (RLS + route).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DialogueAjout, DialogueLabel } from "./DialoguesBible";
import {
  type CarteLabel, changerCarte, changerEtape, type CompteBible, compterEtapes, type Etape, ETAPES, LIBELLE_BADGE, lireCartes, lireComptes,
  marquerBatchImporte, modifierNote, nomCarte, ranger, type Section, SECTIONS, supprimerCompte,
} from "./moodboard";
import { type ActionsTuile, TuileCompte } from "./TuileCompte";

const TEINTE: Record<Section | "sans", { pastille: string; texte: string }> = {
  runvik: { pastille: "bg-orange-400", texte: "text-orange-700" },
  micabo: { pastille: "bg-violet-400", texte: "text-violet-700" },
  sophia: { pastille: "bg-pink-400", texte: "text-pink-700" },
  idees: { pastille: "bg-teal-400", texte: "text-teal-700" },
  sans: { pastille: "bg-stone-300", texte: "text-stone-500" },
};

const BADGE: Record<CarteLabel["badge"], string> = {
  existe: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  nouveau: "bg-sky-50 text-sky-700 ring-sky-200",
  propose: "bg-violet-50 text-violet-700 ring-violet-200",
  a_confirmer: "bg-amber-50 text-amber-700 ring-amber-200",
  idee: "bg-stone-100 text-stone-600 ring-stone-200",
};

export function PageBible() {
  const qc = useQueryClient();
  const comptes = useQuery({ queryKey: ["bible", "comptes"], queryFn: lireComptes });
  const cartes = useQuery({ queryKey: ["bible", "cartes"], queryFn: lireCartes });
  const [etape, setEtape] = React.useState<Etape>("a_importer");
  const [recherche, setRecherche] = React.useState("");
  const [section, setSection] = React.useState<Section | "sans" | "">("");
  const [ajout, setAjout] = React.useState(false);
  const [aRanger, setARanger] = React.useState<CompteBible | null>(null);
  const [occupes, setOccupes] = React.useState<Set<string>>(new Set());
  const [erreur, setErreur] = React.useState<string | null>(null);

  const liste = comptes.data ?? [];
  const toutes = cartes.data ?? [];
  const n = compterEtapes(liste);
  const groupes = ranger(liste, toutes, { etape, recherche, section });
  const rafraichir = () => { void qc.invalidateQueries({ queryKey: ["bible"] }); };

  const agir = async (c: CompteBible, f: () => Promise<unknown>) => {
    setErreur(null);
    setOccupes((s) => new Set(s).add(c.id));
    try {
      await f();
      await qc.invalidateQueries({ queryKey: ["bible"] });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupes((s) => { const x = new Set(s); x.delete(c.id); return x; });
    }
  };
  const actions: ActionsTuile = {
    onEtape: (c, e) => void agir(c, () => changerEtape([c.id], e)),
    onChangerLabel: (c) => setARanger(c),
    onNote: (c, note) => void agir(c, () => modifierNote(c.id, note)),
    onSupprimer: (c) => { if (window.confirm(`Supprimer @${c.handle} de la Bible ?`)) void agir(c, () => supprimerCompte(c.id)); },
  };
  const marquerImporte = async () => {
    if (!window.confirm(`Marquer les ${n.prochain_batch} comptes du batch comme importés ? (Ça ne change que la Bible.)`)) return;
    try {
      await marquerBatchImporte();
      rafraichir();
      setEtape("importe");
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <div className="space-y-6" data-testid="page-bible">
      <PageHeader
        title="Bible des comptes"
        description="Les comptes repérés, rangés par app puis par label, avec leurs 3 derniers TikToks. On prépare les imports par lots."
        actions={<Button onClick={() => setAjout(true)}><Plus className="size-4" /> Ajouter des comptes</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Étape" className="inline-flex rounded-full bg-stone-100 p-1 dark:bg-stone-800">
          {ETAPES.map((e) => (
            <button
              key={e.cle}
              role="tab"
              type="button"
              aria-selected={etape === e.cle}
              onClick={() => setEtape(e.cle)}
              className={cn("rounded-full px-4 py-1.5 text-sm transition", etape === e.cle ? "bg-white font-semibold text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white" : "text-stone-500 hover:text-stone-800")}
            >
              {e.libelle} <span className="ml-1 tabular-nums text-stone-400">{n[e.cle]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-stone-400" aria-hidden />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="@handle" className="h-9 w-48 rounded-full border border-stone-200 bg-white pl-8 pr-3 text-sm dark:border-stone-700 dark:bg-stone-900" />
          </div>
          <select value={section} onChange={(e) => setSection(e.target.value as Section | "sans" | "")} className="h-9 rounded-full border border-stone-200 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900" aria-label="App">
            <option value="">Toutes les apps</option>
            {SECTIONS.map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
          </select>
        </div>
      </div>

      {etape === "prochain_batch" && n.prochain_batch > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm text-stone-600"><b className="text-stone-900 dark:text-white">{n.prochain_batch}</b> compte{n.prochain_batch > 1 ? "s" : ""} dans le prochain batch.</p>
          <Button onClick={marquerImporte}><CheckCheck className="size-4" /> Marquer le batch comme importé</Button>
        </div>
      )}
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      {(comptes.isLoading || cartes.isLoading) && <p className="text-sm text-stone-500">Chargement…</p>}

      <div className="space-y-10 rounded-3xl bg-stone-50 p-4 sm:p-6 dark:bg-stone-950" data-testid="moodboard">
        {!comptes.isLoading && groupes.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-500">{etape === "prochain_batch" ? "Aucun compte dans le prochain batch : passe-les depuis « À importer »." : "Aucun compte ici."}</p>
        )}
        {groupes.map((g) => {
          const s = SECTIONS.find((x) => x.cle === g.section)!;
          return (
            <section key={g.section} className="space-y-4" data-section={g.section}>
              <h2 className="flex items-baseline gap-2.5">
                <span className={cn("size-2.5 translate-y-[-2px] rounded-full", TEINTE[g.section].pastille)} aria-hidden />
                <span className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">{s.libelle}</span>
                {s.sous && <span className="text-sm text-stone-400">{s.sous}</span>}
                <span className="text-sm tabular-nums text-stone-400">· {g.total} compte{g.total > 1 ? "s" : ""}</span>
              </h2>
              <div className="space-y-4">
                {g.cartes.map(({ carte, comptes: cs }) => (
                  <div key={carte?.id ?? "sans"} className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-stone-800 dark:bg-stone-900" data-carte={carte ? nomCarte(carte) : "sans_label"}>
                    {carte && (
                      <div className="mb-3 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-[15px] font-semibold text-stone-900 dark:text-white">{nomCarte(carte)}</code>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", BADGE[carte.badge])}>{LIBELLE_BADGE[carte.badge]}</span>
                          <span className="text-xs tabular-nums text-stone-400">{cs.length}</span>
                        </div>
                        {carte.description_da && <p className="max-w-3xl text-sm text-stone-500">{carte.description_da}</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {cs.map(({ compte, aussi }) => <TuileCompte key={compte.id + (aussi ? "-aussi" : "")} c={compte} aussi={aussi} actions={actions} occupe={occupes.has(compte.id)} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <DialogueLabel compte={aRanger} cartes={toutes} onFermer={() => setARanger(null)} onChoisir={async (carte) => { if (aRanger) await agir(aRanger, () => changerCarte(aRanger.id, carte)); }} />
      <DialogueAjout ouvert={ajout} cartes={toutes} onFermer={() => setAjout(false)} onFini={rafraichir} />
    </div>
  );
}
