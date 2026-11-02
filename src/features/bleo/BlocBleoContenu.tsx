import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitBranch } from "lucide-react";

import { drapeauLangue, nomLangue } from "@/features/moteur/langues";

import { lireFamille, listerInfosBleoContenus, listerValeursFamille, type ValeurLangue } from "./api";
import { formaterNombre, formaterValeur, formaterVues } from "./format";
import { BadgeEtat, BadgeVerdict, EtatRequete, Generation } from "./ui";

/**
 * Fiche d'un slideshow : ce que BLEO, qui assigne les posts depuis le 1/11,
 * sait de ce contenu. Sa famille (lien), son verdict, son état, sa génération,
 * sa meilleure valeur et sa valeur langue par langue (`bleo_valeurs`, lisible
 * par un admin), ses vues et son r moyen. Rien n'écrit.
 */
export function BlocBleoContenu({ contenuId }: { contenuId: string }) {
  const { t, i18n } = useTranslation();
  const infos = useQuery({
    queryKey: ["bleo", "contenu", contenuId],
    queryFn: async () => (await listerInfosBleoContenus([contenuId]))[0] ?? null,
    staleTime: 60_000,
  });
  const b = infos.data;
  const famille = useQuery({
    queryKey: ["bleo", "famille", b?.famille_id ?? ""],
    queryFn: () => lireFamille(b?.famille_id ?? ""),
    enabled: Boolean(b?.famille_id),
    staleTime: 60_000,
  });
  // Même clé que la carte « Valeur par langue » de la fiche famille, pour un seul contenu.
  const valeurs = useQuery({
    queryKey: ["bleo", "valeurs", contenuId],
    queryFn: () => listerValeursFamille([contenuId]),
    enabled: Boolean(b),
    staleTime: 60_000,
    retry: false,
  });
  const parLangue = [...(valeurs.data ?? [])].sort((x, y) => y.valeur - x.valeur);

  const detail = (v: ValeurLangue) =>
    t("bleo.famille.valeurDetail", {
      forme: formaterNombre(v.forme, 2),
      post: v.n_post,
      acc: v.n_accroche,
      age: formaterNombre(v.facteur_age, 2),
      valeur: formaterNombre(v.valeur, 2),
    });

  return (
    <section className="space-y-2 rounded border p-3" data-testid="bloc-bleo">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("slideshows.bleo.titre")}</h3>
      <EtatRequete erreur={infos.error} chargement={infos.isLoading} />
      {b === null && <p className="text-xs text-muted-foreground">{t("slideshows.bleo.hors")}</p>}
      {b && (
        <>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">{t("slideshows.bleo.famille")}</dt>
            <dd className="min-w-0">
              <Link
                to={`/admin/bleo/familles/${b.famille_id}`}
                className="inline-flex max-w-full items-center gap-1 underline-offset-2 hover:underline"
              >
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  {famille.data?.accroche ?? famille.data?.racine_titre ?? t("slideshows.bleo.voirFamille")}
                </span>
              </Link>
            </dd>
            <dt className="text-muted-foreground">{t("slideshows.bleo.verdict")}</dt>
            <dd>
              <BadgeVerdict verdict={b.verdict} />
            </dd>
            <dt className="text-muted-foreground">{t("slideshows.bleo.etat")}</dt>
            <dd>
              <BadgeEtat etat={b.etat_bleo} />
            </dd>
            <dt className="text-muted-foreground">{t("slideshows.bleo.generation")}</dt>
            <dd>
              <Generation g={b.generation} />
              {b.type_bleo && (
                <span className="ml-1.5 text-muted-foreground">
                  · {t(`bleo.types.${b.type_bleo}`, { defaultValue: b.type_bleo })}
                </span>
              )}
            </dd>
            <dt className="cursor-help text-muted-foreground" title={t("slideshows.bleo.valeurMaxAide")}>
              {t("slideshows.bleo.valeurMax")}
            </dt>
            <dd className="font-semibold tabular-nums">{formaterValeur(b.valeur_max, i18n.language)}</dd>
            <dt className="text-muted-foreground">{t("slideshows.bleo.vuesMoyennes")}</dt>
            <dd className="tabular-nums">
              {formaterVues(b.vues_moyenne, i18n.language)}
              <span className="ml-1.5 text-muted-foreground">
                {t("slideshows.bleo.vuesMaxCourt", { v: formaterVues(b.vues_max, i18n.language) })}
              </span>
            </dd>
            <dt className="cursor-help text-muted-foreground" title={t("bleo.colonnes.rMoyenAide")}>
              {t("slideshows.bleo.rMoyen")}
            </dt>
            <dd className="tabular-nums">{formaterValeur(b.r_moyen, i18n.language)}</dd>
            <dt className="text-muted-foreground">{t("slideshows.bleo.passages")}</dt>
            <dd className="tabular-nums">{b.n_passages}</dd>
          </dl>

          {/* La valeur langue par langue ; illisible, on s'en tient à la valeur max. */}
          {valeurs.isSuccess && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">{t("slideshows.bleo.parLangue")}</p>
              {parLangue.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("slideshows.bleo.aucuneValeur")}</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {parLangue.map((v) => (
                    <li
                      key={v.langue}
                      className="cursor-help rounded border px-1.5 py-0.5 text-xs tabular-nums"
                      title={`${nomLangue(v.langue)} — ${detail(v)}`}
                    >
                      <span className="mr-1">{drapeauLangue(v.langue)}</span>
                      <span className="mr-1 text-muted-foreground">{v.langue}</span>
                      <span className="font-medium">{formaterValeur(v.valeur, i18n.language)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
