// Les langues d'un podz, en un seul bloc : ce qui est ouvert, servi, à préparer, hors liste, et le geste pour en ouvrir ou en fermer une.
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Replie } from "@/components/ui/replie";
import { canoniserLangue, drapeauLangue, LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { changerLanguePodz } from "./api";
import { resumeLangues, type EtatLangue, type FormatPodz, type LangueDuPodz } from "./identite";

const POINT: Record<EtatLangue, string> = {
  servie: "bg-success",
  a_preparer: "bg-info",
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

/** « ouverte par la soupape le 20/11 » : le dernier geste du journal sur cette langue. */
function useDernierGeste() {
  const { t, i18n } = useTranslation();
  return (langue: LangueDuPodz): string | null => {
    const dernier = langue.journal[langue.journal.length - 1];
    if (!dernier) return null;
    const jour = new Date(dernier.ouvert_le).toLocaleDateString(localeDate(i18n.language), { day: "numeric", month: "numeric" });
    return t(`pods.langues.geste.${dernier.action}`, { par: t(`pods.langues.par.${dernier.par}`), jour });
  };
}

function Tuile({
  langue,
  max,
  traduit,
  geste,
  occupe,
}: {
  langue: LangueDuPodz;
  max: number;
  traduit: boolean;
  /** Ouvre ou ferme cette langue ; absent : lecture seule. */
  geste?: (langue: LangueDuPodz, action: "ouvrir" | "fermer") => void;
  occupe: boolean;
}) {
  const { t } = useTranslation();
  const dernierGeste = useDernierGeste();
  const code = canoniserLangue(langue.langue);
  const dernier = dernierGeste(langue);
  const cleEtat =
    langue.etat === "hors_liste" && langue.comptes === 0
      ? "hors_liste_vide"
      : langue.etat === "a_preparer" && langue.comptes > 0
        ? "a_preparer_attend"
        : langue.etat;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5",
        langue.etat !== "servie" && "border-dashed",
        langue.etat === "hors_liste" && langue.comptes > 0 && "border-destructive/50",
        langue.etat === "a_preparer" && "border-info/50",
      )}
      data-etat={langue.etat}
      data-langue={code}
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
            {t(`pods.langues.etat.${cleEtat}`, { count: langue.comptes })}
            {langue.variantes.length > 0 &&
              ` · ${t("pods.langues.variantes", { liste: langue.variantes.map((v) => `${v.langue} (${v.comptes})`).join(", ") })}`}
          </span>
        </p>
      )}
      {dernier && <p className="text-[11px] leading-snug text-muted-foreground">{dernier}</p>}
      {geste && (
        <div className="mt-auto pt-1">
          {langue.etat === "hors_liste" ? (
            <Button size="xs" variant="outline" disabled={occupe} onClick={() => geste(langue, "ouvrir")}>
              {t("pods.langues.ouvrir")}
            </Button>
          ) : (
            <button
              type="button"
              disabled={occupe}
              onClick={() => geste(langue, "fermer")}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-60"
            >
              {t("pods.langues.fermer")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Le bloc langues d'un podz.
 * Texte + banque : l'OS traduit partout, on montre où sont les comptes (et l'empilement).
 * Images finies : chaque langue ouverte, servie ou non, ce qui est à préparer et ce qui est hors liste ;
 * avec `pod`, on peut ouvrir ou fermer une langue (le geste unique `podz_langue`, 0781).
 */
export function BlocLangues({
  format,
  langues,
  langueSource,
  pod,
}: {
  format: FormatPodz;
  langues: LangueDuPodz[];
  langueSource: string | null;
  /** Le slug du podz : donne les boutons « Ouvrir » et « Fermer ». Absent : lecture seule. */
  pod?: string;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const traduit = format !== "images_finies";
  const r = resumeLangues(langues);
  const [choix, setChoix] = React.useState("");
  const [fait, setFait] = React.useState<string | null>(null);

  const changer = useMutation({
    mutationFn: ({ langue, action }: { langue: string; action: "ouvrir" | "fermer" }) => changerLanguePodz(pod!, langue, action),
    onSuccess: (res, v) => {
      setChoix("");
      setFait(
        res.change
          ? t(v.action === "ouvrir" ? "pods.langues.faitOuvrir" : "pods.langues.faitFermer", { langue: nomLangue(canoniserLangue(res.langue)) })
          : t("pods.langues.faitRien"),
      );
      void qc.invalidateQueries({ queryKey: ["pods"] });
    },
  });

  const geste =
    pod && !traduit
      ? (langue: LangueDuPodz, action: "ouvrir" | "fermer") => {
          const nom = nomLangue(canoniserLangue(langue.langue));
          const message =
            action === "ouvrir"
              ? t("pods.langues.confirmOuvrir", { langue: nom })
              : langue.comptes > 0
                ? t("pods.langues.confirmFermerComptes", { langue: nom, count: langue.comptes })
                : t("pods.langues.confirmFermer", { langue: nom });
          if (window.confirm(message)) changer.mutate({ langue: langue.langue, action });
        }
      : undefined;

  // Les langues qu'on peut encore ouvrir : celles de l'OS qui ne sont pas dans la liste du podz.
  const dansListe = new Set(langues.filter((l) => l.etat !== "hors_liste").map((l) => canoniserLangue(l.langue)));
  const ouvrables = (LANGUES_CIBLES as readonly string[])
    .filter((l) => !dansListe.has(l))
    .sort((a, b) => nomLangue(a).localeCompare(nomLangue(b), i18n.language));
  const evenements = langues
    .flatMap((l) => l.journal.map((j) => ({ ...j, langue: l.langue })))
    .sort((a, b) => b.ouvert_le.localeCompare(a.ouvert_le));

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {langueSource && (
          <span className="text-foreground">
            {t("pods.langues.ecrit", {
              langue: `${drapeauLangue(canoniserLangue(langueSource))} ${nomLangue(canoniserLangue(langueSource))}`,
            })}{" "}
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
                {r.a_preparer > 0 && <Compteur etat="a_preparer" n={r.a_preparer} libelle={t("pods.langues.legende.a_preparer")} />}
                <Compteur etat="sans_compte" n={r.sans_compte} libelle={t("pods.langues.legende.sans_compte")} />
                {r.hors_liste > 0 && <Compteur etat="hors_liste" n={r.hors_liste} libelle={t("pods.langues.legende.hors_liste")} />}
              </>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {langues.map((l) => (
              <Tuile key={l.langue} langue={l} max={r.max} traduit={traduit} geste={geste} occupe={changer.isPending} />
            ))}
          </ul>
        </>
      )}

      {geste && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <label htmlFor="ouvrir-langue" className="text-sm font-medium">
            {t("pods.langues.ouvrirUne")}
          </label>
          <select
            id="ouvrir-langue"
            value={choix}
            onChange={(e) => setChoix(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">{t("pods.langues.choisir")}</option>
            {ouvrables.map((l) => (
              <option key={l} value={l}>
                {nomLangue(l)} ({l})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!choix || changer.isPending}
            onClick={() =>
              window.confirm(t("pods.langues.confirmOuvrir", { langue: nomLangue(choix) })) && changer.mutate({ langue: choix, action: "ouvrir" })
            }
          >
            <Plus aria-hidden />
            {t("pods.langues.ouvrir")}
          </Button>
          <p className="basis-full text-xs text-muted-foreground">{t("pods.langues.ouvrirAide")}</p>
          {fait && !changer.error && <p className="basis-full text-sm text-success-foreground">{fait}</p>}
          {changer.error && (
            <p role="alert" className="basis-full text-sm text-destructive">
              {(changer.error as Error).message}
            </p>
          )}
        </div>
      )}

      {!traduit && evenements.length > 0 && (
        <Replie titre={t("pods.langues.journal", { n: evenements.length })}>
          <ul className="space-y-1 text-sm">
            {evenements.map((e, i) => (
              <li key={`${e.langue}-${e.ouvert_le}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="w-28 shrink-0 tabular-nums text-xs text-muted-foreground">
                  {new Date(e.ouvert_le).toLocaleString(localeDate(i18n.language), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>
                  {drapeauLangue(canoniserLangue(e.langue))} {nomLangue(canoniserLangue(e.langue))}
                </span>
                <span className={cn("text-muted-foreground", e.action === "fermee" && "text-destructive")}>
                  {t(`pods.langues.journalLigne.${e.action}`, { par: t(`pods.langues.par.${e.par}`) })}
                </span>
              </li>
            ))}
          </ul>
        </Replie>
      )}
    </div>
  );
}
