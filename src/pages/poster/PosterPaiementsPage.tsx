import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarCheck, ExternalLink, IdCard, MessageCircle, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lireCohorteAccueil } from "@/features/moteur/api";
import { lireMesPaiementsRuul, type MaPaieRuul } from "@/features/ruul/api";
import { useRegles } from "@/features/regles/api";
import { finPremiereSemaineRuul, formaterJour, partiesParis, premierPaiementRuul } from "@/features/onboarding/datesRuul";

/** Espace freelancer Ruul (connexion, compte bancaire, paiements reçus). */
const LIEN_RUUL = "https://app.ruul.io";

/**
 * Cohorte Ruul (posters venus du site) : comment et quand ils sont payés, en
 * une page. Les autres posters (payés par leur HM, sur Upwork) n'y ont pas
 * accès : la page renvoie au calendrier.
 */
export function PosterPaiementsPage() {
  const { t, i18n } = useTranslation();
  const cohorte = useQuery({ queryKey: ["accueil-cohorte"], queryFn: lireCohorteAccueil, staleTime: Infinity });
  // Prompt 21, C8 : le seul lien Slack, le réglage slack_lien_invitation.
  const { slack } = useRegles();

  if (cohorte.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!cohorte.data?.cohorteRuul) return <Navigate to="/calendrier" replace />;

  const { emailRuul, identite, debutLe } = cohorte.data;
  const paiement = debutLe ? premierPaiementRuul(debutLe) : null;
  const premierPasse = paiement ? partiesParis(new Date()).date > paiement : false;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-semibold text-xl tracking-tight">
          <Wallet className="size-5 text-primary" />
          {t("paiementsRuul.titre")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("paiementsRuul.intro")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="size-4 text-primary" />
            {t("paiementsRuul.quandTitre")}
          </CardTitle>
          <CardDescription>{t("paiementsRuul.quand")}</CardDescription>
        </CardHeader>
        {paiement && debutLe && !premierPasse && (
          <CardContent>
            <p className="rounded-md bg-success/10 p-3 font-medium text-sm">
              {t("paiementsRuul.premier", {
                paiement: formaterJour(paiement, i18n.language),
                lundi: formaterJour(debutLe, i18n.language),
                dimanche: formaterJour(finPremiereSemaineRuul(debutLe), i18n.language),
              })}
            </p>
          </CardContent>
        )}
      </Card>

      <MesPaiements />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("paiementsRuul.compteTitre")}</CardTitle>
          <CardDescription>{t("paiementsRuul.compteIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>
              {emailRuul
                ? t("paiementsRuul.etape1Email", { email: emailRuul })
                : t("paiementsRuul.etape1")}
            </li>
            <li>{t("paiementsRuul.etape2")}</li>
            <li>{t("paiementsRuul.etape3")}</li>
          </ol>
          <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
            <span className="font-semibold">{t("paiementsRuul.memeEmailTitre")}</span>{" "}
            {t("paiementsRuul.memeEmail")}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* 13/11 (Max) : jamais « crée ton compte sur ruul.io » : le compte se crée depuis l'email d'invitation. */}
            <Button asChild variant="outline">
              <a href={LIEN_RUUL} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t("paiementsRuul.ouvrirRuul")}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {identite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IdCard className="size-4 text-primary" />
              {t("paiementsRuul.nomTitre")}
            </CardTitle>
            <CardDescription>{t("paiementsRuul.nom", { prenom: identite.prenom, nom: identite.nom })}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="size-4 text-primary" />
            {t("paiementsRuul.questionsTitre")}
          </CardTitle>
          <CardDescription>{t("paiementsRuul.questions")}</CardDescription>
        </CardHeader>
        {slack && (
          <CardContent>
            <Button asChild variant="outline">
              <a href={slack} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t("paiementsRuul.rejoindreSlack")}
              </a>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

const COULEUR_STATUT: Record<MaPaieRuul["statut"], string> = {
  paid: "text-success",
  processing: "text-primary",
  scheduled: "text-muted-foreground",
  waiting_setup: "text-warning",
  problem: "text-destructive",
  none: "text-muted-foreground",
};

function ajouterJoursIso(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** « Monday, November 23 » dans la langue du posteur. */
function formaterJourLong(jour: string, langue: string): string {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString(langue || "en", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** 0738 : chaque semaine comptée, son montant, son détail et où en est le paiement. */
export function MesPaiements() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["ruul-mes-paiements"], queryFn: lireMesPaiementsRuul });
  const lignes = q.data ?? [];
  return (
    <Card data-testid="mes-paiements-ruul">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4 text-primary" />
          {t("paiementsRuul.mesTitre")}
        </CardTitle>
        {!q.isPending && lignes.length === 0 ? <CardDescription>{t("paiementsRuul.mesVide")}</CardDescription> : null}
      </CardHeader>
      {lignes.length > 0 && (
        <CardContent>
          <ul className="divide-y text-sm">
            {lignes.map((l) => (
              <li key={l.semaine} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{t("paiementsRuul.semaine", { date: formaterJour(l.semaine, i18n.language) })}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("paiementsRuul.detail", { faits: l.faits ?? 0, prevus: l.prevus ?? 0, comptes: l.nb_comptes ?? 0 })}
                    {Number(l.bonus) > 0 ? ` ${t("paiementsRuul.detailBonus", { bonus: Number(l.bonus) })}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">{Number(l.total).toFixed(2)} $</div>
                  <div className={`text-xs ${COULEUR_STATUT[l.statut]}`}>{t(`paiementsRuul.statut_${l.statut}`)}</div>
                  {/* 21/11 (Max) : le lot part le lundi ; la validation bancaire de Ruul prend 1 à 2 jours ouvrés. */}
                  {l.statut === "processing" && (
                    <div className="text-xs text-muted-foreground" data-testid="paie-ruul-attendue">
                      {t("paiementsRuul.envoyeAttendu", {
                        lundi: formaterJourLong(ajouterJoursIso(l.semaine, 7), i18n.language),
                        mercredi: formaterJourLong(ajouterJoursIso(l.semaine, 9), i18n.language),
                      })}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
