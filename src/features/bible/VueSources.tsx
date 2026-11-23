/**
 * 19/11 (Adrien) : les onglets des sources dans la Bible (En import, À l'essai, Weekly update, Essai raté,
 * Arrêtées). Le même
 * moodboard que les comptes repérés (par app, puis par label), précédé de ce qui se passe dans l'étape : les sources
 * neuves en cours d'import, ou le bilan de la semaine (le lundi décide, les mises à jour partent chaque matin).
 */
import * as React from "react";

import { cn } from "@/lib/utils";

import { type CarteLabel, type EtapeSource, type Section, SECTIONS } from "./moodboard";
import { bilanSemaine, type DonneesSources, enImportEnBref, type FiltreSemaine, jourCourt, rangerSources } from "./sources";
import { BarrePliage, BoutonPli } from "./Pli";
import { usePliage } from "./pliage";
import { TuileSource } from "./TuileSource";

const TEINTE: Record<Section | "sans", string> = {
  atala: "bg-emerald-500", micabo: "bg-violet-400", sophia: "bg-pink-400", idees: "bg-teal-400", sans: "bg-stone-300",
};

const FILTRES_SEMAINE: { cle: FiltreSemaine; libelle: string }[] = [
  { cle: "toutes", libelle: "Toutes" },
  { cle: "retenues", libelle: "Retenues" },
  { cle: "pas_retenues", libelle: "Pas cette semaine" },
];

/**
 * « En import » : où en sont les sources neuves. Chacune part dès qu'elle est créée (0772) : rien n'attend ici un
 * lot ni le lendemain.
 */
function ImportEnBref({ donnees }: { donnees: DonneesSources }) {
  const b = enImportEnBref(donnees.sources);
  if (!b) return null;
  return (
    <p className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-900" data-testid="import-en-bref">
      <b className="text-stone-900 dark:text-white">{b.total}</b> source{b.total > 1 ? "s" : ""} en import{b.detail ? ` : ${b.detail}.` : "."}
    </p>
  );
}

/** Le lot de mises à jour qui tourne (une source à la fois, la suivante quand la file d'import est vide). */
function LotEnCours({ donnees }: { donnees: DonneesSources }) {
  const c = donnees.file.enCours;
  if (!c) return null;
  const s = (n: number) => (n > 1 ? "s" : "");
  const ou = c.handle
    ? `@${c.handle}${c.restant > 0 ? `, ${c.restant} slideshow${s(c.restant)} encore dans la file` : ""}`
    : c.restant > 0 ? `le lot attend que la file d'import se vide (${c.restant} slideshow${s(c.restant)})` : "le lot démarre";
  return (
    <p className="text-sm text-stone-600" data-testid="lot-en-cours">
      <b className="text-stone-900 dark:text-white">Mise à jour en cours :</b> {ou}
      {" · "}{c.faits} source{s(c.faits)} passée{s(c.faits)} sur {c.total}
      {c.aSuivre.length > 0 && <span className="text-stone-500"> · à suivre : {c.aSuivre.map((h) => `@${h}`).join(", ")}</span>}
    </p>
  );
}

/**
 * « Weekly update » : le bilan de la semaine, et un filtre retenues / pas cette semaine. Le lundi ne fait que
 * DÉCIDER ; les mises à jour partent ensuite chaque matin, par lots, et les imports s'étalent sur la semaine.
 */
function SemaineEnBref({ donnees, filtre, onFiltre }: { donnees: DonneesSources; filtre: FiltreSemaine; onFiltre: (f: FiltreSemaine) => void }) {
  const b = bilanSemaine(donnees.semaine);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-3 shadow-sm dark:border-stone-800 dark:bg-stone-900" data-testid="semaine-en-bref">
      <div className="space-y-1">
        <p className="text-sm text-stone-600">
          {b ? (
            <>
              <b className="text-stone-900 dark:text-white">Semaine du {jourCourt(b.semaine)}</b> : lundi, {b.retenues} source{b.retenues > 1 ? "s" : ""} retenue{b.retenues > 1 ? "s" : ""}
              {" "}et {b.pasRetenues} pas cette semaine. {b.faites} déjà mise{b.faites > 1 ? "s" : ""} à jour
              {b.aVenir > 0 ? `, ${b.aVenir} à venir (${donnees.regles.lotMax} par jour, chaque matin à 6 h 37)` : ""}.
              {" "}Depuis lundi : {b.importes} slideshow{b.importes > 1 ? "s" : ""} importé{b.importes > 1 ? "s" : ""}, {b.valides} validé{b.valides > 1 ? "s" : ""}.
            </>
          ) : "Pas encore de mise à jour du lundi."}
        </p>
        <LotEnCours donnees={donnees} />
      </div>
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
  const pliage = usePliage();
  const groupes = rangerSources(donnees.sources, donnees.labels, cartes, { etape, recherche, section, semaine });
  const VIDE: Record<EtapeSource, string> = {
    en_import: "Aucune source en cours d'import.",
    essai: "Aucune source à l'essai.",
    weekly: "Aucune source ici.",
    essai_rate: "Aucune source n'a raté son essai.",
    arretees: "Aucune source désactivée.",
  };
  const vide = VIDE[etape];

  return (
    <>
      {etape === "en_import" && <ImportEnBref donnees={donnees} />}
      {etape === "weekly" && <SemaineEnBref donnees={donnees} filtre={semaine} onFiltre={setSemaine} />}
      <div className="flex justify-end">
        <BarrePliage
          pliage={pliage}
          apps={groupes.map((g) => `app:${g.section}`)}
          labels={groupes.flatMap((g) => g.cartes.filter((x) => x.carte).map((x) => `source:${x.carte!.cle}`))}
        />
      </div>
      <div className="space-y-10 rounded-3xl bg-stone-50 p-4 sm:p-6 dark:bg-stone-950" data-testid="moodboard-sources">
        {groupes.length === 0 && <p className="py-10 text-center text-sm text-stone-500">{vide}</p>}
        {groupes.map((g) => {
          const s = SECTIONS.find((x) => x.cle === g.section)!;
          const appPliee = pliage.estPlie(`app:${g.section}`);
          return (
            <section key={g.section} className="space-y-4" data-section={g.section} data-plie={appPliee || undefined}>
              <h2 className="flex items-center gap-2.5">
                <BoutonPli plie={appPliee} onClick={() => pliage.basculer(`app:${g.section}`)} nom={s.libelle} className="-ml-1.5" />
                <button type="button" onClick={() => pliage.basculer(`app:${g.section}`)} className="flex items-baseline gap-2.5 text-left">
                  <span className={cn("size-2.5 translate-y-[-2px] rounded-full", TEINTE[g.section])} aria-hidden />
                  <span className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">{s.libelle}</span>
                  <span className="text-sm tabular-nums text-stone-400">· {g.total} source{g.total > 1 ? "s" : ""}</span>
                </button>
              </h2>
              {!appPliee && (
              <div className="space-y-4">
                {g.cartes.map(({ carte, sources }) => {
                  const labelPlie = Boolean(carte && pliage.estPlie(`source:${carte.cle}`));
                  return (
                  <div key={carte?.cle ?? "sans"} className={cn("rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-stone-800 dark:bg-stone-900", labelPlie && "py-2.5")} data-carte={carte?.nom ?? "sans_label"}>
                    {carte && (
                      <div className={cn("space-y-1", !labelPlie && "mb-3")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <BoutonPli plie={labelPlie} onClick={() => pliage.basculer(`source:${carte.cle}`)} nom={carte.nom} className="-ml-1" />
                          <button type="button" onClick={() => pliage.basculer(`source:${carte.cle}`)} className="text-left">
                            <code className="text-[15px] font-semibold text-stone-900 dark:text-white">{carte.nom}</code>
                          </button>
                          <span className="text-xs tabular-nums text-stone-400">{sources.length}</span>
                        </div>
                        {carte.description && !labelPlie && <p className="max-w-3xl text-sm text-stone-500">{carte.description}</p>}
                      </div>
                    )}
                    {!labelPlie && (
                    <div className="flex flex-wrap gap-3">
                      {sources.map(({ source, aussi }) => <TuileSource key={source.id + (aussi ? "-aussi" : "")} s={source} aussi={aussi} regles={donnees.regles} />)}
                    </div>
                    )}
                  </div>
                  );
                })}
              </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
