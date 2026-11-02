import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarreChargement } from "@/components/ui/progress";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { localeDate } from "@/locales/localeDate";

import { creerCompteDouble, lireMessagesPosteurs, type MessagePosteur, type StatutMessage } from "./api";

const VARIANTE: Record<StatutMessage, "success" | "warning" | "error" | "info" | "secondary"> = {
  programmee: "secondary",
  en_attente: "info",
  acceptee: "success",
  acceptee_compte_a_creer: "warning",
  refusee: "secondary",
  expiree: "secondary",
  retiree: "secondary",
  envoye: "info",
  lu: "success",
};

/**
 * Ce que l'OS a dit aux posteurs (v3) les deux dernières semaines : Kill et
 * offres Double (samedi, 0382), Recréer et Nudge (jeudi, 0383). L'admin voit tout et relance une création ratée ; une
 * HM voit ses posteurs, en lecture seule.
 */
export function SuiviMessages({ admin }: { admin: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const depuis = ajouterJours(aujourdhuiParis(), -14);
  const messages = useQuery({ queryKey: ["messages-posteurs", depuis], queryFn: () => lireMessagesPosteurs(depuis) });
  const creer = useMutation({
    mutationFn: (id: string) => creerCompteDouble(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["messages-posteurs"] }),
  });
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
  const lignes = messages.data ?? [];

  const detail = (m: MessagePosteur): string[] => {
    const d: string[] = [];
    if (m.type === "double" && m.expire_at && (m.statut === "en_attente" || m.statut === "programmee")) {
      d.push(t("messagesPosteurs.jusqua", { date: fmt.format(new Date(m.expire_at)) }));
    }
    if (m.repondu_at) d.push(t("messagesPosteurs.reponduLe", { date: fmt.format(new Date(m.repondu_at)) }));
    if (m.slack_statut) d.push(t(`messagesPosteurs.slack.${m.slack_statut}`));
    return d;
  };

  return (
    <Card data-testid="suivi-messages-posteurs">
      <CardHeader>
        <CardTitle>{t("messagesPosteurs.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(admin ? "messagesPosteurs.descriptionAdmin" : "messagesPosteurs.descriptionHm")}
        </p>
      </CardHeader>
      <CardContent>
        {messages.isLoading && <BarreChargement actif />}
        {messages.error && <p className="text-sm text-destructive">{(messages.error as Error).message}</p>}
        {messages.data && lignes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("messagesPosteurs.vide")}</p>
        )}
        {lignes.length > 0 && (
          <ul className="divide-y rounded-xl border">
            {lignes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm" data-message={m.id}>
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{m.poster_nom ?? "—"}</span>
                    <Badge variant={m.type === "kill" ? "error" : m.type === "double" ? "success" : "info"}>{t(`messagesPosteurs.types.${m.type}`)}</Badge>
                    <Badge variant={VARIANTE[m.statut]}>{t(`messagesPosteurs.statuts.${m.statut}`)}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[admin && m.hm_prenom ? t("messagesPosteurs.hm", { hm: m.hm_prenom }) : null, ...detail(m)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {m.erreur && <p className="text-xs text-destructive">{m.erreur}</p>}
                </div>
                {admin && m.statut === "acceptee_compte_a_creer" && m.proposition_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creer.isPending}
                    onClick={() => creer.mutate(m.proposition_id!)}
                  >
                    {t("messagesPosteurs.creerCompte")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {creer.error && <p className="mt-2 text-sm text-destructive">{(creer.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
