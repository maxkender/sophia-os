import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bot, CheckCheck, Clock, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { envoyerReview, listerPosters, listerReviews, type Review } from "@/features/moteur/api";
import type { PosterProfil } from "@/features/moteur/types";

/** Un créateur + son composeur de review + le statut de la dernière envoyée. */
function LigneReview({
  poster,
  derniere,
  onEnvoyee,
}: {
  poster: PosterProfil;
  derniere: Review | undefined;
  onEnvoyee: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [texte, setTexte] = React.useState("");

  const envoyer = useMutation({
    mutationFn: () => envoyerReview(poster.id, texte),
    onSuccess: () => {
      setTexte("");
      onEnvoyee();
    },
  });

  const nom = [poster.prenom, poster.nom].filter(Boolean).join(" ") || poster.email;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{nom}</span>
        {derniere ? (
          derniere.seen_at ? (
            <Badge variant="success" className="gap-1">
              <CheckCheck className="size-3" />
              {t("reviews.vue")}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <Clock className="size-3" />
              {t("reviews.envoyeeNonVue")}
            </Badge>
          )
        ) : (
          <Badge variant="outline">{t("reviews.jamais")}</Badge>
        )}
      </div>

      {derniere && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium">{t("reviews.derniere")} : </span>
          {derniere.origine === "agent" && (
            <Badge variant="info" className="mr-1 gap-1 align-middle">
              <Bot className="size-3" />
              {t("reviews.agent")}
            </Badge>
          )}
          {derniere.body}
          <span className="ml-1 opacity-70">
            · {new Date(derniere.created_at).toLocaleDateString(i18n.language)}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={2}
          placeholder={t("reviews.placeholder")}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          className="shrink-0 self-end"
          disabled={envoyer.isPending || !texte.trim()}
          onClick={() => envoyer.mutate()}
        >
          <Send className="size-4" />
          {envoyer.isPending ? t("common.saving") : t("reviews.envoyer")}
        </Button>
      </div>
    </div>
  );
}

export function AdminReviewsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: listerReviews });

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["reviews"] });

  // Dernière review par poster (les reviews arrivent triées desc).
  const derniereParPoster = React.useMemo(() => {
    const carte = new Map<string, Review>();
    for (const r of reviews.data ?? []) {
      if (!carte.has(r.poster_id)) carte.set(r.poster_id, r);
    }
    return carte;
  }, [reviews.data]);

  const createurs = (posters.data ?? []).filter((p) => p.role === "poster");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("reviews.title")}</CardTitle>
          <CardDescription>{t("reviews.subtitle")}</CardDescription>
        </CardHeader>
      </Card>

      {posters.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {!posters.isPending && createurs.length === 0 && <EmptyState title={t("posters.empty")} />}

      <div className="space-y-3">
        {createurs.map((poster) => (
          <LigneReview
            key={poster.id}
            poster={poster}
            derniere={derniereParPoster.get(poster.id)}
            onEnvoyee={rafraichir}
          />
        ))}
      </div>
    </div>
  );
}
