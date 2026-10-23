import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Film, MessageSquareQuote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { contesterReview, mesReviews, type Review } from "@/features/moteur/api";
import { RetourParcours } from "@/features/reviews/RetourParcours";
import { localeDate } from "@/locales/localeDate";

/**
 * « Mes retours » : tous les retours de l'admin au créateur, lus ou non. Un
 * retour se rouvre dans le même parcours qu'à sa réception (son post à côté de
 * l'original, puis le message et les vidéos) ; « Fermer », au bout, ne change
 * rien à son état « vu ».
 */
export function PosterRetoursPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const retours = useQuery({ queryKey: ["mes-reviews-toutes"], queryFn: mesReviews });
  const [ouvert, setOuvert] = React.useState<Review | null>(null);

  // Contesté depuis la relecture : la liste se recharge ; le parcours ouvert
  // garde son « merci » jusqu'à « Fermer ».
  const contester = async (id: string, mot: string) => {
    await contesterReview(id, mot);
    void queryClient.invalidateQueries({ queryKey: ["mes-reviews-toutes"] });
  };

  const dateDe = (r: Review) =>
    new Date(r.date_publication ? `${r.date_publication}T12:00:00` : r.created_at).toLocaleDateString(
      localeDate(i18n.language),
      { weekday: "short", day: "numeric", month: "long" },
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareQuote className="size-4 text-primary" />
            {t("mesRetours.titre")}
          </CardTitle>
          <CardDescription>{t("mesRetours.sousTitre")}</CardDescription>
        </CardHeader>
      </Card>

      {retours.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {retours.isError && <p className="text-sm text-destructive">{(retours.error as Error).message}</p>}
      {retours.data?.length === 0 && <EmptyState title={t("mesRetours.vide")} />}

      <ul className="space-y-3">
        {(retours.data ?? []).map((r) => (
          <li key={r.id}>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{dateDe(r)}</span>
                    {(r.compte_label || r.handle_tiktok) && (
                      <span>· {r.compte_label || `@${r.handle_tiktok?.replace(/^@/, "")}`}</span>
                    )}
                    {!r.seen_at && <Badge variant="info">{t("mesRetours.nouveau")}</Badge>}
                    {r.contestee_at && (
                      <Badge
                        variant={
                          r.contestation_verdict === "fondee"
                            ? "success"
                            : r.contestation_verdict === "non_fondee"
                              ? "secondary"
                              : "warning"
                        }
                      >
                        {r.contestation_verdict === "fondee"
                          ? t("mesRetours.contesteFondee")
                          : r.contestation_verdict === "non_fondee"
                            ? t("mesRetours.contesteNonFondee")
                            : t("mesRetours.conteste")}
                      </Badge>
                    )}
                    {r.videos.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Film className="size-3" />
                        {t("mesRetours.videos", { count: r.videos.length })}
                      </span>
                    )}
                  </p>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setOuvert(r)}>
                  {t("mesRetours.ouvrir")}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {ouvert && (
        <RetourParcours
          key={ouvert.id}
          retour={ouvert}
          mode="relecture"
          onCompris={() => setOuvert(null)}
          onContester={(mot) => contester(ouvert.id, mot)}
        />
      )}
    </div>
  );
}
