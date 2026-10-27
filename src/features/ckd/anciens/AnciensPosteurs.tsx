import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { COULEUR } from "@/features/ckd/calendrier/couleurs";
import { ActionsPosteur } from "@/features/ckd/cohorte/ActionsPosteur";
import { DiagnosticCompte } from "@/features/ckd/DiagnosticCompte";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { nomsHms } from "@/features/paie/api";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import { lireAnciens, type LigneAncien } from "./api";
import { grouperAnciens, historique, type Probleme } from "./logique";

/** Les mêmes couleurs que les badges du diagnostic (shadowban rouge, vues basses bleu, posts orange). */
const VARIANTE: Record<Probleme, "error" | "info" | "warning" | "outline"> = {
  shadowban: "error",
  vues_basses: "info",
  irregulier: "warning",
  liens_manquants: "warning",
  baisse: "outline",
};

/** 14 petites cases, les couleurs du calendrier ; la date et l'état au survol. */
function MiniHistorique({ l, aujourdhui }: { l: LigneAncien; aujourdhui: string }) {
  const { t, i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <div aria-label={t("accueilHm.anciens.historique")} className="flex gap-0.5" data-testid="mini-historique">
      {historique(l, aujourdhui).map((c) => (
        <span
          key={c.jour}
          data-etat={c.etat}
          title={`${fmt.format(new Date(`${c.jour}T12:00:00Z`))} : ${t(`accueilHm.calendrier.etats.${c.etat}`, {
            publies: c.publies,
            prevus: c.prevus,
          })}`}
          className={cn(
            "size-4 shrink-0 rounded-[3px] border sm:size-5",
            COULEUR[c.etat],
            c.etat === "vide" && "border-border/60",
            c.aujourdhui && "ring-1 ring-primary/70",
          )}
        />
      ))}
    </div>
  );
}

/**
 * « Anciens posteurs » (0372) : les posteurs qui ont fini leur première
 * semaine. Par défaut, seulement ceux qui ont un problème, rangés sous le plus
 * grave ; chacun avec ses 14 derniers jours, le diagnostic en 3 lignes et ce
 * qu'il faut faire. « Tout afficher » ajoute les autres. `hm` : la HM choisie
 * par l'admin ou le Head of Ops ("" = toutes).
 */
export function AnciensPosteurs({ hm = "" }: { hm?: string }) {
  const { t } = useTranslation();
  const aujourdhui = aujourdhuiParis();
  const [toutAfficher, setToutAfficher] = React.useState(false);

  const donnees = useQuery({
    queryKey: ["accueil-hm", "anciens"],
    queryFn: async () => {
      const lignes = await lireAnciens();
      return { lignes, noms: await nomsHms([...new Set(lignes.map((l) => l.poster_id))]) };
    },
  });
  const nom = (l: LigneAncien) => donnees.data?.noms.get(l.poster_id) ?? "—";
  const lignes = (donnees.data?.lignes ?? []).filter((l) => !hm || l.hm_id === hm);
  const groupes = grouperAnciens(lignes, aujourdhui, toutAfficher, nom);
  const aProbleme = grouperAnciens(lignes, aujourdhui, false).reduce((n, g) => n + g.lignes.length, 0);

  return (
    <Card data-testid="anciens-posteurs">
      <CardHeader>
        <CardTitle>{t("accueilHm.anciens.titre")}</CardTitle>
        <CardDescription>{t("accueilHm.anciens.desc")}</CardDescription>
        {lignes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs tabular-nums">
            <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground">
              {t("accueilHm.resume.posteurs", { count: lignes.length })}
            </span>
            {aProbleme > 0 && (
              <span className="rounded-full border border-warning/50 bg-warning/10 px-2.5 py-0.5 text-warning-foreground">
                {t("accueilHm.anciens.resume", { n: aProbleme })}
              </span>
            )}
            <button
              type="button"
              onClick={() => setToutAfficher((v) => !v)}
              aria-pressed={toutAfficher}
              className="ml-auto rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              {toutAfficher ? t("accueilHm.anciens.problemesSeulement") : t("accueilHm.anciens.toutAfficher")}
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {donnees.isLoading && <BarreChargement actif />}
        {donnees.error && <p className="text-sm text-destructive">{(donnees.error as Error).message}</p>}
        {donnees.data && groupes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("accueilHm.anciens.aucun")}</p>
        )}
        {groupes.map((g) => {
          const cle = g.probleme ?? "ok";
          return (
            <section key={cle} className="space-y-2" data-groupe={cle}>
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge variant={g.probleme ? VARIANTE[g.probleme] : "success"}>
                  {t(`accueilHm.anciens.problemes.${cle}`)} · {g.lignes.length}
                </Badge>
                <span className="text-xs text-muted-foreground">{t(`accueilHm.anciens.regles.${cle}`)}</span>
              </div>
              <ul className="divide-y rounded-xl border">
                {g.lignes.map(({ ligne: l, problemes }) => (
                  <li key={l.compte_id} className="space-y-2 p-3" data-compte={l.handle ?? l.compte_id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{nom(l)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {l.handle ? (
                            <a
                              href={`https://www.tiktok.com/@${l.handle}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:text-primary hover:underline"
                            >
                              @{l.handle}
                            </a>
                          ) : (
                            "—"
                          )}
                          {l.pays && ` · ${l.pays}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MiniHistorique l={l} aujourdhui={aujourdhui} />
                        <ActionsPosteur
                          posteurId={l.poster_id}
                          nom={nom(l)}
                          compteId={l.compte_id}
                          warmupLance={l.warmup_lance}
                          aPublie
                        />
                      </div>
                    </div>
                    {g.probleme && (
                      <div className="grid gap-2 md:grid-cols-2">
                        <DiagnosticCompte diagnostic={l.diagnostic} />
                        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                          <p className="font-medium">{t("accueilHm.anciens.actionTitre")}</p>
                          <p>{t(`accueilHm.anciens.actions.${g.probleme}`)}</p>
                          {problemes.length > 1 && (
                            <p className="flex flex-wrap items-center gap-1 pt-1 text-xs text-muted-foreground">
                              {t("accueilHm.anciens.aussi")}
                              {problemes.slice(1).map((p) => (
                                <Badge key={p} variant={VARIANTE[p]}>
                                  {t(`accueilHm.anciens.problemes.${p}`)}
                                </Badge>
                              ))}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
