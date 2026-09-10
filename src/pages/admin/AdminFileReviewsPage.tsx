import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Film, Send, Settings2, SkipForward, Sparkles, Trash2, X } from "lucide-react";

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
  majReviewRemarque,
  passerPostReview,
  retirerVideoRemarque,
  supprimerReviewRemarque,
  uploaderVideoRemarque,
  type PostFileReview,
  type ReviewRemarque,
} from "@/features/moteur/api";
import { DropVideoRemarque } from "@/features/reviews/DropVideoRemarque";
import {
  ajouterVideoReview,
  insererRemarqueDansBrouillon,
  jourParisDepuisIso,
  retirerVideoReview,
  type ReviewVideo,
} from "@/features/reviews/fileJour";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";
import { controlerVideoRemarque, premierFichierVideo } from "@/features/reviews/videoRemarque";
import { cn } from "@/lib/utils";
import { AvatarCompte } from "@/features/moteur/VignetteCompte";

function nomCreateur(post: PostFileReview): string {
  const perso = [post.poster_prenom, post.poster_nom].filter(Boolean).join(" ");
  return perso || post.persona_nom || (post.handle_tiktok ? `@${post.handle_tiktok}` : "—");
}

function labelCompte(post: PostFileReview): string {
  if (post.handle_tiktok) return `@${post.handle_tiktok.replace(/^@/, "")}`;
  return post.persona_nom || nomCreateur(post);
}

async function accepterVideo(
  file: File,
  message: (cle: "type" | "taille" | "duree") => string,
): Promise<string | null> {
  const err = await controlerVideoRemarque(file);
  return err ? message(err) : null;
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
  const [videoNouvelle, setVideoNouvelle] = React.useState<File | null>(null);
  const [errVideoNouvelle, setErrVideoNouvelle] = React.useState<string | null>(null);
  const apercuNouvelle = React.useMemo(
    () => (videoNouvelle ? URL.createObjectURL(videoNouvelle) : null),
    [videoNouvelle],
  );
  React.useEffect(() => {
    return () => {
      if (apercuNouvelle) URL.revokeObjectURL(apercuNouvelle);
    };
  }, [apercuNouvelle]);

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["review-remarques"] });
  const msgVideo = (cle: "type" | "taille" | "duree") => t(`fileReviews.videoErr.${cle}`);

  const creer = useMutation({
    mutationFn: async (input: { titre: string; corps: string; video: File | null }) => {
      const r = await creerReviewRemarque({ titre: input.titre, corps: input.corps });
      if (input.video) await uploaderVideoRemarque(r.id, input.video);
    },
    onSuccess: () => {
      setTitre("");
      setCorps("");
      setVideoNouvelle(null);
      setErrVideoNouvelle(null);
      rafraichir();
    },
  });

  const supprimer = useMutation({
    mutationFn: supprimerReviewRemarque,
    onSuccess: rafraichir,
  });

  const videoLigne = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploaderVideoRemarque(id, file),
    onSuccess: rafraichir,
  });
  const retirerVideo = useMutation({
    mutationFn: retirerVideoRemarque,
    onSuccess: rafraichir,
  });

  const ajouter = () => {
    const nextTitre = titre.trim();
    const nextCorps = corps.trim();
    if (!nextTitre || !nextCorps || creer.isPending) return;
    creer.mutate({ titre: nextTitre, corps: nextCorps, video: videoNouvelle });
  };

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()} disablePointerDismissal>
      <DialogPopup className="max-w-lg" showCloseButton>
        <DialogHeader>
          <DialogTitle>{t("fileReviews.reglagesTitre")}</DialogTitle>
          <DialogDescription>{t("fileReviews.reglagesSous")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2 border-b px-6 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            ajouter();
          }}
        >
          <p className="text-xs font-medium text-muted-foreground">{t("fileReviews.nouvelle")}</p>
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder={t("fileReviews.titrePlaceholder")}
            className="h-8 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            placeholder={t("fileReviews.corpsPlaceholder")}
            rows={3}
            className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <DropVideoRemarque
            videoUrl={apercuNouvelle}
            disabled={creer.isPending}
            labelVide={t("fileReviews.videoVide")}
            labelRemplacer={t("fileReviews.videoRemplacer")}
            onFichier={(file) => {
              void accepterVideo(file, msgVideo).then((err) => {
                if (err) {
                  setErrVideoNouvelle(err);
                  return;
                }
                setErrVideoNouvelle(null);
                setVideoNouvelle(file);
              });
            }}
            onRetirer={videoNouvelle ? () => setVideoNouvelle(null) : undefined}
          />
          {errVideoNouvelle && <p className="text-sm text-destructive">{errVideoNouvelle}</p>}
          {videoNouvelle && !errVideoNouvelle && (
            <p className="text-xs text-muted-foreground">{videoNouvelle.name}</p>
          )}
          {(creer.isError || remarques.isError || videoLigne.isError || retirerVideo.isError) && (
            <p className="text-sm text-destructive">
              {(creer.error as Error | undefined)?.message ||
                (videoLigne.error as Error | undefined)?.message ||
                (retirerVideo.error as Error | undefined)?.message ||
                (remarques.error as Error | undefined)?.message}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={creer.isPending || !titre.trim() || !corps.trim()}
            onClick={ajouter}
          >
            {t("fileReviews.ajouter")}
          </Button>
        </form>
        <DialogPanel className="space-y-4" scrollFade={false}>
          <ul className="space-y-3">
            {(remarques.data ?? []).map((r) => (
              <LigneRemarque
                key={r.id}
                remarque={r}
                videoBusy={
                  (videoLigne.isPending && videoLigne.variables?.id === r.id) ||
                  (retirerVideo.isPending && retirerVideo.variables === r.id)
                }
                onSauver={(patch) => majReviewRemarque(r.id, patch).then(rafraichir)}
                onSupprimer={() => supprimer.mutate(r.id)}
                onVideo={(file) => videoLigne.mutate({ id: r.id, file })}
                onRetirerVideo={() => retirerVideo.mutate(r.id)}
              />
            ))}
          </ul>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFermer}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function LigneRemarque({
  remarque,
  videoBusy,
  onSauver,
  onSupprimer,
  onVideo,
  onRetirerVideo,
}: {
  remarque: ReviewRemarque;
  videoBusy?: boolean;
  onSauver: (patch: { titre: string; corps: string }) => Promise<void>;
  onSupprimer: () => void;
  onVideo: (file: File) => void;
  onRetirerVideo: () => void;
}) {
  const { t } = useTranslation();
  const [titre, setTitre] = React.useState(remarque.titre);
  const [corps, setCorps] = React.useState(remarque.corps);
  const [errVideo, setErrVideo] = React.useState<string | null>(null);
  const sale = titre !== remarque.titre || corps !== remarque.corps;

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <Input value={titre} onChange={(e) => setTitre(e.target.value)} />
      <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={3} />
      <DropVideoRemarque
        videoUrl={remarque.video_url}
        disabled={videoBusy}
        labelVide={t("fileReviews.videoVide")}
        labelRemplacer={t("fileReviews.videoRemplacer")}
        onFichier={(file) => {
          void accepterVideo(file, (cle) => t(`fileReviews.videoErr.${cle}`)).then((err) => {
            if (err) {
              setErrVideo(err);
              return;
            }
            setErrVideo(null);
            onVideo(file);
          });
        }}
        onRetirer={remarque.video_url ? onRetirerVideo : undefined}
      />
      {errVideo && <p className="text-sm text-destructive">{errVideo}</p>}
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
  const [videos, setVideos] = React.useState<ReviewVideo[]>([]);
  const [errVideoFile, setErrVideoFile] = React.useState<string | null>(null);
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

  React.useEffect(() => {
    setTexte("");
    setVideos([]);
    setErrVideoFile(null);
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
        videos,
      });
      return courant.id;
    },
    onSuccess: (id) => {
      setTexte("");
      setVideos([]);
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

  const deposerVideoRemarque = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploaderVideoRemarque(id, file),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["review-remarques"] });
      setVideos((prev) => ajouterVideoReview(prev, { url: r.video_url, titre: r.titre }));
    },
  });

  const utiliserRemarque = (r: ReviewRemarque) => {
    setTexte((prev) => insererRemarqueDansBrouillon(prev, r.corps));
    setVideos((prev) => ajouterVideoReview(prev, { url: r.video_url, titre: r.titre }));
  };

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
            />
          </div>

          {(remarques.data ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{t("fileReviews.remarques")}</p>
              <p className="text-xs text-muted-foreground">{t("fileReviews.videoGlisserAide")}</p>
              <div className="flex flex-wrap gap-2">
                {(remarques.data ?? []).map((r) => (
                  <BoutonRemarque
                    key={r.id}
                    remarque={r}
                    busy={deposerVideoRemarque.isPending && deposerVideoRemarque.variables?.id === r.id}
                    onUtiliser={() => utiliserRemarque(r)}
                    onFichier={(file) => {
                      void accepterVideo(file, (cle) => t(`fileReviews.videoErr.${cle}`)).then((err) => {
                        if (err) {
                          setErrVideoFile(err);
                          return;
                        }
                        setErrVideoFile(null);
                        deposerVideoRemarque.mutate({ id: r.id, file });
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {videos.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t("fileReviews.videosJointes")}</p>
              <ul className="flex flex-wrap gap-2">
                {videos.map((v) => (
                  <li key={v.url}>
                    <Badge variant="secondary" className="gap-1 pr-1">
                      <Film className="size-3" />
                      <span className="max-w-40 truncate">{v.titre || t("fileReviews.videoSansTitre")}</span>
                      <button
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-background/80"
                        aria-label={t("common.delete")}
                        onClick={() => setVideos((prev) => retirerVideoReview(prev, v.url))}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {errVideoFile && <p className="text-sm text-destructive">{errVideoFile}</p>}
          {deposerVideoRemarque.isError && (
            <p className="text-sm text-destructive">{(deposerVideoRemarque.error as Error).message}</p>
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

function BoutonRemarque({
  remarque,
  busy,
  onUtiliser,
  onFichier,
}: {
  remarque: ReviewRemarque;
  busy?: boolean;
  onUtiliser: () => void;
  onFichier: (file: File) => void;
}) {
  const [survol, setSurvol] = React.useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      className={cn(survol && "ring-2 ring-ring")}
      onClick={onUtiliser}
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        const f = premierFichierVideo(e.dataTransfer.files);
        if (f) onFichier(f);
      }}
    >
      {remarque.video_url ? <Film className="size-3.5" /> : null}
      {remarque.titre}
    </Button>
  );
}
