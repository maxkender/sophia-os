/**
 * 19/11 (Adrien) : les onglets des sources dans la Bible (En import, À l'essai, Weekly update, Arrêtées). Le même
 * moodboard que les comptes repérés (par app, puis par label), précédé de ce qui se passe dans l'étape : la file
 * d'import, ou le bilan de la mise à jour du lundi.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

import { type CarteLabel, type EtapeSource, type Section, SECTIONS } from "./moodboard";
import { bilanSemaine, type DonneesSources, type FiltreSemaine, jourCourt, rangerSources } from "./sources";
import { TuileSource } from "./TuileSource";

const TEINTE: Record<Section | "sans", string> = {
  atala: "bg-emerald-500", micabo: "bg-violet-400", sophia: "bg-pink-400", idees: "bg-teal-400", sans: "bg-stone-300",
};

const FILTRES_SEMAINE: { cle: FiltreSemaine; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "retenues", libelle: "Retenues" },
  { cle: "pas_retenues", libelle: "Pas cette semaine" },
];

/** « En import » : ce qui tourne et ce qui attend, avec le jour au plus tôt. */
function FileEnBref({ donnees }: { donnees: DonneesSources }) {
  const { enCours, attente } = donnees.file;
  const neuves = attente.filter((a) => a.sorte === "neuve");
  if (!enCours && neuves.length === 0) return null;
  const jours = [...new Set(neuves.map((a) => a.prevuLe).filter(Boolean))].map((j) => jourCourt(j)).join(", ");
  return (
    <div className="space-y-1 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-900" data-testid="file-en-bref">
      {enCours && (
        <p>
          <b className="text-stone-900 dark:text-white">En cours :</b>{" "}
          {enCours.handle ? `@${enCours.handle}${enCours.restant > 0 ? `, ${enCours.restant} slideshow${enCours.restant > 1 ? "s" : ""} encore dans la file` : ""}` : "la séquence démarre"}
          {" · "}{enCours.faits} source{enCours.faits > 1 ? "s" : ""} passée{enCours.faits > 1 ? "s" : ""} sur {enCours.total}
          {enCours.aSuivre.length > 0 && <span className="text-stone-500"> · à suivre : {enCours.aSuivre.map((h) => `@${h}`).join(", ")}</span>}
        </p>
      )}
      {neuves.length > 0 && (
        <p>
          <b className="text-stone-900 dark:text-white">{neuves.length}</b> source{neuves.length > 1 ? "s" : ""} neuve{neuves.length > 1 ? "s" : ""} dans la file
          {jours ? ` : départ au plus tôt le ${jours}, à 6 h 37, si la séquence d'avant est finie.` : "."}
        </p>
      )}
    </div>
  );
}

/** « Weekly update » : le bilan du dernier lundi, et un filtre retenues / pas cette semaine. */
function SemaineEnBref({ donnees, filtre, onFiltre }: { donnees: DonneesSources; filtre: FiltreSemaine; onFiltre: (f: FiltreSemaine) => void }) {
  const b = bilanSemaine(donnees.semaine);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900" data-testid="semaine-en-bref">
      <p className="text-sm text-stone-600">
        {b ? (
          <>
            <b className="text-stone-900 dark:text-white">Lundi {jourCourt(b.semaine)}</b> : {b.retenues} source{b.retenues > 1 ? "s" : ""} retenue{b.retenues > 1 ? "s" : ""}
            {" "}({b.faites} mise{b.faites > 1 ? "s" : ""} à jour{b.aVenir > 0 ? `, ${b.aVenir} à venir à ${donnees.regles.lotMax} par jour` : ""}), {b.pasRetenues} pas cette semaine.
            {" "}{b.importes} slideshow{b.importes > 1 ? "s" : ""} importé{b.importes > 1 ? "s" : ""}, {b.valides} validé{b.valides > 1 ? "s" : ""}.
          </>
        ) : "Pas encore de mise à jour du lundi."}
      </p>
      <div role="group" aria-label="Décision du lundi" className="inline-flex rounded-full bg-stone-100 p-0.5 dark:bg-stone-800">
        {FILTRES_SEMAINE.map((f) => (
          <button
            key={f.cle}
            type="button"
            aria-pressed={filtre === f.cle}
            onClick={() => onFiltre(f.cle)}
            className={cn("rounded-full px-3 py-1 text-xs transition", filtre === f.cle ? "bg-white font-semibold text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white" : "text-stone-500 hover:text-stone-800")}
          >
            {f.libelle}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VueSources({ etape, donnees, cartes, recherche, section }: {
  etape: EtapeSource; donnees: DonneesSources; cartes: CarteLabel[]; recherche: string; section: Section | "sans" | "";
}) {
  const [semaine, setSemaine] = React.useState<FiltreSemaine>("toutes");
  const groupes = rangerSources(donnees.sources, donnees.labels, cartes, { etape, recherche, section, semaine });
  const vide = etape === "en_import" ? "Aucune source en cours d'import." : etape === "essai" ? "Aucune source à l'essai." : etape === "weekly" ? "Aucune source ici." : "Aucune source arrêtée.";

  return (
    <>
      {etape === "en_import" && <FileEnBref donnees={donnees} />}
      {etape === "weekly" && <SemaineEnBref donnees={donnees} filtre={semaine} onFiltre={setSemaine} />}
      <div className="space-y-10 rounded-3xl bg-stone-50 p-4 sm:p-6 dark:bg-stone-950" data-testid="moodboard-sources">
        {groupes.length === 0 && <p className="py-10 text-center text-sm text-stone-500">{vide}</p>}
        {groupes.map((g) => {
          const s = SECTIONS.find((x) => x.cle === g.section)!;
          return (
            <section key={g.section} className="space-y-4" data-section={g.section}>
              <h2 className="flex items-baseline gap-2.5">
                <span className={cn("size-2.5 translate-y-[-2px] rounded-full", TEINTE[g.section])} aria-hidden />
                <span className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">{s.libelle}</span>
                <span className="text-sm tabular-nums text-stone-400">· {g.total} source{g.total > 1 ? "s" : ""}</span>
              </h2>
              <div className="space-y-4">
                {g.cartes.map(({ carte, sources }) => (
                  <div key={carte?.cle ?? "sans"} className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-stone-800 dark:bg-stone-900" data-carte={carte?.nom ?? "sans_label"}>
                    {carte && (
                      <div className="mb-3 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-[15px] font-semibold text-stone-900 dark:text-white">{carte.nom}</code>
                          <span className="text-xs tabular-nums text-stone-400">{sources.length}</span>
                        </div>
                        {carte.description && <p className="max-w-3xl text-sm text-stone-500">{carte.description}</p>}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {sources.map(({ source, aussi }) => <TuileSource key={source.id + (aussi ? "-aussi" : "")} s={source} aussi={aussi} regles={donnees.regles} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
