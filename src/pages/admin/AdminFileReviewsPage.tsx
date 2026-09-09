import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Send, Settings2, SkipForward, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApplication } from "@/features/moteur/ApplicationContext";
import {
  ameliorerReview,
  aujourdhuiParis,
  creerReviewRemarque,
  envoyerReview,
  listerFileReviewsJour,
  listerReviewRemarques,
  listerSlides,
  majReviewRemarque,
  passerPostReview,
  supprimerReviewRemarque,
  type PostFileReview,
  type ReviewRemarque,
} from "@/features/moteur/api";
import { insererRemarqueDansBrouillon, jourParisDepuisIso } from "@/features/reviews/fileJour";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";
import { AvatarCompte } from "@/features/moteur/VignetteCompte";

function nomCreateur(post: PostFileReview): string {
  const perso = [post.poster_prenom, post.poster_nom].filter(Boolean).join(" ");
  return perso || post.persona_nom || (post.handle_tiktok ? `@${post.handle_tiktok}` : "—");
}

function labelCompte(post: PostFileReview): string {
  if (post.handle_tiktok) return `@${post.handle_tiktok.replace(/^@/, "")}`;
  return post.persona_nom || nomCreateur(post);
}

function ReglagesRemarques({
  ouvert,
  onFermer,
}: {
  ouvert: boolean;
  onFermer: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const remarques = useQuery({
    queryKey: ["review-remarques"],
    queryFn: listerReviewRemarques,
    enabled: ouvert,
  });
  const [titre, setTitre] = React.useState("");
  const [corps, setCorps] = React.useState("");

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["review-remarques"] });

  const creer = useMutation({
    mutationFn: () => creerReviewRemarque({ titre, corps }),
    onSuccess: () => {
      setTitre("");
      setCorps("");
      rafraichir();
    },
  });

  const supprimer = useMutation({
    mutationFn: supprimerReviewRemarque,
    onSuccess: rafraichir,
  });

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t("fileReviews.reglagesTitre")}</DialogTitle>
          <DialogDescription>{t("fileReviews.reglagesSous")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <ul className="space-y-3">
            {(remarques.data ?? []).map((r) => (
              <LigneRemarque
                key={r.id}
                remarque={r}
                onSauver={(patch) => majReviewRemarque(r.id, patch).then(rafraichir)}
                onSupprimer={() => supprimer.mutate(r.id)}
              />
            ))}
          </ul>
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">{t("fileReviews.nouvelle")}</p>
            <Input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder={t("fileReviews.titrePlaceholder")}
            />
            <Textarea
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              placeholder={t("fileReviews.corpsPlaceholder")}
              rows={3}
            />
            <Button
              size="sm"
              disabled={creer.isPending || !titre.trim() || !corps.trim()}
              onClick={() => creer.mutate()}
            >
              {t("fileReviews.ajouter")}
            </Button>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function LigneRemarque({
  remarque,
  onSauver,
  onSupprimer,
}: {
  remarque: ReviewRemarque;
  onSauver: (patch: { titre: string; corps: string }) => Promise<void>;
  onSupprimer: () => void;
}) {
  const { t } = useTranslation();
  const [titre, setTitre] = React.useState(remarque.titre);
  const [corps, setCorps] = React.useState(remarque.corps);
  const sale = titre !== remarque.titre || corps !== remarque.corps;

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <Input value={titre} onChange={(e) => setTitre(e.target.value)} />
      <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={3} />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!sale || !titre.trim() || !corps.trim()}
          onClick={() => onSauver({ titre: titre.trim(), corps: corps.trim() })}
        >
          {t("common.save")}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={t("common.delete")} onClick={onSupprimer}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

export function AdminFileReviewsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { applicationId } = useApplication();
  const [texte, setTexte] = React.useState("");
  const [reglages, setReglages] = React.useState(false);
  const jour = aujourdhuiParis();

  const file = useQuery({
    queryKey: ["file-reviews", jour, applicationId],
    queryFn: () => listerFileReviewsJour({ jour, applicationId }),
  });
  const remarques = useQuery({
    queryKey: ["review-remarques"],
    queryFn: listerReviewRemarques,
  });

  const courant = (file.data ?? [])[0] ?? null;

  const slides = useQuery({
    queryKey: ["slides", courant?.id],
    queryFn: () => listerSlides(courant!.id),
    enabled: Boolean(courant?.id),
  });
  const imagesCreateur = (slides.data ?? [])
    .map((s) => s.media_library?.url)
    .filter((u): u is string => Boolean(u));

  React.useEffect(() => {
    setTexte("");
  }, [courant?.id]);

  const retirer = (postId: string) => {
    queryClient.setQueryData<PostFileReview[]>(
      ["file-reviews", jour, applicationId],
      (prev) => (prev ?? []).filter((p) => p.id !== postId),
    );
  };

  const envoyer = useMutation({
    mutationFn: async () => {
      if (!courant) throw new Error("empty");
      const { texte: anglais } = await ameliorerReview(texte);
      await envoyerReview(courant.poster_id, anglais, {
        post_id: courant.id,
        publie_url: courant.publie_url,
        source_url: courant.source_url,
        handle_tiktok: courant.handle_tiktok,
        compte_label: labelCompte(courant),
        date_publication: jourParisOuPrevue(courant),
      });
      return courant.id;
    },
    onSuccess: (id) => {
      setTexte("");
      retirer(id);
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });

  const ameliorer = useMutation({
    mutationFn: () => ameliorerReview(texte),
    onSuccess: (r) => setTexte(r.texte),
  });

  const passer = useMutation({
    mutationFn: () => passerPostReview(courant!.id),
    onSuccess: () => {
      if (courant) retirer(courant.id);
    },
  });

  const labelJour = new Date(`${jour}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const restants = file.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{t("fileReviews.title")}</CardTitle>
            <CardDescription>
              {t("fileReviews.subtitle", { date: labelJour })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t("fileReviews.restants", { count: restants })}</Badge>
            <Button variant="outline" size="sm" onClick={() => setReglages(true)}>
              <Settings2 className="size-4" />
              {t("fileReviews.reglages")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <ReglagesRemarques ouvert={reglages} onFermer={() => setReglages(false)} />

      {file.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {file.isError && (
        <p className="text-sm text-destructive">{(file.error as Error).message}</p>
      )}
      {!file.isPending && !courant && (
        <EmptyState title={t("fileReviews.vide")} description={t("fileReviews.videAide")} />
      )}

      {courant && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <AvatarCompte url={courant.avatar_url} />
            <div className="min-w-0">
              <p className="text-sm font-medium">{nomCreateur(courant)}</p>
              <p className="text-xs text-muted-foreground">
                {labelCompte(courant)}
                {courant.publie_at
                  ? ` · ${new Date(courant.publie_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TikTokEmbed
              url={courant.source_url}
              titre={t("fileReviews.original")}
              videLabel={t("fileReviews.sansOriginal")}
              chargementLabel={t("fileReviews.apercuChargement")}
            />
            <TikTokEmbed
              url={courant.publie_url}
              titre={t("fileReviews.poste")}
              videLabel={t("fileReviews.sansLien")}
              chargementLabel={t("fileReviews.apercuChargement")}
              repliImages={imagesCreateur}
            />
          </div>

          {(remarques.data ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("fileReviews.remarques")}</p>
              <div className="flex flex-wrap gap-2">
                {(remarques.data ?? []).map((r) => (
                  <Button
                    key={r.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setTexte((prev) => insererRemarqueDansBrouillon(prev, r.corps))}
                  >
                    {r.titre}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t("fileReviews.placeholder")}
            rows={5}
          />
          {(envoyer.isError || ameliorer.isError || passer.isError) && (
            <p className="text-sm text-destructive">
              {(envoyer.error as Error | undefined)?.message ||
                (ameliorer.error as Error | undefined)?.message ||
                (passer.error as Error | undefined)?.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={ameliorer.isPending || !texte.trim()}
              onClick={() => ameliorer.mutate()}
            >
              <Sparkles className="size-4" />
              {ameliorer.isPending ? t("fileReviews.amelioration") : t("fileReviews.ameliorer")}
            </Button>
            <Button
              variant="secondary"
              disabled={passer.isPending || envoyer.isPending}
              onClick={() => passer.mutate()}
            >
              <SkipForward className="size-4" />
              {t("fileReviews.passer")}
            </Button>
            <Button
              disabled={envoyer.isPending || !texte.trim() || !courant.poster_id}
              onClick={() => envoyer.mutate()}
            >
              <Send className="size-4" />
              {envoyer.isPending ? t("fileReviews.envoi") : t("fileReviews.envoyer")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function jourParisOuPrevue(post: PostFileReview): string | null {
  return jourParisDepuisIso(post.publie_at) ?? post.date_publication_prevue;
}
