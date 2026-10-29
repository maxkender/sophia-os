import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthContext";
import { drapeauLangue } from "@/features/moteur/langues";
import {
  ACTIONS_ENVOYEES,
  type ActionLien1000,
  compterActions,
  ecrireEnvoiAutoLien1000,
  envoyerLien1000,
  lireEnvoiAutoLien1000,
  listerLien1000,
  ORDRE_ACTIONS,
  trierLignes,
} from "@/features/moteur/lien1000";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

const CLE = ["lien-1000"] as const;

const VARIANTE: Record<ActionLien1000, "warning" | "info" | "success" | "outline" | "secondary" | "error"> = {
  message: "warning",
  relance: "warning",
  lien_en_place: "success",
  attente: "info",
  sans_suite: "error",
  fait: "success",
  pas_de_releve: "outline",
};

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/**
 * Surveillance → « Lien à 1 000 abonnés » : la liste que le contrôle du lundi
 * enverrait (calculée à blanc), l'interrupteur de l'envoi automatique, et
 * l'envoi immédiat une fois la liste validée.
 */
export function Lien1000Card() {
  const { t, i18n } = useTranslation();
  // L'envoi automatique (réglage lien_1000) : admin seulement (0411).
  const admin = useAuth().role === "admin";
  const queryClient = useQueryClient();
  const liste = useQuery({ queryKey: [...CLE, "liste"], queryFn: listerLien1000 });
  const envoiAuto = useQuery({ queryKey: [...CLE, "auto"], queryFn: lireEnvoiAutoLien1000 });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: CLE });

  const basculer = useMutation({ mutationFn: ecrireEnvoiAutoLien1000, onSettled: rafraichir });
  const envoyer = useMutation({ mutationFn: envoyerLien1000, onSettled: rafraichir });

  const lignes = React.useMemo(() => trierLignes(liste.data ?? []), [liste.data]);
  const compte = compterActions(lignes);
  const aEnvoyer = ACTIONS_ENVOYEES.reduce((n, a) => n + compte[a], 0);
  const date = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(localeDate(i18n.language), { day: "2-digit", month: "2-digit" }).format(new Date(iso)) : "";

  const lancerEnvoi = () => {
    if (window.confirm(t("lien1000.confirmerEnvoi", { n: aEnvoyer, faits: compte.lien_en_place }))) envoyer.mutate();
  };

  return (
    <Card data-testid="carte-lien-1000">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("lien1000.titre")}</CardTitle>
            <CardDescription>{t("lien1000.description")}</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span>{t("lien1000.envoiAuto")}</span>
            <Switch
              checked={envoiAuto.data === true}
              disabled={!admin || envoiAuto.isPending || basculer.isPending}
              onCheckedChange={(v) => basculer.mutate(v === true)}
              aria-label={t("lien1000.envoiAuto")}
            />
          </label>
        </div>
        {envoiAuto.data === false && <p className="text-xs text-warning-foreground">{t("lien1000.envoiEteint")}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {ORDRE_ACTIONS.filter((a) => compte[a] > 0).map((a) => (
            <Badge key={a} variant={VARIANTE[a]}>
              {t(`lien1000.actions.${a}`)} · {compte[a]}
            </Badge>
          ))}
          <Button
            className="ml-auto"
            size="sm"
            disabled={envoyer.isPending || aEnvoyer + compte.lien_en_place === 0}
            onClick={lancerEnvoi}
          >
            {envoyer.isPending ? t("lien1000.envoiEnCours") : t("lien1000.envoyer", { n: aEnvoyer })}
          </Button>
        </div>
        {envoyer.isSuccess && <p className="text-xs text-success">{t("lien1000.envoye")}</p>}
        {(liste.error || basculer.error || envoyer.error) && (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(liste.error ?? basculer.error ?? envoyer.error)}
          </p>
        )}
        {liste.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : lignes.length === 0 ? (
          <EmptyState title={t("lien1000.vide")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("lien1000.colonnes.compte")}</th>
                  <th className="py-1 pr-3 font-medium">{t("lien1000.colonnes.poster")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("lien1000.colonnes.abonnes")}</th>
                  <th className="py-1 pr-3 font-medium">{t("lien1000.colonnes.lien")}</th>
                  <th className="py-1 pr-3 font-medium">{t("lien1000.colonnes.actuel")}</th>
                  <th className="py-1 font-medium">{t("lien1000.colonnes.statut")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lignes.map((l) => (
                  <tr key={l.compte_id} data-testid={`lien-1000-${l.handle}`}>
                    <td className="py-1.5 pr-3">
                      <Link to={`/admin/createurs/${l.compte_id}`} className="underline-offset-2 hover:underline">
                        {drapeauLangue(l.langue)} @{l.handle}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{l.poster}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{l.abonnes?.toLocaleString() ?? "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{l.lien}</td>
                    <td className={cn("py-1.5 pr-3 font-mono text-xs", !l.bio_lien && "text-muted-foreground")}>
                      {l.bio_lien ?? t("lien1000.aucunLien")}
                    </td>
                    <td className="py-1.5">
                      <Badge variant={VARIANTE[l.action]}>{t(`lien1000.actions.${l.action}`)}</Badge>
                      {(l.message_at || l.relance_at) && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {l.relance_at
                            ? t("lien1000.relanceLe", { date: date(l.relance_at) })
                            : t("lien1000.messageLe", { date: date(l.message_at) })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
