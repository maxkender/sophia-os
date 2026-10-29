import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { HandleTiktok } from "@/features/ckd/cohorte/liens";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { type CompteSemaine, type FiltresListe, optionsFiltres, type Tri } from "./semaineComptes";

/**
 * Prompt 25 : les morceaux communs des listes du jeudi et du samedi. Les
 * filtres (HM, pays, nombre de posts, shadowban, nom) et le tri par posts ;
 * le compte (handle cliquable vers TikTok, posteur, HM, pays) ; les posts avec
 * lien jour par jour ; les vues des derniers posts ; les signaux.
 */

const selectClass =
  "h-8 max-w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const TH = "pb-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
export const TD = "py-2 pr-3 align-top";

export function BarreFiltres({
  liste,
  filtres,
  setFiltres,
  tri,
  setTri,
}: {
  liste: readonly CompteSemaine[];
  filtres: FiltresListe;
  setFiltres: (f: FiltresListe) => void;
  tri: Tri;
  setTri: (t: Tri) => void;
}) {
  const { t } = useTranslation();
  const { hms, pays } = React.useMemo(() => optionsFiltres(liste), [liste]);
  const f = (k: keyof FiltresListe) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setFiltres({ ...filtres, [k]: e.target.value });
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="filtres-liste">
      <select className={selectClass} aria-label={t("autoOnglets.decisions.liste.filtres.hm")} value={filtres.hm} onChange={f("hm")}>
        <option value="">{t("autoOnglets.decisions.liste.filtres.toutesHm")}</option>
        {hms.map(([id, nom]) => (
          <option key={id} value={id}>
            {nom}
          </option>
        ))}
      </select>
      <select className={selectClass} aria-label={t("autoOnglets.decisions.liste.filtres.pays")} value={filtres.pays} onChange={f("pays")}>
        <option value="">{t("autoOnglets.decisions.liste.filtres.tousPays")}</option>
        {pays.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select className={selectClass} aria-label={t("autoOnglets.decisions.liste.filtres.posts")} value={filtres.posts} onChange={f("posts")}>
        {["tous", "manque", "ok", "0", "max2", "max4"].map((o) => (
          <option key={o} value={o}>
            {t(`autoOnglets.decisions.liste.filtres.postsOptions.${o}`)}
          </option>
        ))}
      </select>
      <select className={selectClass} aria-label={t("autoOnglets.decisions.liste.filtres.shadowban")} value={filtres.shadowban} onChange={f("shadowban")}>
        {["tous", "oui", "non"].map((o) => (
          <option key={o} value={o}>
            {t(`autoOnglets.decisions.liste.filtres.shadowbanOptions.${o}`)}
          </option>
        ))}
      </select>
      <select className={selectClass} aria-label={t("autoOnglets.decisions.liste.filtres.tri")} value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
        {(["posts_asc", "posts_desc", "nom"] as const).map((o) => (
          <option key={o} value={o}>
            {t(`autoOnglets.decisions.liste.filtres.tris.${o}`)}
          </option>
        ))}
      </select>
      <Input
        className="h-8 w-44"
        placeholder={t("autoOnglets.decisions.liste.filtres.nom")}
        aria-label={t("autoOnglets.decisions.liste.filtres.nom")}
        value={filtres.nom}
        onChange={f("nom")}
      />
    </div>
  );
}

/** Le compte : handle cliquable (TikTok, nouvel onglet), posteur, HM, pays. */
export function CelluleCompte({ c }: { c: CompteSemaine }) {
  return (
    <div className="min-w-40 space-y-0.5">
      <HandleTiktok handle={c.handle} pays={c.pays} className="font-medium" />
      <p className="text-xs text-muted-foreground">{[c.poster_nom, c.hm_nom ? `HM ${c.hm_nom}` : null].filter(Boolean).join(" · ")}</p>
    </div>
  );
}

/** Les jours de la semaine affichés (en-têtes « Mon », « Tue »…). */
export function EnTetesJours({ jours }: { jours: readonly string[] }) {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), { weekday: "short", timeZone: "UTC" });
  return (
    <>
      {jours.map((j) => (
        <th key={j} className={cn(TH, "text-center")}>
          {fmt.format(new Date(`${j}T12:00:00Z`))}
        </th>
      ))}
    </>
  );
}

/** Posts avec lien sur prévus, jour par jour ; un jour passé avec un manque en couleur. */
export function CellulesJours({ c, aujourdhui }: { c: CompteSemaine; aujourdhui: string }) {
  return (
    <>
      {c.jours.map((j) => {
        const manque = j.jour < aujourdhui && j.lien < j.prevus;
        return (
          <td key={j.jour} className={cn(TD, "text-center tabular-nums")} data-jour={j.jour}>
            <span className={cn(manque && "font-semibold text-warning-foreground", j.prevus === 0 && "text-muted-foreground")}>
              {j.prevus === 0 && j.lien === 0 ? "–" : `${j.lien}/${j.prevus}`}
            </span>
          </td>
        );
      })}
    </>
  );
}

/** Les vues des derniers posts (lien vers le post). */
export function CelluleVues({ c }: { c: CompteSemaine }) {
  if (c.vues.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-2 text-xs tabular-nums">
      {c.vues.map((v) => (
        <a key={v.url} href={v.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          {v.vues === null ? "?" : v.vues.toLocaleString()}
        </a>
      ))}
    </span>
  );
}

/** Shadowban supposé, compte mort, liens introuvables, 2e compte. */
export function Signaux({ c }: { c: CompteSemaine }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap gap-1">
      {c.shadowban === "shadowban" && <Badge variant="error">{t("autoOnglets.decisions.liste.signaux.shadowban")}</Badge>}
      {c.shadowban === "vues_basses" && <Badge variant="warning">{t("autoOnglets.decisions.liste.signaux.mort")}</Badge>}
      {c.liens_introuvables > 0 && (
        <Badge variant="warning">{t("autoOnglets.decisions.liste.signaux.liens", { n: c.liens_introuvables })}</Badge>
      )}
      {c.autres_comptes > 0 && <Badge variant="secondary">{t("autoOnglets.decisions.liste.signaux.double")}</Badge>}
      {c.canal === null && <Badge variant="error">{t("autoOnglets.decisions.liste.signaux.sansCanal")}</Badge>}
    </span>
  );
}

/** Un groupe de boutons à choix unique (Nudge / Recreate / Nothing ; Kill / Double / Keep). */
export function Choix<T extends string>({
  valeur,
  options,
  libelle,
  desactives = [],
  lecture,
  onChange,
}: {
  valeur: T;
  options: readonly T[];
  libelle: (o: T) => string;
  desactives?: readonly T[];
  lecture: boolean;
  onChange: (o: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-xs" role="group">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={valeur === o}
          disabled={lecture || desactives.includes(o)}
          className={cn(
            "rounded px-2 py-0.5 disabled:opacity-40",
            valeur === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
          onClick={() => onChange(o)}
        >
          {libelle(o)}
        </button>
      ))}
    </div>
  );
}
