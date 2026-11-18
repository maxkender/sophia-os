/**
 * 19/11 (Max) : un compte de la Bible dans le moodboard : le lien tiktok.com/@handle en entier, la note en petit,
 * ses 3 derniers TikToks en vertical (cliquables), et au survol : Prochain batch / Retirer, Changer de label,
 * Modifier la note, Supprimer.
 */
import * as React from "react";
import { ArrowLeft, ArrowRight, ImageOff, Loader2, Pencil, Tags, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { CompteBible, Etape } from "./moodboard";
import { vuesCourtes } from "./moodboard";

export interface ActionsTuile {
  onEtape: (c: CompteBible, etape: Etape) => void;
  onChangerLabel: (c: CompteBible) => void;
  onNote: (c: CompteBible, note: string) => void;
  onSupprimer: (c: CompteBible) => void;
}

export function TuileCompte({ c, aussi, actions, occupe }: { c: CompteBible; aussi?: boolean; actions: ActionsTuile; occupe?: boolean }) {
  const [edition, setEdition] = React.useState(false);
  const [note, setNote] = React.useState(c.note_import ?? "");
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
        {aussi && <span className="mt-0.5 inline-block rounded-full bg-stone-100 px-1.5 py-px text-[10px] text-stone-500 dark:bg-stone-800">aussi ici</span>}
        {edition ? (
          <form className="mt-1 flex gap-1" onSubmit={(e) => { e.preventDefault(); actions.onNote(c, note); setEdition(false); }}>
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border px-2 text-xs" placeholder="Note (ex. pic 4,8 M)" />
            <button type="submit" className="rounded-md bg-stone-900 px-2 text-xs text-white">OK</button>
          </form>
        ) : (
          (c.note_import || stats) && (
            <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
              {c.note_import}{c.note_import && stats ? " · " : ""}{stats && <span className="text-stone-400">{stats}</span>}
            </p>
          )
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
              {i === 1 && (enCours ? "en cours" : (m?.erreur ?? c.miniatures_erreur ?? "pas de TikTok"))}
            </div>
          );
        })}
      </div>

      {/* Les actions, au survol (et au clavier). */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap justify-end gap-1 opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        {c.etape === "a_importer" && <Action icone={ArrowRight} libelle="Prochain batch" fort onClick={() => actions.onEtape(c, "prochain_batch")} />}
        {c.etape === "prochain_batch" && <Action icone={ArrowLeft} libelle="Retirer" onClick={() => actions.onEtape(c, "a_importer")} />}
        <Action icone={Tags} titre="Changer de label" onClick={() => actions.onChangerLabel(c)} />
        <Action icone={Pencil} titre="Modifier la note" onClick={() => { setNote(c.note_import ?? ""); setEdition(true); }} />
        <Action icone={Trash2} titre="Supprimer" danger onClick={() => actions.onSupprimer(c)} />
      </div>
    </article>
  );
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
