/**
 * 19/11 (Adrien) : une source dans le moodboard de la Bible (onglets En import, À l'essai, Weekly update, Arrêtées).
 * Même tuile qu'un compte repéré, avec ce que la page Sources montre : son état en une phrase, son r, son r face au
 * label, son stock, et 3 slides de ses posts les plus vus (nos médias).
 */
import { ImageOff, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

import { drapeauLangue } from "@/features/moteur/langues";
import { POSTS_MIN_R, tonPerf, tonVsLabel, type TonPerf } from "@/features/moteur/perfSource";
import { cn } from "@/lib/utils";

import { phraseEtat, r2, type ReglesSources, type SourceBible, type TonEtat } from "./sources";

const TON_ETAT: Record<TonEtat, string> = {
  neutre: "text-stone-500",
  attente: "text-stone-800 dark:text-stone-200",
  bon: "text-emerald-700 dark:text-emerald-400",
  alerte: "text-amber-700 dark:text-amber-400",
};

const TON_R: Record<TonPerf, string> = {
  bon: "font-semibold text-emerald-700 dark:text-emerald-400",
  moyen: "font-medium text-stone-800 dark:text-stone-200",
  faible: "font-semibold text-amber-700 dark:text-amber-400",
  incertain: "text-stone-400",
  aucun: "text-stone-400",
};

export function TuileSource({ s, aussi, regles }: { s: SourceBible; aussi?: boolean; regles: ReglesSources }) {
  const etat = phraseEtat(s, regles);
  const perf = s.perf ?? undefined;
  const r = r2(s.perf?.r);
  const vs = r2(s.perf?.rVsLabel);
  const posts = s.perf?.posts ?? 0;
  const bulleR = r
    ? `r médian de ${posts} post${posts > 1 ? "s" : ""} mesuré${posts > 1 ? "s" : ""} chez nous (publiés il y a 3 à 30 jours)${posts < POSTS_MIN_R ? ` : indicatif sous ${POSTS_MIN_R} posts` : ""}`
    : "Aucun post de cette source mesuré chez nous (3 à 30 jours)";

  return (
    <article
      className="group relative flex w-[248px] shrink-0 flex-col gap-2 rounded-2xl border border-stone-200/80 bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
      data-source={s.handle}
    >
      <div className="min-w-0 px-0.5">
        <div className="flex items-start justify-between gap-1.5">
          <a href={`https://www.tiktok.com/@${s.handle}`} target="_blank" rel="noreferrer" className="block min-w-0 break-all text-[13px] font-semibold leading-snug text-stone-900 hover:underline dark:text-stone-100">
            <span className="font-normal text-stone-400">tiktok.com/</span>@{s.handle}
          </a>
          {s.langue && <span className="shrink-0 text-sm leading-snug" title={s.langue}>{drapeauLangue(s.langue)}</span>}
        </div>
        {aussi && <span className="mt-1 inline-block rounded-full bg-stone-100 px-1.5 py-px text-[10px] text-stone-500 dark:bg-stone-800">aussi ici</span>}
        <p className={cn("mt-1 text-[11px] leading-snug", TON_ETAT[etat.ton])} data-testid={`etat-${s.handle}`}>{etat.texte}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] tabular-nums text-stone-500">
          <span className={TON_R[tonPerf(perf)]} title={bulleR}>r {r ?? "—"}</span>
          {vs && (
            <span className={TON_R[tonVsLabel(perf)]} title={`r de la source ÷ r de son label${s.perf?.labelNom ? ` (${s.perf.labelNom})` : ""}`}>
              ×{vs} label
            </span>
          )}
          <span title="Slideshows gardés (validés) sur slideshows importés de cette source">
            stock <b className="font-medium text-stone-700 dark:text-stone-300">{s.valides}</b> / {s.importes}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => {
          const m = s.slides[i];
          if (!m) {
            return (
              <div key={i} className="flex aspect-[9/16] items-center justify-center rounded-lg bg-stone-100 text-stone-300 dark:bg-stone-800">
                <ImageOff className="size-3.5" aria-hidden />
              </div>
            );
          }
          const image = <img src={m.url} alt={`@${s.handle}, slide ${i + 1}`} loading="lazy" className="size-full object-cover" />;
          return m.post
            ? <a key={i} href={m.post} target="_blank" rel="noreferrer" className="block aspect-[9/16] overflow-hidden rounded-lg bg-stone-100">{image}</a>
            : <div key={i} className="aspect-[9/16] overflow-hidden rounded-lg bg-stone-100">{image}</div>;
        })}
      </div>

      {/* Les réglages d'une source (langue, labels, mise à jour à la main) restent sur la page Sources pour l'instant. */}
      <div className="pointer-events-none absolute inset-x-2 bottom-3 flex justify-center opacity-0 transition group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <Link to="/admin/sources" className="inline-flex h-7 items-center gap-1 rounded-full border border-stone-200 bg-white/95 px-2 text-[11px] font-medium text-stone-700 shadow-sm backdrop-blur hover:bg-white">
          <Settings2 className="size-3.5" aria-hidden />
          Réglages dans Sources
        </Link>
      </div>
    </article>
  );
}
