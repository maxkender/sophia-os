import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ImageUp, QrCode, RefreshCcw, Sparkles, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { executerEnLot } from "@/lib/lot";
import { NettoyageEtapes } from "@/components/moteur/NettoyageEtapes";
import { UpscaleMediaControl } from "@/components/moteur/UpscaleMediaControl";
import {
  apercuSujet,
  avancerUnPost,
  compteReferenceDuPost,
  lancerPreparation,
  lirePost,
  lireReglages,
  listerMedias,
  listerSlides,
  majMediaSlide,
  majTexteSlide,
  renettoyerSlide,
  retirerPhotoSlide,
  revoquerPost,
  supprimerSlide,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
  type ProviderNettoyage,
} from "@/features/moteur/nettoyageEtapes";
import { supabase } from "@/lib/supabase/client";
import type { Media, PostSlide } from "@/features/moteur/types";

function estPropre(slide: PostSlide): boolean {
  return Boolean(slide.media_library?.storage_path?.startsWith("propre/"));
}

/** Grille de la bibliothèque du compte de référence, pour remplacer un visuel. */
function SelecteurBibliotheque({
  medias,
  onChoisir,
  onFermer,
}: {
  medias: Media[];
  onChoisir: (mediaId: string) => void;
  onFermer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onFermer}
    >
      <div
        className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">{t("adminPost.choisirBiblio")}</p>
          <Button size="icon" variant="ghost" aria-label={t("common.cancel")} onClick={onFermer}>
            <X />
          </Button>
        </div>
        {medias.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("adminPost.biblioVide")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {medias.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onChoisir(m.id)}
                className="group relative overflow-hidden rounded-md border transition hover:ring-2 hover:ring-primary"
              >
                <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                {!m.storage_path.startsWith("propre/") && (
                  <span className="absolute inset-x-0 bottom-0 bg-warning/80 py-0.5 text-center text-[10px] text-warning-foreground">
                    {t("adminPost.texteRestant")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Un bloc slide : photo (nettoyée ou à texte), texte éditable, actions image. */
function SlideAdmin({
  slide,
  postId,
  compteReferenceId,
  premier,
  etapesLot,
}: {
  slide: PostSlide;
  postId: string;
  compteReferenceId: string | null;
  premier: ProviderNettoyage;
  /** Timeline fournie par un nettoyage en lot (sinon locale). */
  etapesLot?: EvenementEtape[] | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [texte, setTexte] = React.useState(slide.texte_overlay ?? "");
  const [picker, setPicker] = React.useState(false);
  const [etapesLocales, setEtapesLocales] = React.useState<EvenementEtape[] | null>(null);

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ["slides", postId] });
    void queryClient.invalidateQueries({ queryKey: ["medias"] });
    void queryClient.invalidateQueries({ queryKey: ["medias-biblio"] });
  };
  const texteModifie = texte !== (slide.texte_overlay ?? "");
  const etapes = etapesLocales ?? etapesLot ?? null;
  const dejaUpscale = Boolean(slide.media_library?.upscale_le);

  const bibliotheque = useQuery({
    queryKey: ["medias", compteReferenceId],
    queryFn: () => listerMedias(compteReferenceId ?? undefined),
    enabled: picker && Boolean(compteReferenceId),
  });

  const enregistrerTexte = useMutation({
    mutationFn: () => majTexteSlide(slide.id, texte),
    onSuccess: rafraichir,
  });
  const renettoyer = useMutation({
    mutationFn: () => {
      setEtapesLocales(etapesInitiales(premier));
      return renettoyerSlide(slide.id, (ev) => {
        setEtapesLocales((prev) =>
          appliquerEvenement(prev ?? etapesInitiales(premier), ev, premier),
        );
      });
    },
    onSuccess: () => {
      setEtapesLocales(null);
      rafraichir();
    },
  });
  const remplacer = useMutation({
    mutationFn: (mediaId: string) => majMediaSlide(slide.id, mediaId),
    onSuccess: () => {
      setPicker(false);
      rafraichir();
    },
  });
  const retirer = useMutation({
    mutationFn: () => retirerPhotoSlide(slide.id),
    onSuccess: rafraichir,
  });
  const supprimer = useMutation({
    mutationFn: () => supprimerSlide(slide.id),
    onSuccess: rafraichir,
  });

  const propre = estPropre(slide);
  const photoUrl = slide.media_library?.url ?? null;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t("posts.slide", { position: slide.position })}</span>
          {slide.position_sophia && <Badge>{t("posts.sophia")}</Badge>}
          {!propre && photoUrl && <Badge variant="warning">{t("adminPost.texteRestant")}</Badge>}
          {!photoUrl && <Badge variant="warning">{t("posts.photoManquante")}</Badge>}
          {dejaUpscale && <Badge variant="success">{t("bibliotheque.dejaUpscale")}</Badge>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <figure className="space-y-1.5">
            <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("posts.photoAPoster")}
            </figcaption>
            {photoUrl ? (
              <img
                src={photoUrl}
                alt=""
                className={cn(
                  "w-full rounded-lg border object-contain",
                  !propre && "border-2 border-warning/60",
                )}
              />
            ) : (
              <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-warning/50 bg-warning/5 text-xs text-warning">
                {t("posts.photoManquante")}
              </div>
            )}
          </figure>

          {slide.reference_url && (
            <figure className="space-y-1.5">
              <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("posts.placementTitre")}
              </figcaption>
              <img src={slide.reference_url} alt="" className="w-full rounded-lg border object-contain" />
            </figure>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={renettoyer.isPending || Boolean(etapesLot)}
            onClick={() => renettoyer.mutate()}
          >
            <Sparkles />
            {renettoyer.isPending || etapesLot
              ? t("adminPost.nettoyageEnCours")
              : t("adminPost.renettoyer")}
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={remplacer.isPending || !compteReferenceId}
            onClick={() => setPicker(true)}
          >
            <ImageUp />
            {remplacer.isPending ? t("common.saving") : t("adminPost.remplacerPhoto")}
          </Button>

          {slide.media_id && (
            <UpscaleMediaControl
              mediaId={slide.media_id}
              dejaUpscale={dejaUpscale}
              disabled={Boolean(etapesLot) || renettoyer.isPending}
              onSuccess={rafraichir}
            />
          )}

          {photoUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={retirer.isPending}
              onClick={() => {
                if (window.confirm(t("adminPost.confirmRetirerPhoto"))) retirer.mutate();
              }}
            >
              <Trash2 />
              {t("adminPost.retirerPhoto")}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={supprimer.isPending}
            onClick={() => {
              if (window.confirm(t("adminPost.confirmSupprimerSlide"))) supprimer.mutate();
            }}
          >
            <Trash2 />
            {t("adminPost.supprimerSlide")}
          </Button>
        </div>

        {etapes && (renettoyer.isPending || renettoyer.isError || etapesLot) ? (
          <NettoyageEtapes etapes={etapes} className="rounded border bg-muted/30 p-2" />
        ) : null}

        {picker && (
          <SelecteurBibliotheque
            medias={bibliotheque.data ?? []}
            onChoisir={(mediaId) => remplacer.mutate(mediaId)}
            onFermer={() => setPicker(false)}
          />
        )}

        {renettoyer.data?.remplacee && (
          <p className="text-xs text-warning">{t("adminPost.photoRemplacee")}</p>
        )}
        {renettoyer.data && !renettoyer.data.nettoyee && !renettoyer.data.remplacee && (
          <p className="text-xs text-destructive">
            {t("adminPost.nettoyageEchec")}
            {renettoyer.data.motif ? ` — ${renettoyer.data.motif}` : ""}
          </p>
        )}

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("posts.texteSlide")}
          </label>
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {texteModifie && (
            <div className="flex gap-2">
              <Button size="sm" disabled={enregistrerTexte.isPending} onClick={() => enregistrerTexte.mutate()}>
                <Check />
                {enregistrerTexte.isPending ? t("common.saving") : t("common.save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTexte(slide.texte_overlay ?? "")}>
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminPostDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lot, setLot] = React.useState<{ fait: number; total: number } | null>(null);
  const [etapesLot, setEtapesLot] = React.useState<Record<string, EvenementEtape[]>>({});
  const [revoq, setRevoq] = React.useState<string | null>(null);

  const { data: reglages } = useQuery({
    queryKey: ["reglages"],
    queryFn: lireReglages,
    staleTime: 30_000,
  });
  const premier: ProviderNettoyage = reglages?.nettoyage.provider_principal ?? "fal";

  /**
   * Post inutilisable (thème incohérent pour Sophia) : on rejette CE slideshow
   * (pas le hook — un autre post peut commencer pareil et rester bon), on en
   * refabrique un autre pour le même créateur + date, puis on l'ouvre.
   */
  async function revoquerEtRefaire() {
    if (!id) return;
    if (!window.confirm(t("adminPost.confirmRevoquer"))) return;
    setRevoq(t("adminPost.revoquerEnCours"));
    try {
      const { newPostId } = await revoquerPost(id);
      if (!newPostId) {
        setRevoq(null);
        window.alert(t("adminPost.revoquerAucun"));
        navigate("/admin/calendrier");
        return;
      }
      // On fabrique le nouveau post pas à pas jusqu'à ce qu'il soit prêt.
      for (let i = 0; i < 40; i += 1) {
        const r = await avancerUnPost(newPostId).catch(() => null);
        if (r?.etape === "done" || r?.etape === "failed") break;
      }
      setRevoq(null);
      navigate(`/admin/posts/${newPostId}`);
    } catch (e) {
      setRevoq(null);
      window.alert((e as Error).message);
    }
  }

  const post = useQuery({
    queryKey: ["post", id],
    queryFn: () => lirePost(id!),
    enabled: Boolean(id),
    // Pendant qu'un post de test se fabrique, on rafraîchit tout seul : la page
    // se met à jour quand c'est prêt, même si le build a été lancé ailleurs.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && d.est_test && d.pipeline_statut !== "done" ? 4000 : false;
    },
  });
  const slides = useQuery({
    queryKey: ["slides", id],
    queryFn: () => listerSlides(id!),
    enabled: Boolean(id),
  });
  // Compte de référence du post : sa bibliothèque alimente le remplacement.
  const refId = useQuery({
    queryKey: ["post-ref", id],
    queryFn: () => compteReferenceDuPost(id!),
    enabled: Boolean(id),
  });

  // --- PILOTE DE BUILD (posts de TEST) : nettoyage du sujet puis composition
  // (Sophia), depuis la page, avec progression visible et REPRISE. Avant, tout se
  // jouait dans un seul long appel : dès que l'onglet dormait, le test mourait.
  const [build, setBuild] = React.useState<null | "nettoyage" | "sophia" | "echec">(null);
  const buildRef = React.useRef<string | null>(null);
  const enBuild = Boolean(post.data && post.data.est_test && post.data.pipeline_statut !== "done");

  // Aperçu du sujet (images d'origine + statut nettoyage), poll pendant le build.
  const apercu = useQuery({
    queryKey: ["apercu-sujet", post.data?.sujet_id],
    queryFn: () => apercuSujet(post.data!.sujet_id!),
    enabled: enBuild && Boolean(post.data?.sujet_id),
    refetchInterval: enBuild ? 3000 : false,
  });

  React.useEffect(() => {
    const p = post.data;
    if (!p || !p.est_test || p.pipeline_statut === "done") return;
    if (buildRef.current === p.id) return; // déjà en cours pour ce post
    buildRef.current = p.id;
    (async () => {
      try {
        // 1 — Nettoyage du sujet (jusqu'à done ; le cleanImage retombe sur une
        //     photo de la bibliothèque si Fal+Replicate échouent, donc ça aboutit).
        if (p.sujet_id) {
          for (let i = 0; i < 80; i += 1) {
            const { data: s } = await supabase
              .from("sujets")
              .select("preparation_statut")
              .eq("id", p.sujet_id)
              .single();
            if (s?.preparation_statut === "done") break;
            if (s?.preparation_statut === "failed") return setBuild("echec");
            setBuild("nettoyage");
            await lancerPreparation(p.sujet_id).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ["apercu-sujet", p.sujet_id] });
          }
        }
        // 2 — Composition : traduction du deck puis intégration de Sophia.
        for (let i = 0; i < 15; i += 1) {
          const { data: pp } = await supabase
            .from("posts")
            .select("pipeline_statut")
            .eq("id", p.id)
            .single();
          if (pp?.pipeline_statut === "done") break;
          if (pp?.pipeline_statut === "failed") return setBuild("echec");
          setBuild("sophia");
          await avancerUnPost(p.id).catch(() => {});
        }
        setBuild(null);
        queryClient.invalidateQueries({ queryKey: ["post", p.id] });
        queryClient.invalidateQueries({ queryKey: ["slides", p.id] });
      } finally {
        buildRef.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.data?.id, post.data?.est_test, post.data?.pipeline_statut]);

  const liste = slides.data ?? [];
  const aProbleme = liste.filter((s) => !estPropre(s)).length;

  /**
   * Nettoie toutes les slides à texte via un pool d'agents parallèles (cf.
   * executerEnLot). Chaque nettoyage dure ~1 min ; les lancer en série serait
   * interminable, d'où le parallélisme.
   */
  async function nettoyerTout() {
    const aFaire = liste.filter((s) => !estPropre(s));
    setLot({ fait: 0, total: aFaire.length });
    setEtapesLot(
      Object.fromEntries(aFaire.map((s) => [s.id, etapesInitiales(premier)])),
    );
    await executerEnLot(
      aFaire,
      (slide) =>
        renettoyerSlide(slide.id, (ev) => {
          setEtapesLot((prev) => ({
            ...prev,
            [slide.id]: appliquerEvenement(
              prev[slide.id] ?? etapesInitiales(premier),
              ev,
              premier,
            ),
          }));
        }),
      {
        onProgres: (fait, total) => setLot({ fait, total }),
      },
    );
    setLot(null);
    setEtapesLot({});
    queryClient.invalidateQueries({ queryKey: ["slides", id] });
  }

  if (post.isPending || slides.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!post.data) return <p className="text-sm text-destructive">{t("common.notFoundTitle")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/calendrier">{t("common.back")}</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {post.data.pipeline_statut === "done" && (
            <Button variant="outline" size="sm" asChild>
              {/* Vue « poster » : QR pour le mobile + ZIP + téléchargement photos. */}
              <Link to={`/posts/${id}`}>
                <QrCode className="size-4" />
                {t("adminPost.qrTelechargement")}
              </Link>
            </Button>
          )}
          {post.data.type !== "contenu" && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={revoq !== null}
              onClick={revoquerEtRefaire}
            >
              <RefreshCcw className="size-4" />
              {revoq ?? t("adminPost.revoquer")}
            </Button>
          )}
          <Badge variant="secondary">{t(`type.${post.data.type}`)}</Badge>
          <Badge variant={post.data.publie_at ? "success" : "outline"}>
            {t(`statut.${post.data.statut}`)}
          </Badge>
        </div>
      </div>

      {/* Mode : v-next = Slideshow bibliothèque ; legacy recycle/remanie/nouveau. */}
      <div
        className={
          post.data.type === "remanie"
            ? "rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
            : "rounded-lg border border-primary/40 bg-primary/10 p-3"
        }
      >
        <p className="text-base font-bold">
          {t(`type.${post.data.type}`)}
        </p>
        <p className="text-xs text-muted-foreground">{t(`adminPost.mode_${post.data.type}`)}</p>
      </div>

      {post.data.type !== "contenu" && (
        <p className="text-xs text-muted-foreground">{t("adminPost.revoquerAide")}</p>
      )}

      {/* Fabrication en direct (posts de test) : nettoyage photo par photo, puis
          Sophia, puis le QR apparaît. Reprend tout seul si l'onglet a dormi. */}
      {enBuild && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            {build === "echec" ? (
              <CardTitle className="text-base text-destructive">{t("adminPost.buildEchec")}</CardTitle>
            ) : (
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                {build === "sophia" ? t("adminPost.buildSophia") : t("adminPost.buildNettoyage")}
              </CardTitle>
            )}
            <CardDescription>{t("adminPost.buildAide")}</CardDescription>
            {build !== "echec" &&
              (() => {
                // Progression RÉELLE : part des slides déjà nettoyées (0-72 %),
                // puis l'étape Sophia (90 %). Pas d'estimation au doigt mouillé.
                const total = apercu.data?.length ?? 0;
                const propres = apercu.data?.filter((s) => s.url_propre).length ?? 0;
                const valeur =
                  build === "sophia" ? 90 : total ? 8 + Math.round((propres / total) * 72) : 8;
                return (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {build === "sophia"
                          ? t("adminPost.buildSophia")
                          : t("adminPost.buildNettoyageCompte", { propres, total })}
                      </span>
                      <span className="tabular-nums">{valeur}%</span>
                    </div>
                    <Progress value={valeur} />
                  </div>
                );
              })()}
          </CardHeader>
          {apercu.data && apercu.data.length > 0 && (
            <CardContent>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {apercu.data.map((s) => (
                  <div key={s.position} className="space-y-1">
                    <img
                      src={s.url_propre ?? s.url_brute ?? ""}
                      alt=""
                      className={cn(
                        "aspect-[3/4] w-full rounded-md border object-cover",
                        !s.url_propre && "opacity-70",
                      )}
                    />
                    <p className="text-center text-[10px] font-medium">
                      {s.url_propre ? (
                        <span className="text-success">✓ {t("adminPost.buildNettoyee")}</span>
                      ) : (
                        <span className="text-muted-foreground">{t("adminPost.buildEnCours")}</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{t("adminPost.title")}</CardTitle>
              <CardDescription>
                {aProbleme > 0
                  ? t("adminPost.aVerifier", { count: aProbleme })
                  : t("adminPost.toutPropre")}
              </CardDescription>
            </div>
            {aProbleme > 0 && (
              <Button size="sm" disabled={lot !== null} onClick={nettoyerTout}>
                <Sparkles />
                {lot
                  ? t("adminPost.lotEnCours", { fait: lot.fait, total: lot.total })
                  : t("adminPost.nettoyerTout", { count: aProbleme })}
              </Button>
            )}
          </div>
          {lot && (
            <p className="pt-1 text-xs text-muted-foreground">{t("adminPost.lotAide")}</p>
          )}
        </CardHeader>
      </Card>

      {liste.map((slide) => (
        <SlideAdmin
          key={slide.id}
          slide={slide}
          postId={id!}
          compteReferenceId={refId.data ?? null}
          premier={premier}
          etapesLot={etapesLot[slide.id] ?? null}
        />
      ))}
    </div>
  );
}
