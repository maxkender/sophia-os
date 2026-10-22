import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Bot, ChevronUp, Film, Plus, Send, Settings2, SkipForward, Sparkles, Trash2, X } from "lucide-react";

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
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ameliorerReview,
  aujourdhuiParis,
  compterRemarquesParCreateur,
  creerReviewRemarque,
  envoyerReview,
  listerFileReviewsJour,
  listerRelecturesAuto,
  listerReviewRemarques,
  majReviewRemarque,
  passerPostReview,
  resoudreTiktok,
  retirerVideoRemarque,
  supprimerReviewRemarque,
  testerRelecture,
  uploaderVideoRemarque,
  type PostFileReview,
  type ReviewRemarque,
} from "@/features/moteur/api";
import { DropVideoRemarque } from "@/features/reviews/DropVideoRemarque";
import {
  ajouterJourCalendaire,
  ajouterRemarqueUtilisee,
  ajouterVideoReview,
  compterMemeTiktok,
  insererRemarqueDansBrouillon,
  jourParisDepuisIso,
  retirerRemarqueUtilisee,
  retirerVideoReview,
  type CompteRemarque,
  type ReviewRemarqueUtilisee,
  type ReviewVideo,
} from "@/features/reviews/fileJour";
import {
  postQuiMarche,
  estBrouillonIntact,
  libelleDefaut,
  relectureFinie,
  repartirDefauts,
  videosDuBrouillon,
  vuesCompactes,
  type DefautRelecture,
  type RelectureAuto,
} from "@/features/reviews/relectureAgent";
import { TikTokEmbed } from "@/features/reviews/TikTokEmbed";
import { besoinResoudreTiktok, idTiktokDepuisUrl } from "@/features/reviews/tiktokEmbed";
import { controlerVideoRemarque, premierFichierVideo } from "@/features/reviews/videoRemarque";
import { cn } from "@/lib/utils";
import { AvatarCompte } from "@/features/moteur/VignetteCompte";
import { localeDate } from "@/locales/localeDate";

/** « Tester » : l'agent relit le post (scrape puis mesure), on le rappelle jusqu'au verdict. */
const SONDAGE_TEST_MS = 5000;
const ATTENTE_TEST_MAX_MS = 4 * 60 * 1000;

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
  const [ajoutOuvert, setAjoutOuvert] = React.useState(false);
  const apercuNouvelle = React.useMemo(
    () => (videoNouvelle ? URL.createObjectURL(videoNouvelle) : null),
    [videoNouvelle],
  );
  React.useEffect(() => {
    return () => {
      if (apercuNouvelle) URL.revokeObjectURL(apercuNouvelle);
    };
  }, [apercuNouvelle]);

  React.useEffect(() => {
    if (!ouvert) setAjoutOuvert(false);
  }, [ouvert]);

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
      setAjoutOuvert(false);
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
      <DialogPopup className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-hidden" showCloseButton>
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("fileReviews.reglagesTitre")}</DialogTitle>
          <DialogDescription>{t("fileReviews.reglagesSous")}</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b px-6 py-2">
          <Button
            type="button"
            size="sm"
            variant={ajoutOuvert ? "secondary" : "outline"}
            className="w-full justify-between"
            aria-expanded={ajoutOuvert}
            onClick={() => setAjoutOuvert((v) => !v)}
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="size-4" />
              {t("fileReviews.nouvelle")}
            </span>
            <ChevronUp className={cn("size-4 transition-transform", !ajoutOuvert && "rotate-180")} />
          </Button>
        </div>
        {ajoutOuvert && (
        <form
          className="shrink-0 space-y-2 border-b px-6 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            ajouter();
          }}
        >
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
            rows={2}
            className="min-h-16 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <DropVideoRemarque
            compact
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
          {creer.isError && (
            <p className="text-sm text-destructive">{(creer.error as Error).message}</p>
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
        )}
        <div
          data-testid="liste-remarques"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-3"
        >
          {(creer.isError || remarques.isError || videoLigne.isError || retirerVideo.isError) && (
            <p className="mb-3 text-sm text-destructive">
              {(creer.error as Error | undefined)?.message ||
                (videoLigne.error as Error | undefined)?.message ||
                (retirerVideo.error as Error | undefined)?.message ||
                (remarques.error as Error | undefined)?.message}
            </p>
          )}
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
        </div>
        <DialogFooter className="shrink-0">
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
  const [texte, setTexte] = React.useState("");
  const [videos, setVideos] = React.useState<ReviewVideo[]>([]);
  const [remarquesUtilisees, setRemarquesUtilisees] = React.useState<ReviewRemarqueUtilisee[]>([]);
  const [errVideoFile, setErrVideoFile] = React.useState<string | null>(null);
  const [reglages, setReglages] = React.useState(false);
  // L'agent relit chaque nuit les posts de la veille : la file s'ouvre aussi sur hier.
  const aujourdhui = aujourdhuiParis();
  const hier = ajouterJourCalendaire(aujourdhui, -1);
  const [jour, setJour] = React.useState(aujourdhui);

  const file = useQuery({
    queryKey: ["file-reviews", jour],
    queryFn: () => listerFileReviewsJour({ jour }),
  });
  const remarques = useQuery({
    queryKey: ["review-remarques"],
    queryFn: listerReviewRemarques,
  });

  // Historique par créateur (poster), tous ses comptes confondus : chargé pour
  // toute la file d'un coup, pour ne pas requêter à chaque post traité.
  const posterIds = React.useMemo(
    () => [...new Set((file.data ?? []).map((p) => p.poster_id).filter(Boolean))].sort(),
    [file.data],
  );
  const historique = useQuery({
    queryKey: ["review-remarques-createurs", posterIds],
    queryFn: () => compterRemarquesParCreateur(posterIds),
    enabled: posterIds.length > 0,
  });

  const postIds = React.useMemo(() => (file.data ?? []).map((p) => p.id), [file.data]);
  const relectures = useQuery({
    queryKey: ["relectures-auto", postIds],
    queryFn: () => listerRelecturesAuto(postIds),
    enabled: postIds.length > 0,
  });
  const proposees = postIds.filter((id) => relectures.data?.[id]?.brouillon).length;

  const courant = (file.data ?? [])[0] ?? null;
  // Le post affiché au moment où un test se termine (l'admin a pu passer au suivant).
  const courantId = React.useRef<string | null>(null);
  courantId.current = courant?.id ?? null;

  React.useEffect(() => {
    setTexte("");
    setVideos([]);
    setRemarquesUtilisees([]);
    setErrVideoFile(null);
  }, [courant?.id]);

  const retirer = (postId: string) => {
    queryClient.setQueryData<PostFileReview[]>(
      ["file-reviews", jour],
      (prev) => (prev ?? []).filter((p) => p.id !== postId),
    );
  };

  const envoyer = useMutation({
    mutationFn: async () => {
      if (!courant) throw new Error("empty");
      // Le brouillon de l'agent part tel quel : c'est le message relu sur le
      // banc d'essai. Un texte retouché ou écrit à la main repasse par l'IA.
      const anglais = estBrouillonIntact(texte, relectures.data?.[courant.id]?.brouillon)
        ? texte.trim()
        : (await ameliorerReview(texte)).texte;
      await envoyerReview(courant.poster_id, anglais, {
        post_id: courant.id,
        publie_url: courant.publie_url,
        source_url: courant.source_url,
        handle_tiktok: courant.handle_tiktok,
        compte_label: labelCompte(courant),
        date_publication: jourParisOuPrevue(courant),
        videos,
        remarques: remarquesUtilisees,
      });
      return courant.id;
    },
    onSuccess: (id) => {
      setTexte("");
      setVideos([]);
      setRemarquesUtilisees([]);
      retirer(id);
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      queryClient.invalidateQueries({ queryKey: ["review-remarques-createurs"] });
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

  /** Pré-remplit la review avec celle de l'agent, ses remarques-types et leurs vidéos tuto. */
  const reprendreBrouillon = (r: RelectureAuto) => {
    if (!r.brouillon) return;
    setTexte(r.brouillon);
    setRemarquesUtilisees(r.remarques.reduce(ajouterRemarqueUtilisee, [] as ReviewRemarqueUtilisee[]));
    setVideos(videosDuBrouillon(r.remarques, remarques.data ?? []));
  };

  const tester = useMutation({
    mutationFn: async (postId: string) => {
      const limite = Date.now() + ATTENTE_TEST_MAX_MS;
      let r = await testerRelecture(postId);
      while (!relectureFinie(r) && Date.now() < limite) {
        await new Promise((ok) => setTimeout(ok, SONDAGE_TEST_MS));
        r = await testerRelecture(postId);
      }
      if (!relectureFinie(r)) throw new Error(t("fileReviews.agent.tropLong"));
      return r;
    },
    onSuccess: (r) => {
      // Toutes les files en cache : l'admin a pu changer de jour pendant le test.
      queryClient.setQueriesData<Record<string, RelectureAuto>>({ queryKey: ["relectures-auto"] }, (prev) =>
        prev ? { ...prev, [r.post_id]: r } : prev,
      );
      if (courantId.current === r.post_id) reprendreBrouillon(r);
    },
  });
  // Même TikTok collé pour plusieurs posts du compte : les liens courts sont
  // résolus (même cache que le lecteur) pour comparer les vrais posts.
  const memeTiktok = useQuery({
    queryKey: ["meme-tiktok", courant?.id, courant?.publie_url, courant?.autres_liens],
    enabled: Boolean(courant?.publie_url) && (courant?.autres_liens?.length ?? 0) > 0,
    queryFn: async () => {
      const resoudre = async (lien: string) => {
        if (!besoinResoudreTiktok(lien)) return { lien, id: idTiktokDepuisUrl(lien) };
        try {
          const r = await queryClient.fetchQuery({
            queryKey: ["tiktok-apercu", lien],
            queryFn: () => resoudreTiktok(lien),
            staleTime: 10 * 60_000,
          });
          return { lien, id: r.id ?? idTiktokDepuisUrl(r.url) };
        } catch {
          return { lien, id: null };
        }
      };
      const [lui, ...autres] = await Promise.all(
        [courant!.publie_url as string, ...(courant!.autres_liens ?? [])].map(resoudre),
      );
      return compterMemeTiktok(lui, autres);
    },
    staleTime: 10 * 60_000,
  });
  const memesLiens = memeTiktok.data ?? 0;

  const testEnCours = tester.isPending && tester.variables === courant?.id;
  const testEchoue = tester.isError && tester.variables === courant?.id;

  const utiliserRemarque = (r: ReviewRemarque) => {
    setTexte((prev) => insererRemarqueDansBrouillon(prev, r.corps));
    setVideos((prev) => ajouterVideoReview(prev, { url: r.video_url, titre: r.titre }));
    setRemarquesUtilisees((prev) => ajouterRemarqueUtilisee(prev, r));
  };

  /** Titre courant de la remarque si elle existe encore, sinon celui figé à l'envoi. */
  const titreRemarque = (c: CompteRemarque) =>
    (remarques.data ?? []).find((r) => r.id === c.id)?.titre || c.titre;

  const labelJour = new Date(`${jour}T12:00:00`).toLocaleDateString(localeDate(i18n.language), {
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {[
                { valeur: hier, label: t("fileReviews.hier") },
                { valeur: aujourdhui, label: t("fileReviews.aujourdhui") },
              ].map((j) => (
                <Button
                  key={j.valeur}
                  type="button"
                  size="sm"
                  variant={jour === j.valeur ? "secondary" : "ghost"}
                  aria-pressed={jour === j.valeur}
                  onClick={() => setJour(j.valeur)}
                >
                  {j.label}
                </Button>
              ))}
            </div>
            <Badge variant="secondary">{t("fileReviews.restants", { count: restants })}</Badge>
            {proposees > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Bot className="size-3" />
                {t("fileReviews.agent.proposees", { count: proposees })}
              </Badge>
            )}
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
        <EmptyState
          title={t("fileReviews.vide")}
          description={jour === aujourdhui ? t("fileReviews.videAide") : t("fileReviews.videAideJour")}
        />
      )}

      {courant && (
        <div className="space-y-5">
          <div className="space-y-2">
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
            <HistoriqueRemarques
              comptes={historique.data?.[courant.poster_id] ?? []}
              chargement={historique.isPending && posterIds.length > 0}
              titreRemarque={titreRemarque}
            />
          </div>

          {memesLiens > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {t("fileReviews.lienDouble", { count: memesLiens })}
            </p>
          )}

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

          <RelectureAgent
            relecture={relectures.data?.[courant.id] ?? null}
            chargement={relectures.isPending}
            enCours={testEnCours}
          />

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

          {remarquesUtilisees.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t("fileReviews.remarquesComptees")}
              </p>
              <ul className="flex flex-wrap gap-2">
                {remarquesUtilisees.map((r) => (
                  <li key={r.id}>
                    <Badge variant="secondary" className="gap-1 pr-1">
                      <span className="max-w-40 truncate">{r.titre}</span>
                      <button
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-background/80"
                        aria-label={t("common.delete")}
                        onClick={() =>
                          setRemarquesUtilisees((prev) => retirerRemarqueUtilisee(prev, r.id))
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
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
          {(envoyer.isError || ameliorer.isError || passer.isError || testEchoue) && (
            <p className="text-sm text-destructive">
              {(envoyer.error as Error | undefined)?.message ||
                (ameliorer.error as Error | undefined)?.message ||
                (passer.error as Error | undefined)?.message ||
                (testEchoue ? (tester.error as Error | undefined)?.message : undefined)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={tester.isPending || envoyer.isPending}
              onClick={() => tester.mutate(courant.id)}
            >
              <Bot className="size-4" />
              {testEnCours ? t("fileReviews.agent.testEnCours") : t("fileReviews.agent.tester")}
            </Button>
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

/**
 * Ce que l'agent de relecture a vu sur ce post (cron de 3 h sur les posts de
 * la veille, ou bouton « Tester ») : les points de la review qu'il propose,
 * ceux qui attendent la suivante, et ses notes pour l'admin. Sa review
 * pré-remplit le champ au clic sur « Tester » ; rien n'est envoyé sans l'admin.
 */
function RelectureAgent({
  relecture,
  chargement,
  enCours,
}: {
  relecture: RelectureAuto | null;
  chargement: boolean;
  /** « Tester » tourne pour ce post. */
  enCours: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (chargement) return null;

  let contenu: React.ReactNode;
  if (enCours) {
    contenu = <p className="text-sm text-muted-foreground">{t("fileReviews.agent.enCours")}</p>;
  } else if (!relecture) {
    contenu = <p className="text-sm text-muted-foreground">{t("fileReviews.agent.pasEncore")}</p>;
  } else if (relecture.statut === "ignore" || relecture.statut === "echec") {
    contenu = (
      <p className="text-sm text-muted-foreground">
        {t(relecture.statut === "ignore" ? "fileReviews.agent.ignore" : "fileReviews.agent.echec", {
          raison: relecture.erreur ?? "—",
        })}
      </p>
    );
  } else if (relecture.statut !== "fait") {
    contenu = <p className="text-sm text-muted-foreground">{t("fileReviews.agent.enCours")}</p>;
  } else if (postQuiMarche(relecture)) {
    // Le post marche : pas de message, ses points ne partent pas.
    const { review, plusTard, notes } = repartirDefauts(relecture.defauts);
    const nonEnvoyes = [...review, ...plusTard];
    contenu = (
      <div className="space-y-3">
        <p className="text-sm">
          {t("fileReviews.agent.marche", { vues: vuesCompactes(relecture.vues ?? 0, i18n.language) })}
        </p>
        {nonEnvoyes.length > 0 && (
          <ListeDefauts titre={t("fileReviews.agent.nonEnvoyes")} defauts={nonEnvoyes} discret />
        )}
        {notes.length > 0 && <ListeDefauts titre={t("fileReviews.agent.notes")} defauts={notes} discret />}
      </div>
    );
  } else {
    const { review, plusTard, notes } = repartirDefauts(relecture.defauts);
    contenu = (
      <div className="space-y-3">
        {review.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("fileReviews.agent.rien")}</p>
        ) : (
          <ListeDefauts titre={t("fileReviews.agent.points")} defauts={review} />
        )}
        {plusTard.length > 0 && (
          <ListeDefauts titre={t("fileReviews.agent.plusTard")} defauts={plusTard} discret />
        )}
        {notes.length > 0 && <ListeDefauts titre={t("fileReviews.agent.notes")} defauts={notes} discret />}
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border p-4" aria-label={t("fileReviews.agent.titre")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Bot className="size-3.5" />
        {t("fileReviews.agent.titre")}
      </p>
      {contenu}
    </section>
  );
}

function ListeDefauts({
  titre,
  defauts,
  discret,
}: {
  titre: string;
  defauts: DefautRelecture[];
  discret?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{titre}</p>
      <ul className={cn("list-disc space-y-0.5 pl-5 text-sm", discret && "text-muted-foreground")}>
        {defauts.map((d) => (
          <li key={`${d.code}-${d.slides.join(",")}`}>{libelleDefaut(d)}</li>
        ))}
      </ul>
    </div>
  );
}

/** « 3× Texte illisible » : ce qu'on a déjà reproché à ce créateur, tous ses comptes confondus. */
function HistoriqueRemarques({
  comptes,
  chargement,
  titreRemarque,
}: {
  comptes: CompteRemarque[];
  chargement: boolean;
  titreRemarque: (c: CompteRemarque) => string;
}) {
  const { t } = useTranslation();
  if (chargement) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{t("fileReviews.historique")}</p>
      {comptes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("fileReviews.historiqueVide")}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {comptes.map((c) => (
            <li key={c.id}>
              <Badge variant="secondary" className="tabular-nums">
                {t("fileReviews.historiqueFois", { n: c.n, titre: titreRemarque(c) })}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
