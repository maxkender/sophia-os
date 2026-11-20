// Les langues d'un podz, en un seul bloc : ce qu'il livre, ce qui est servi par un compte, ce qui cloche.
import { useTranslation } from "react-i18next";

import { canoniserLangue, drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { resumeLangues, type EtatLangue, type FormatPodz, type LangueDuPodz } from "./identite";

const POINT: Record<EtatLangue, string> = {
  servie: "bg-success",
  sans_compte: "bg-warning",
  hors_liste: "bg-destructive",
};

function Compteur({ etat, n, libelle }: { etat: EtatLangue; n: number; libelle: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", POINT[etat])} aria-hidden />
      <span className="font-medium tabular-nums text-foreground">{n}</span>
      {libelle}
    </span>
  );
}

function Tuile({ langue, max, traduit }: { langue: LangueDuPodz; max: number; traduit: boolean }) {
  const { t, i18n } = useTranslation();
  const code = canoniserLangue(langue.langue);
  const jour = (iso: string) => new Date(iso).toLocaleDateString(localeDate(i18n.language), { day: "numeric", month: "numeric" });
  const soupape = langue.ouvertures.length
    ? t("pods.langues.soupape", { jours: [...new Set(langue.ouvertures.map(jour))].join(", ") })
    : null;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5",
        langue.etat !== "servie" && "border-dashed",
        langue.etat === "hors_liste" && "border-destructive/50",
      )}
      data-etat={langue.etat}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none" aria-hidden>
          {drapeauLangue(code)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nomLangue(code)}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-xl font-semibold leading-none tabular-nums", langue.comptes === 0 && "text-muted-foreground/60")}>
          {langue.comptes}
        </span>
        <span className="text-xs text-muted-foreground">{t("pods.langues.comptes", { count: langue.comptes })}</span>
      </div>
      {/* La part de la langue la plus remplie : l'empilement se voit d'un coup d'œil. */}
      <div className="h-1 rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-foreground/60" style={{ width: `${max ? (100 * langue.comptes) / max : 0}%` }} />
      </div>
      {!traduit && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", POINT[langue.etat])} aria-hidden />
          <span>
            {langue.etat === "hors_liste" && langue.comptes === 0
              ? t("pods.langues.etat.hors_liste_vide")
              : t(`pods.langues.etat.${langue.etat}`)}
            {langue.variantes.length > 0 &&
              ` · ${t("pods.langues.variantes", { liste: langue.variantes.map((v) => `${v.langue} (${v.comptes})`).join(", ") })}`}
          </span>
        </p>
      )}
      {soupape && <p className="text-[11px] leading-snug text-muted-foreground">{soupape}</p>}
    </li>
  );
}

/**
 * Le bloc langues d'un podz.
 * Texte + banque : l'OS traduit partout, on montre où sont les comptes (et l'empilement).
 * Images finies : chaque langue de la liste du podz, servie ou non, et ce qui est hors liste.
 */
export function BlocLangues({
  format,
  langues,
  langueSource,
}: {
  format: FormatPodz;
  langues: LangueDuPodz[];
  langueSource: string | null;
}) {
  const { t } = useTranslation();
  const traduit = format !== "images_finies";
  const r = resumeLangues(langues);
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {langueSource && (
          <span className="text-foreground">
            {t("pods.langues.ecrit", { langue: `${drapeauLangue(canoniserLangue(langueSource))} ${nomLangue(canoniserLangue(langueSource))}` })}{" "}
          </span>
        )}
        {t(traduit ? "pods.langues.regleTraduit" : "pods.langues.regleLivre")}
      </p>

      {langues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pods.langues.aucune")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {traduit ? (
              <span>{t("pods.langues.resumeTraduit", { langues: r.servie, comptes: r.comptes, max: r.max })}</span>
            ) : (
              <>
                <Compteur etat="servie" n={r.servie} libelle={t("pods.langues.legende.servie")} />
                <Compteur etat="sans_compte" n={r.sans_compte} libelle={t("pods.langues.legende.sans_compte")} />
                {r.hors_liste > 0 && <Compteur etat="hors_liste" n={r.hors_liste} libelle={t("pods.langues.legende.hors_liste")} />}
              </>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {langues.map((l) => (
              <Tuile key={l.langue} langue={l} max={r.max} traduit={traduit} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
