/**
 * 18/11 (Max) : « Bible des comptes ». L'espace de stockage avant l'import, et la planche des DA par label :
 * galerie (app → label → cartes avec 3 miniatures), tableau éditable, fiche, ajout un à un ou en masse.
 * Admin au sens strict (Max, Adrien) : ni Head of Ops, ni managers, ni posteurs (RLS + route).
 */
import * as React from "react";
import { LayoutGrid, ListPlus, Plus, Rows3, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";

import { AjoutEnMasse, FormAjoutCompte, SELECT } from "./AjoutComptes";
import type { Doublon } from "./api";
import { CarteCompte } from "./CarteCompte";
import { appsAttenteConnues, useBible } from "./donnees";
import { FicheCompte, type Ouverture } from "./FicheCompte";
import { LabelsProposes } from "./LabelsProposes";
import { type Carte, cartes, couleurApp, type Filtres, FILTRES_VIDES, filtrer, grouper, type Vue } from "./modele";
import { TableauBible } from "./TableauBible";
import { LIBELLE_STATUT, STATUTS } from "./types";

export function PageBible() {
  const b = useBible();
  const [vue, setVue] = React.useState<Vue>("tous");
  const [mode, setMode] = React.useState<"galerie" | "tableau">("galerie");
  const [ajout, setAjout] = React.useState<"un" | "masse" | null>(null);
  const [filtres, setFiltres] = React.useState<Filtres>(FILTRES_VIDES);
  const [ouverture, setOuverture] = React.useState<Ouverture>(null);

  const toutes = cartes(b.fiches, b.importes, b.labels, b.proposes, "tous");
  const liste = filtrer(cartes(b.fiches, b.importes, b.labels, b.proposes, vue), filtres);
  const groupes = grouper(liste, b.apps, b.labels, b.proposes);
  const ouvrir = (c: Carte) => setOuverture({ bibleId: c.bibleId, refId: c.refId });
  const ouvrirDoublon = (d: Doublon) => setOuverture({ bibleId: d.bible_id, refId: d.compte_reference_id });
  const maj = (p: Partial<Filtres>) => setFiltres((f) => ({ ...f, ...p }));
  const enAttente = toutes.filter((c) => c.kind === "bible").length;
  const importes = toutes.filter((c) => c.kind === "importe").length;
  const auteurs = [...new Set(b.fiches.map((f) => f.ajoute_par).filter((x): x is string => Boolean(x)))];
  const langues = [...new Set(toutes.map((c) => c.langue).filter((x): x is string => Boolean(x)))].sort();

  return (
    <div className="space-y-6" data-testid="page-bible">
      <PageHeader
        title="Bible des comptes"
        description="Les comptes TikTok repérés, avant et après l'import : consignes, label, angle, et 3 posts par compte pour comparer les DA."
        actions={
          <>
            <Button variant="outline" onClick={() => setAjout(ajout === "masse" ? null : "masse")} aria-expanded={ajout === "masse"}>
              <ListPlus className="size-4" /> Ajout en masse
            </Button>
            <Button onClick={() => setAjout(ajout === "un" ? null : "un")} aria-expanded={ajout === "un"}>
              <Plus className="size-4" /> Ajouter un compte
            </Button>
          </>
        }
      />

      {ajout === "un" && <FormAjoutCompte onFermer={() => setAjout(null)} onOuvrirDoublon={ouvrirDoublon} />}
      {ajout === "masse" && <AjoutEnMasse onFermer={() => setAjout(null)} onOuvrirDoublon={ouvrirDoublon} />}

      <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segments
            libelle="Comptes affichés"
            actif={vue}
            onChange={setVue}
            options={[
              { cle: "importes", contenu: `Déjà importés · ${importes}` },
              { cle: "attente", contenu: `En attente d'import · ${enAttente}` },
              { cle: "tous", contenu: "Tous" },
            ]}
          />
          <Segments
            libelle="Vue"
            actif={mode}
            onChange={setMode}
            options={[
              { cle: "galerie", contenu: <span className="flex items-center gap-1.5"><LayoutGrid className="size-3.5" /> Galerie</span> },
              { cle: "tableau", contenu: <span className="flex items-center gap-1.5"><Rows3 className="size-3.5" /> Tableau</span> },
            ]}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={filtres.recherche} onChange={(e) => maj({ recherche: e.target.value })} placeholder="@handle, note…" className="h-9 pl-8" />
          </div>
          <select className={SELECT} value={filtres.app} onChange={(e) => maj({ app: e.target.value })} aria-label="App">
            <option value="">Toutes les apps</option>
            {b.apps.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            {appsAttenteConnues(b.fiches, b.proposes).length > 0 && <option value="attente">Apps en attente</option>}
          </select>
          <select className={SELECT} value={filtres.label} onChange={(e) => maj({ label: e.target.value })} aria-label="Label">
            <option value="">Tous les labels</option>
            {b.labels.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            {b.proposes.filter((p) => p.statut === "a_valider").map((p) => <option key={p.id} value={p.id}>{p.nom} (proposé)</option>)}
          </select>
          <select className={SELECT} value={filtres.statut} onChange={(e) => maj({ statut: e.target.value })} aria-label="Statut">
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
          </select>
          <select className={SELECT} value={filtres.niche} onChange={(e) => maj({ niche: e.target.value as Filtres["niche"] })} aria-label="Niché">
            <option value="">Niché : tous</option><option value="oui">100 % niché</option><option value="non">Pas 100 % niché</option>
          </select>
          <select className={SELECT} value={filtres.langue} onChange={(e) => maj({ langue: e.target.value })} aria-label="Langue">
            <option value="">Toutes les langues</option>
            {langues.map((l) => <option key={l} value={l}>{LANGUES_CIBLES.includes(l as never) ? nomLangue(l) : l}</option>)}
          </select>
          <select className={SELECT} value={filtres.ajoutePar} onChange={(e) => maj({ ajoutePar: e.target.value })} aria-label="Ajouté par">
            <option value="">Ajouté par : tous</option>
            {auteurs.map((id) => <option key={id} value={id}>{b.noms[id] ?? "admin"}</option>)}
          </select>
        </div>
      </div>

      {b.erreur && <p className="text-sm text-destructive">{b.erreur.message}</p>}
      {b.chargement && <p className="text-sm text-muted-foreground">Chargement…</p>}

      {mode === "tableau" ? (
        <TableauBible liste={liste} onOuvrir={ouvrir} />
      ) : (
        <div className="space-y-10" data-testid="galerie-bible">
          {vue !== "importes" && <LabelsProposes toutes={toutes} onOuvrir={ouvrir} />}
          {!b.chargement && groupes.length === 0 && <p className="text-sm text-muted-foreground">Aucun compte avec ces filtres.</p>}
          {groupes.map((g) => {
            const couleur = couleurApp(g.slug, g.cle);
            return (
              <section key={g.cle} className="space-y-5" data-app={g.nom}>
                <div className="flex items-center gap-2 border-b pb-2">
                  <span className={cn("size-3 rounded-full", couleur.pastille)} aria-hidden />
                  <h2 className="text-lg font-semibold">{g.nom}</h2>
                  <span className="text-sm text-muted-foreground">{g.total} compte{g.total > 1 ? "s" : ""}</span>
                </div>
                {g.labels.map((l) => (
                  <div key={l.cle} className={cn("space-y-3 rounded-2xl border p-3 sm:p-4", couleur.bord, couleur.fond)} data-label={l.nom}>
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold">
                        {l.nom}
                        {l.propose && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-sans text-[11px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200">proposé, à valider</span>}
                        <span className="font-sans text-xs font-normal text-muted-foreground">{l.cartes.length}</span>
                      </h3>
                      {l.description && <p className="mt-0.5 text-xs text-muted-foreground">{l.description}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {l.cartes.map((c) => <CarteCompte key={c.cle} c={c} onOuvrir={ouvrir} />)}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <FicheCompte ouverture={ouverture} onFermer={() => setOuverture(null)} />
    </div>
  );
}
