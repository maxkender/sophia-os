/**
 * 19/11 (Max) : un compte de la Bible dans le moodboard : le lien tiktok.com/@handle en entier, la note en petit,
 * ses 3 derniers TikToks en vertical (cliquables), et au survol : Prochain batch / Retirer, Changer de label,
 * Modifier la note, Supprimer.
 *
 * 19/11 (Adrien) : plus de bouton « Importé ». Un compte quitte ces onglets quand sa source existe ; dans le prochain
 * batch, la tuile dit s'il est prêt à partir, ou ce qui le bloque. Un compte prêt (son label existe) s'importe d'un
 * clic, « Importer ».
 *
 * 20/11 (Adrien) : « à podzer » ne se marque plus sur le compte mais sur son LABEL (le bloc). La tuile n'a donc plus
 * ni case, ni pastille, ni bouton de podz ; un compte dont le label est à podzer n'est jamais importé.
 */
import * as React from "react";
import { ArrowLeft, ArrowRight, ImageOff, Loader2, Pencil, Rocket, RotateCcw, Tags, Trash2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Blocage, CompteBible, EtapeManuelle, SourceDuCompte } from "./moodboard";
import { LIBELLE_BLOCAGE, REMARQUE_UGC, vuesCourtes } from "./moodboard";

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

export function TuileCompte({ c, aussi, actions, occupe, blocage, montrerBlocage, podzValide, source }: {
  c: CompteBible; aussi?: boolean; actions: ActionsTuile; occupe?: boolean;
  /** Prêt à partir à l'import, ou ce qui le bloque. « prêt » : la tuile propose « Importer ». */
  blocage?: Blocage;
  /** Afficher ce blocage sur la tuile (dans le prochain batch). */
  montrerBlocage?: boolean;
  /** Dans la catégorie Podz de « Weekly update » : un compte d'un label à podzer validé (ni étape, ni import). */
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

  return (
    <article
      className={cn("group relative flex w-[248px] shrink-0 flex-col gap-2 rounded-2xl border border-stone-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900", occupe && "opacity-60")}
      data-compte={c.handle}
    >
      <div className="min-w-0 px-0.5">
        <a href={`https://www.tiktok.com/@${c.handle}`} target="_blank" rel="noreferrer" className="block break-all text-[13px] font-semibold leading-snug text-stone-900 hover:underline dark:text-stone-100">
          <span className="font-normal text-stone-400">tiktok.com/</span>@{c.handle}
        </a>
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
              <input value={remarque} onChange={(e) => setRemarque(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border px-2 text-xs" placeholder="Remarque (ex. changer les images)" aria-label="Remarque" />
              <button type="button" onClick={() => setRemarque(REMARQUE_UGC)} title={REMARQUE_UGC} className="rounded-md bg-amber-50 px-1.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">UGC</button>
            </div>
            <div className="flex justify-end gap-1">
              <button type="button" onClick={() => { setEdition(false); actions.onSupprimer(c); }} className="rounded-md px-1.5 text-xs text-red-600 hover:bg-red-50">Supprimer</button>
              <button type="button" onClick={() => setEdition(false)} className="rounded-md px-2 text-xs text-stone-500">Annuler</button>
              <button type="submit" className="rounded-md bg-stone-900 px-2 py-1 text-xs text-white">OK</button>
            </div>
          </form>
        ) : (
          <>
            {(c.note_import || stats) && (
              <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
                {c.note_import}{c.note_import && stats ? " · " : ""}{stats && <span className="text-stone-400">{stats}</span>}
              </p>
            )}
            {c.remarque && (
              <p className="mt-1 flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-1 text-[11px] leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />{c.remarque}
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => {
          const m = minis[i];
          if (m?.miniature_url) {
            return (
              <a key={i} href={m.url} target="_blank" rel="noreferrer" className="relative block aspect-[9/16] overflow-hidden rounded-lg bg-stone-100">
                <img src={m.miniature_url} alt={`@${c.handle}, TikTok ${i + 1}`} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                {m.vues != null && <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] font-medium text-white">{vuesCourtes(m.vues)}</span>}
              </a>
            );
          }
          return (
            <div key={i} className="flex aspect-[9/16] flex-col items-center justify-center gap-1 rounded-lg bg-stone-100 p-1 text-center text-[9px] leading-tight text-stone-400 dark:bg-stone-800">
              {enCours ? <Loader2 className="size-3.5 animate-spin" /> : <ImageOff className="size-3.5" />}
              {i === 1 && (enCours ? "en cours" : texteErreur(m ? m.erreur : c.miniatures_erreur, Boolean(m)))}
            </div>
          );
        })}
      </div>

      {/* Les actions, au survol (et au clavier), posées sur le bas des miniatures pour laisser le lien lisible. */}
      <div className="pointer-events-none absolute inset-x-2 bottom-3 flex flex-wrap justify-center gap-1 opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        {c.supprime_at ? (
          <>
            <Action icone={RotateCcw} libelle="Restaurer" fort onClick={() => actions.onRestaurer(c)} />
            <Action icone={Trash2} libelle="Supprimer pour de bon" danger onClick={() => actions.onSupprimerDefinitivement(c)} />
          </>
        ) : podzValide ? (
          <>
            <Action icone={Tags} libelle="Changer de label" onClick={() => actions.onChangerLabel(c)} />
            <Action icone={Pencil} titre="Modifier la note et la remarque" onClick={ouvrir} />
            <Action icone={Trash2} libelle="Supprimer" danger onClick={() => actions.onSupprimer(c)} />
          </>
        ) : (
          <>
            {blocage === "pret" && <Action icone={Rocket} libelle="Importer" fort onClick={() => actions.onImporter(c)} />}
            {c.etape === "prochain_batch"
              ? <Action icone={ArrowLeft} libelle="Retirer" onClick={() => actions.onEtape(c, "a_importer")} />
              : <Action icone={ArrowRight} libelle="Prochain batch" fort={blocage !== "pret" && blocage !== "podz"} onClick={() => actions.onEtape(c, "prochain_batch")} />}
            <Action icone={Tags} titre="Changer de label" onClick={() => actions.onChangerLabel(c)} />
            <Action icone={Pencil} titre="Modifier la note et la remarque" onClick={ouvrir} />
            <Action icone={Trash2} libelle="Supprimer" danger onClick={() => actions.onSupprimer(c)} />
          </>
        )}
      </div>
    </article>
  );
}

/** L'erreur d'une miniature, en clair (« oEmbed 400 » → TikTok n'a pas rendu l'image). */
function texteErreur(erreur: string | null | undefined, post: boolean): string {
  if (!erreur) return post ? "image indisponible" : "pas de TikTok";
  if (/oembed|^\d{3}$|HTTP \d{3}/i.test(erreur)) return "TikTok n'a pas rendu l'image";
  return erreur;
}

function Action({ icone: Icone, libelle, titre, onClick, fort, danger }: { icone: typeof Tags; libelle?: string; titre?: string; onClick: () => void; fort?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={titre ?? libelle}
      aria-label={titre ?? libelle}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-medium shadow-sm backdrop-blur transition",
        fort ? "border-stone-900 bg-stone-900 text-white hover:bg-stone-800" : "border-stone-200 bg-white/95 text-stone-700 hover:bg-white",
        danger && "text-red-600 hover:bg-red-50",
      )}
    >
      <Icone className="size-3.5" />
      {libelle}
    </button>
  );
}
