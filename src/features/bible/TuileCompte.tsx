/**
 * 19/11 (Max) : un compte de la Bible dans le moodboard : le lien tiktok.com/@handle en entier, la note en petit,
 * ses 3 derniers TikToks en vertical (cliquables), et au survol : Prochain batch / Retirer, Changer de label,
 * Modifier la note, Supprimer.
 *
 * 19/11 (Adrien) : plus de bouton « Importé ». Un compte quitte ces onglets quand sa source existe ; dans le prochain
 * batch, la tuile dit s'il est prêt à partir, ou ce qui le bloque. Un compte prêt (son label existe) s'importe d'un
 * clic, « Importer ».
 *
 * 23/11 : tuile compacte (172 px, `@handle` seul, note sur une ligne, remarque en icône). Les actions ne sont plus au
 * survol : l'action principale (« Importer », « Prochain batch », « Restaurer ») reste sous les miniatures, le reste
 * est dans le menu « ⋯ ».
 *
 * 20/11 (Adrien) : « à podzer » ne se marque plus sur le compte mais sur son LABEL (le bloc). La tuile n'a donc plus
 * ni case, ni pastille, ni bouton de podz ; un compte dont le label est à podzer n'est jamais importé.
 *
 * 24/11 : une case à cocher devant le @handle sélectionne la tuile pour les actions groupées de la page (étape,
 * label, import, corbeille), en plus des actions de la tuile elle-même.
 */
import * as React from "react";
import { ArrowLeft, ArrowRight, ImageOff, Loader2, Pencil, Rocket, RotateCcw, Tags, Trash2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Blocage, CompteBible, EtapeManuelle, SourceDuCompte } from "./moodboard";
import { LIBELLE_BLOCAGE, REMARQUE_UGC, vuesCourtes } from "./moodboard";
import { type EntreeMenu, MenuActions } from "./MenuActions";

export interface ActionsTuile {
  onEtape: (c: CompteBible, etape: EtapeManuelle) => void;
  onChangerLabel: (c: CompteBible) => void;
  onModifier: (c: CompteBible, p: { note: string; remarque: string }) => void;
  onSupprimer: (c: CompteBible) => void;
  onRestaurer: (c: CompteBible) => void;
  onSupprimerDefinitivement: (c: CompteBible) => void;
  /** Importer ce compte tout de suite (son label existe). */
  onImporter: (c: CompteBible) => void;
}

export function TuileCompte({ c, aussi, actions, occupe, blocage, montrerBlocage, podzValide, source, selectionne, onSelectionner }: {
  c: CompteBible; aussi?: boolean; actions: ActionsTuile; occupe?: boolean;
  /** Cochée pour les actions groupées ; absente (`onSelectionner` non donné) : pas de case. */
  selectionne?: boolean;
  onSelectionner?: (c: CompteBible) => void;
  /** Prêt à partir à l'import, ou ce qui le bloque. « prêt » : la tuile propose « Importer ». */
  blocage?: Blocage;
  /** Afficher ce blocage sur la tuile (dans le prochain batch). */
  montrerBlocage?: boolean;
  /** Dans la catégorie Podz de « Mise à jour hebdo » : un compte d'un label à podzer validé (ni étape, ni import). */
  podzValide?: boolean;
  /** Sa source, si le compte en est déjà une (avec les labels qu'elle porte). */
  source?: SourceDuCompte | null;
}) {
  const [edition, setEdition] = React.useState(false);
  const [note, setNote] = React.useState(c.note_import ?? "");
  const [remarque, setRemarque] = React.useState(c.remarque ?? "");
  const ouvrir = () => { setNote(c.note_import ?? ""); setRemarque(c.remarque ?? ""); setEdition(true); };
  const minis = (c.posts ?? []).slice(0, 3);
  const enCours = c.miniatures_statut === "a_faire" || c.miniatures_statut === null;
  const stats = [c.vues_mediane != null ? `méd. ${vuesCourtes(c.vues_mediane)}` : null, c.meilleur_post_vues != null ? `pic ${vuesCourtes(c.meilleur_post_vues)}` : null].filter(Boolean).join(" · ");

  const changerLabel: EntreeMenu = { libelle: "Changer de label", icone: Tags, onClick: () => actions.onChangerLabel(c) };
  const modifier: EntreeMenu = { libelle: "Modifier la note et la remarque", icone: Pencil, onClick: ouvrir };
  const supprimer: EntreeMenu = { libelle: "Supprimer", icone: Trash2, danger: true, onClick: () => actions.onSupprimer(c) };
  const dansBatch = c.etape === "prochain_batch";
  const pret = blocage === "pret";
  // L'action principale, toujours visible ; les autres dans le menu.
  const principale = c.supprime_at
    ? <Principale icone={RotateCcw} libelle="Restaurer" onClick={() => actions.onRestaurer(c)} />
    : podzValide ? null
    : pret ? <Principale icone={Rocket} libelle="Importer" fort onClick={() => actions.onImporter(c)} />
    : !dansBatch ? <Principale icone={ArrowRight} libelle="Prochain batch" onClick={() => actions.onEtape(c, "prochain_batch")} />
    : null;
  const menu: (EntreeMenu | false)[] = c.supprime_at
    ? [{ libelle: "Supprimer pour de bon", icone: Trash2, danger: true, onClick: () => actions.onSupprimerDefinitivement(c) }]
    : podzValide ? [changerLabel, modifier, supprimer]
    : [
      pret && !dansBatch && { libelle: "Prochain batch", icone: ArrowRight, onClick: () => actions.onEtape(c, "prochain_batch") },
      dansBatch && { libelle: "Retirer", icone: ArrowLeft, titre: "Retirer du prochain batch : le compte revient dans « À importer ».", onClick: () => actions.onEtape(c, "a_importer") },
      changerLabel, modifier, supprimer,
    ];

  return (
    <article
      className={cn(
        "relative flex w-[172px] shrink-0 flex-col gap-1.5 rounded-xl border border-stone-200/80 bg-white p-2 dark:border-stone-800 dark:bg-stone-900",
        selectionne && "border-stone-900 ring-1 ring-stone-900 dark:border-white dark:ring-white",
        occupe && "opacity-60",
      )}
      data-selectionne={selectionne || undefined}
      data-compte={c.handle}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-0.5">
          {onSelectionner && (
            <input
              type="checkbox"
              checked={Boolean(selectionne)}
              onChange={() => onSelectionner(c)}
              aria-label={`Sélectionner @${c.handle}`}
              className="mr-1 size-3.5 shrink-0 cursor-pointer accent-stone-900"
            />
          )}
          <a href={`https://www.tiktok.com/@${c.handle}`} target="_blank" rel="noreferrer" title={`tiktok.com/@${c.handle}`} className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-900 hover:underline dark:text-stone-100">
            @{c.handle}
          </a>
          {c.remarque && !edition && (
            <span role="img" aria-label={`Remarque : ${c.remarque}`} title={c.remarque} className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              <TriangleAlert className="size-3" aria-hidden />
            </span>
          )}
          <MenuActions nom={`Actions de @${c.handle}`} entrees={menu} className="!static" classePanneau="left-0 top-9" classeBouton="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-900 aria-expanded:bg-stone-100 aria-expanded:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white" />
        </div>
        {(aussi || source || (montrerBlocage && blocage)) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {aussi && <span className="inline-block rounded-full bg-stone-100 px-1.5 py-px text-[10px] text-stone-500 dark:bg-stone-800">aussi ici</span>}
            {source && (
              <span className="inline-block rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-700 ring-1 ring-sky-200" title="Ce compte est déjà une source de l'OS : il reste à lui donner le label de cette carte.">
                déjà une source{source.labels.length ? ` · ${source.labels.join(", ")}` : ""}
              </span>
            )}
            {montrerBlocage && blocage && blocage !== "deja_source" && (
              <span
                data-testid={`blocage-${c.handle}`}
                className={cn("inline-block rounded-full px-1.5 py-px text-[10px] font-medium ring-1", blocage === "pret" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200")}
              >
                {LIBELLE_BLOCAGE[blocage]}
              </span>
            )}
          </div>
        )}
        {edition ? (
          <form className="mt-1.5 space-y-1" onSubmit={(e) => { e.preventDefault(); actions.onModifier(c, { note, remarque }); setEdition(false); }}>
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} className="h-7 w-full rounded-md border px-2 text-xs" placeholder="Note (ex. pic 4,8 M)" aria-label="Note" />
            <div className="flex gap-1">
              <input value={remarque} onChange={(e) => setRemarque(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border px-2 text-xs" placeholder="Remarque" aria-label="Remarque" />
              <button type="button" onClick={() => setRemarque(REMARQUE_UGC)} title={REMARQUE_UGC} className="rounded-md bg-amber-50 px-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">UGC</button>
            </div>
            <div className="flex justify-end gap-1">
              <button type="button" onClick={() => setEdition(false)} className="rounded-md px-2 text-xs text-stone-500">Annuler</button>
              <button type="submit" className="rounded-md bg-stone-900 px-2 py-1 text-xs text-white">OK</button>
            </div>
          </form>
        ) : (c.note_import || stats) && (
          <p className="mt-0.5 truncate text-[11px] leading-snug text-stone-500" title={[c.note_import, stats].filter(Boolean).join(" · ")}>
            {c.note_import}{c.note_import && stats ? " · " : ""}{stats && <span className="text-stone-400">{stats}</span>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map((i) => {
          const m = minis[i];
          if (m?.miniature_url) {
            return (
              <a key={i} href={m.url} target="_blank" rel="noreferrer" className="relative block aspect-[9/16] overflow-hidden rounded-md bg-stone-100">
                <img src={m.miniature_url} alt={`@${c.handle}, TikTok ${i + 1}`} loading="lazy" className="size-full object-cover" />
                {m.vues != null && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/55 px-1 text-[9px] font-medium text-white">{vuesCourtes(m.vues)}</span>}
              </a>
            );
          }
          return (
            <div key={i} className="flex aspect-[9/16] flex-col items-center justify-center gap-1 rounded-md bg-stone-100 p-0.5 text-center text-[9px] leading-tight text-stone-400 dark:bg-stone-800" title={i === 1 && !enCours ? texteErreur(m ? m.erreur : c.miniatures_erreur, Boolean(m)) : undefined}>
              {enCours ? <Loader2 className="size-3.5 animate-spin" /> : <ImageOff className="size-3.5" />}
            </div>
          );
        })}
      </div>

      {principale}
    </article>
  );
}

/** L'erreur d'une miniature, en clair (« oEmbed 400 » → TikTok n'a pas rendu l'image). */
function texteErreur(erreur: string | null | undefined, post: boolean): string {
  if (!erreur) return post ? "image indisponible" : "pas de TikTok";
  if (/oembed|^\d{3}$|HTTP \d{3}/i.test(erreur)) return "TikTok n'a pas rendu l'image";
  return erreur;
}

function Principale({ icone: Icone, libelle, onClick, fort }: { icone: typeof Tags; libelle: string; onClick: () => void; fort?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border text-[11px] font-medium transition",
        fort ? "border-stone-900 bg-stone-900 text-white hover:bg-stone-800 dark:border-white dark:bg-white dark:text-stone-900" : "border-stone-200 text-stone-700 hover:border-stone-400 dark:border-stone-700 dark:text-stone-200",
      )}
    >
      <Icone className="size-3.5" />
      {libelle}
    </button>
  );
}
