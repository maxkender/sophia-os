import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link2, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarreChargement } from "@/components/ui/progress";
import { useAuth } from "@/features/auth/AuthContext";
import { localeDate } from "@/locales/localeDate";

import {
  lireEtatSlack,
  lireMembresLibres,
  lirePosteursARelier,
  relierSlack,
  synchroniserSlackPosteurs,
  type MembreLibre,
  type PosteurARelier,
  type ResultatSynchroSlack,
} from "./api";
import { filtrerMembres, libelleMembre, suggestions } from "./logique";

const ID_SLACK = /^[UW][A-Z0-9]{6,}$/;

function Resultat({ r, simulation }: { r: ResultatSynchroSlack; simulation: boolean }) {
  const { t } = useTranslation();
  return (
    <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="resultat-synchro">
      {t(simulation ? "slackRelier.resultatSimulation" : "slackRelier.resultat", {
        email: r.par_email,
        nom: r.par_nom,
        deja: r.deja_relies,
        ambigus: r.ambigus,
        restants: r.restants,
        membres: r.membres,
      })}
    </p>
  );
}

function LignePosteur({
  p,
  membres,
  admin,
  relier,
  enCours,
}: {
  p: PosteurARelier;
  membres: MembreLibre[];
  admin: boolean;
  relier: (slackUserId: string) => void;
  enCours: boolean;
}) {
  const { t } = useTranslation();
  const [recherche, setRecherche] = React.useState("");
  const proches = React.useMemo(() => suggestions(membres, p.nom), [membres, p.nom]);
  const trouves = React.useMemo(() => filtrerMembres(membres, recherche), [membres, recherche]);
  const id = recherche.trim().toUpperCase();

  return (
    <li className="space-y-2 p-3" data-posteur={p.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{p.nom ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          {admin && p.hm_prenom && `${t("slackRelier.hm", { hm: p.hm_prenom })} · `}
          {admin && (p.email_perso || p.email)}
        </p>
      </div>
      {proches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{t("slackRelier.peutEtre")}</span>
          {proches.map((m) => (
            <Button key={m.slack_user_id} size="sm" variant="outline" disabled={enCours} onClick={() => relier(m.slack_user_id)}>
              <Link2 className="size-3.5" />
              {libelleMembre(m)}
            </Button>
          ))}
        </div>
      )}
      <Input
        type="search"
        size="sm"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={t("slackRelier.chercher")}
        aria-label={t("slackRelier.chercher")}
      />
      {(trouves.length > 0 || ID_SLACK.test(id)) && (
        <ul className="flex flex-wrap gap-1.5">
          {trouves.map((m) => (
            <li key={m.slack_user_id}>
              <Button size="sm" variant="secondary" disabled={enCours} onClick={() => relier(m.slack_user_id)}>
                {libelleMembre(m)}
                {m.email && <span className="text-muted-foreground">· {m.email}</span>}
              </Button>
            </li>
          ))}
          {ID_SLACK.test(id) && !trouves.some((m) => m.slack_user_id === id) && (
            <li>
              <Button size="sm" variant="secondary" disabled={enCours} onClick={() => relier(id)}>
                {t("slackRelier.relierId", { id })}
              </Button>
            </li>
          )}
        </ul>
      )}
      {recherche.trim() && trouves.length === 0 && !ID_SLACK.test(id) && (
        <p className="text-xs text-muted-foreground">{t("slackRelier.aucun")}</p>
      )}
    </li>
  );
}

/**
 * « Slack à relier » (0381) : les posteurs actifs dont on ne connaît pas
 * encore le compte Slack. L'admin et le Head of Ops les voient tous et
 * peuvent relancer la synchro ; une HM voit les siens et les relie à la main.
 */
export function SlackARelier() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin" || role === "head_of_ops";
  const qc = useQueryClient();
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [dernier, setDernier] = React.useState<{ r: ResultatSynchroSlack; simulation: boolean } | null>(null);

  const etat = useQuery({ queryKey: ["slack-relier", "etat"], queryFn: lireEtatSlack });
  const posteurs = useQuery({ queryKey: ["slack-relier", "posteurs"], queryFn: lirePosteursARelier });
  const membres = useQuery({ queryKey: ["slack-relier", "membres"], queryFn: lireMembresLibres });
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["slack-relier"] });

  const lien = useMutation({
    mutationFn: ({ id, slack }: { id: string; slack: string }) => relierSlack(id, slack),
    onMutate: () => setErreur(null),
    onSuccess: rafraichir,
    onError: (e: Error) => setErreur(e.message),
  });
  const synchro = useMutation({
    mutationFn: (simuler: boolean) => synchroniserSlackPosteurs(simuler),
    onMutate: () => setErreur(null),
    onSuccess: (r, simuler) => {
      setDernier({ r, simulation: simuler });
      void rafraichir();
    },
    onError: (e: Error) => setErreur(e.message),
  });

  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
  const derniere = etat.data?.derniere_synchro;
  const lignes = posteurs.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("slackRelier.titre")}
        description={t("slackRelier.description")}
        actions={
          admin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={synchro.isPending} onClick={() => synchro.mutate(true)}>
                {t("slackRelier.simuler")}
              </Button>
              <Button disabled={synchro.isPending} onClick={() => synchro.mutate(false)}>
                <RefreshCw className={synchro.isPending ? "size-4 animate-spin" : "size-4"} />
                {t("slackRelier.synchroniser")}
              </Button>
            </div>
          )
        }
      />
      {etat.data && (
        <div className="flex flex-wrap gap-1.5 text-xs tabular-nums">
          <Badge variant="success">{t("slackRelier.relies", { count: etat.data.relies })}</Badge>
          <Badge variant={etat.data.a_relier > 0 ? "warning" : "secondary"}>
            {t("slackRelier.aRelier", { count: etat.data.a_relier })}
          </Badge>
          {derniere && (
            <span className="text-muted-foreground">
              {t("slackRelier.derniere", { date: fmt.format(new Date(derniere.at)), n: derniere.resultat.poses })}
            </span>
          )}
        </div>
      )}
      {dernier && <Resultat r={dernier.r} simulation={dernier.simulation} />}
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Card>
        <CardContent className="p-0">
          {(posteurs.isLoading || membres.isLoading) && <BarreChargement actif />}
          {posteurs.error && <p className="p-3 text-sm text-destructive">{(posteurs.error as Error).message}</p>}
          {posteurs.data && lignes.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">{t("slackRelier.vide")}</p>
          )}
          {lignes.length > 0 && (
            <ul className="divide-y">
              {lignes.map((p) => (
                <LignePosteur
                  key={p.id}
                  p={p}
                  membres={membres.data ?? []}
                  admin={admin}
                  enCours={lien.isPending}
                  relier={(slack) => lien.mutate({ id: p.id, slack })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
