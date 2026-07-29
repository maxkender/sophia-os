import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  ImageUp,
  Music,
  QrCode,
  Share,
  Sparkles,
  X,
} from "lucide-react";
import JSZip from "jszip";
import QRCode from "qrcode";

import { useAuth } from "@/features/auth/AuthContext";
import { NettoyageEtapes } from "@/components/moteur/NettoyageEtapes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  compteReferenceDuPost,
  lirePost,
  listerMedias,
  listerSlides,
  majMediaSlide,
  majPost,
  renettoyerSlide,
  reordonnerSlides,
} from "@/features/moteur/api";
import {
  appliquerEvenement,
  etapesInitiales,
  type EvenementEtape,
} from "@/features/moteur/nettoyageEtapes";
import {
  partagerFichiers,
  peutPartager,
  recupererFichier,
  telechargerFichier,
} from "@/features/moteur/telechargement";
import type { Media, Post, PostSlide } from "@/features/moteur/types";

function nomFichier(postId: string, position: number) {
  return `${postId.slice(0, 8)}-${String(position).padStart(2, "0")}.jpg`;
}

/**
 * Une slide n'est publiable que si sa photo a été nettoyée : `storage_path`
 * commençant par `propre/`. Un `brut/` porte encore le texte d'origine, un
 * media absent n'a rien du tout — les deux sont à signaler, pas à enregistrer.
 */
function estPropre(slide: PostSlide): boolean {
  return Boolean(slide.media_library?.storage_path?.startsWith("propre/"));
}

/** Zone de texte entièrement tapable : sur mobile, viser un petit bouton est
 * pénible, et la sélection manuelle d'un texte multiligne encore plus. */
function TexteCopiable({ texte, label }: { texte: string; label?: string }) {
  const { t } = useTranslation();
  const [copie, setCopie] = React.useState(false);

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
    } catch {
      // Clipboard refusé (contexte non sécurisé) : le texte reste sélectionnable.
    }
  }

  return (
    <button
      type="button"
      onClick={copier}
      className="w-full rounded-lg border bg-muted/60 p-4 text-left transition active:scale-[0.99]"
    >
      {label && (
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      <span className="block whitespace-pre-wrap break-words text-base leading-relaxed">
        {texte}
      </span>
      <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
        {copie ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copie ? t("posts.copie") : t("posts.taperPourCopier")}
      </span>
    </button>
  );
}

/** Plein écran : le placement du texte se juge sur une image lisible. */
function Loupe({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();

  React.useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"
      onClick={onClose}
    >
      <Button
        size="icon"
        variant="secondary"
        aria-label={t("common.cancel")}
        className="absolute right-3 top-3"
        onClick={onClose}
      >
        <X />
      </Button>
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
    </div>
  );
}

/**
 * QR pointant vers cette même page : sur ordinateur, enregistrer les photos ne
 * sert à rien puisqu'il faut les poster depuis le téléphone. Le poster relit
 * tout au calme sur grand écran, puis scanne pour récupérer les fichiers.
 * Masqué sur mobile, où l'on est déjà sur le bon appareil.
 */
function CarteQr({ url }: { url: string }) {
  const { t } = useTranslation();
  const [image, setImage] = React.useState<string | null>(null);

  React.useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setImage)
      .catch(() => setImage(null));
  }, [url]);

  if (!image) return null;

  return (
    <Card className="hidden border-primary/30 sm:block">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="size-4 text-primary" />
          {t("posts.qrTitle")}
        </CardTitle>
        <CardDescription>{t("posts.qrBody")}</CardDescription>
      </CardHeader>
      <CardContent>
        <img src={image} alt="QR code" className="mx-auto w-full max-w-[220px] rounded-lg border" />
      </CardContent>
    </Card>
  );
}

/** Une photo cliquable, légendée, qui s'ouvre en plein écran. */
function Visuel({
  url,
  legende,
  onZoom,
}: {
  url: string;
  legende: string;
  onZoom: () => void;
}) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {legende}
      </figcaption>
      <button type="button" onClick={onZoom} className="block w-full">
        <img
          src={url}
          alt=""
          className="w-full rounded-lg border object-contain transition hover:opacity-90"
        />
      </button>
    </figure>
  );
}

/**
 * Contrôles RÉSERVÉS À L'ADMIN sur une slide, ici même (utile pour les posts de
 * test qu'on ouvre dans cette vue) : renettoyer une image au texte encore
 * incrusté, ou la remplacer par une autre de la bibliothèque de la source. Un
 * poster normal ne les voit jamais — et de toute façon la fonction `renettoyer`
 * refuse un appel non-admin.
 */
function ControlesAdminSlide({
  slide,
  postId,
  compteReferenceId,
}: {
  slide: PostSlide;
  postId: string;
  compteReferenceId: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [picker, setPicker] = React.useState(false);
  const [etapes, setEtapes] = React.useState<EvenementEtape[] | null>(null);
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["slides", postId] });
    queryClient.invalidateQueries({ queryKey: ["fichiers", postId] });
  };

  const medias = useQuery({
    queryKey: ["medias", compteReferenceId],
    queryFn: () => listerMedias(compteReferenceId ?? undefined),
    enabled: picker && Boolean(compteReferenceId),
  });
  const renettoyer = useMutation({
    mutationFn: () => {
      setEtapes(etapesInitiales());
      return renettoyerSlide(slide.id, (ev) => {
        setEtapes((prev) => appliquerEvenement(prev ?? etapesInitiales(), ev));
      });
    },
    onSuccess: () => {
      setEtapes(null);
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
  const propres = (medias.data ?? []).filter((m) => m.storage_path?.startsWith("propre/"));

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("adminPost.outilsAdmin")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={renettoyer.isPending} onClick={() => renettoyer.mutate()}>
          <Sparkles className="size-4" />
          {renettoyer.isPending ? t("adminPost.nettoyageEnCours") : t("adminPost.renettoyer")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={remplacer.isPending || !compteReferenceId}
          onClick={() => setPicker(true)}
        >
          <ImageUp className="size-4" />
          {remplacer.isPending ? t("common.saving") : t("adminPost.remplacerPhoto")}
        </Button>
      </div>

      {etapes && (renettoyer.isPending || renettoyer.isError) ? (
        <NettoyageEtapes etapes={etapes} className="mt-2 rounded border bg-muted/30 p-2" />
      ) : null}

      {renettoyer.data && !renettoyer.data.nettoyee && !renettoyer.data.remplacee && (
        <p className="mt-2 text-xs text-destructive">
          {t("adminPost.nettoyageEchec")}
          {renettoyer.data.motif ? ` — ${renettoyer.data.motif}` : ""}
        </p>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPicker(false)}>
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">{t("adminPost.choisirBiblio")}</p>
              <Button size="icon" variant="ghost" aria-label={t("common.cancel")} onClick={() => setPicker(false)}>
                <X />
              </Button>
            </div>
            {medias.isPending ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : propres.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("adminPost.biblioVide")}</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {propres.map((m: Media) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => remplacer.mutate(m.id)}
                    className="overflow-hidden rounded-md border transition hover:ring-2 hover:ring-primary"
                  >
                    <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PosterPostPage() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const estAdmin = role === "admin";
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [lienPublie, setLienPublie] = React.useState("");
  const [loupe, setLoupe] = React.useState<string | null>(null);
  const [erreurPartage, setErreurPartage] = React.useState<string | null>(null);
  const [enCours, setEnCours] = React.useState(false);

  const post = useQuery({
    queryKey: ["post", id],
    queryFn: () => lirePost(id!),
    enabled: Boolean(id),
  });
  const slides = useQuery({
    queryKey: ["slides", id],
    queryFn: () => listerSlides(id!),
    enabled: Boolean(id),
  });
  // Bibliothèque source pour le remplacement d'image (contrôles admin seulement).
  const refId = useQuery({
    queryKey: ["post-ref", id],
    queryFn: () => compteReferenceDuPost(id!),
    enabled: estAdmin && Boolean(id),
  });

  const liste = React.useMemo(() => slides.data ?? [], [slides.data]);

  // Préchargement des visuels : `navigator.share` doit être appelé dans la
  // foulée du tap, il ne peut pas attendre un fetch.
  const fichiers = useQuery({
    queryKey: ["fichiers", id, liste.map((s) => s.media_library?.url).join("|")],
    enabled: liste.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const resultats: File[] = [];
      for (const slide of liste) {
        // On ne précharge que les photos nettoyées : enregistrer un visuel au
        // texte encore incrusté reviendrait à le faire publier tel quel.
        if (!estPropre(slide)) continue;
        const url = slide.media_library!.url;
        resultats.push(await recupererFichier(url, nomFichier(id!, slide.position)));
      }
      return resultats;
    },
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["post", id] });
    queryClient.invalidateQueries({ queryKey: ["slides", id] });
    queryClient.invalidateQueries({ queryKey: ["mes-posts"] });
  };

  const deplacer = useMutation({
    mutationFn: async (input: { index: number; delta: number }) => {
      const ordre = [...liste];
      const cible = input.index + input.delta;
      if (cible < 0 || cible >= ordre.length) return;
      [ordre[input.index], ordre[cible]] = [ordre[cible], ordre[input.index]];
      await reordonnerSlides(ordre);
    },
    onSuccess: rafraichir,
  });

  const valider = useMutation({
    mutationFn: () => majPost(id!, { statut: "valide_par_poster" }),
    onSuccess: rafraichir,
  });

  const publier = useMutation({
    mutationFn: () => {
      const lien = lienPublie.trim();
      if (!lien) throw new Error(t("posts.lienObligatoire"));
      return majPost(id!, {
        statut: "publie",
        publie_at: new Date().toISOString(),
        publie_url: lien,
      });
    },
    onSuccess: rafraichir,
  });

  /** Tout d'un coup : feuille de partage sur mobile, ZIP sur ordinateur. */
  async function toutEnregistrer(donnees: Post) {
    setErreurPartage(null);
    const prets = fichiers.data ?? [];

    try {
      if (peutPartager(prets)) {
        await partagerFichiers(prets, t("posts.title"));
        return;
      }

      setEnCours(true);
      const zip = new JSZip();
      prets.forEach((f) => zip.file(f.name, f));
      zip.file("textes.txt", texteComplet(donnees, liste));
      telechargerFichier(await zip.generateAsync({ type: "blob" }), `post-${id}.zip`);
    } catch (e) {
      setErreurPartage(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  /** Une seule photo : même logique, à l'échelle de la slide. */
  async function enregistrerUne(slide: PostSlide) {
    setErreurPartage(null);
    const nom = nomFichier(id!, slide.position);
    const dejaPret = (fichiers.data ?? []).find((f) => f.name === nom);

    try {
      const fichier = dejaPret ?? (await recupererFichier(slide.media_library!.url, nom));
      if (peutPartager([fichier])) {
        await partagerFichiers([fichier], nom);
        return;
      }
      telechargerFichier(fichier, nom);
    } catch (e) {
      setErreurPartage(e instanceof Error ? e.message : String(e));
    }
  }

  if (post.isPending || slides.isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!post.data) {
    return <p className="text-sm text-destructive">{t("common.notFoundTitle")}</p>;
  }

  const donnees = post.data;
  const publie = Boolean(donnees.publie_at);
  const tousLesTextes = texteComplet(donnees, liste);

  const nbPhotos = (fichiers.data ?? []).length;
  // Slides dont la photo n'est pas nettoyée : absente OU gardée avec son texte.
  // On le signale plutôt que de laisser publier une image au texte incrusté.
  const slidesNonNettoyees = liste.filter((s) => !estPropre(s)).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      {loupe && <Loupe url={loupe} onClose={() => setLoupe(null)} />}

      <Button variant="outline" size="sm" asChild>
        <Link to="/calendrier">{t("common.back")}</Link>
      </Button>

      {/* Rappel : coller le lien de SON TikTok après publication — c'est ce qui
          alimente les stats. Visible tant que le post n'est pas publié. */}
      {!estAdmin && !publie && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-center text-base font-bold text-destructive">
          {t("posts.rappelLien")}
        </div>
      )}

      {/* 1 — Enregistrer toutes les photos d'un coup, en tête. */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t("posts.title")}</span>
            <div className="flex gap-1.5">
              <Badge variant="secondary">{t(`type.${donnees.type}`)}</Badge>
              <Badge variant={publie ? "success" : "outline"}>
                {t(`statut.${donnees.statut}`)}
              </Badge>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full"
            disabled={enCours || fichiers.isPending || nbPhotos === 0}
            onClick={() => toutEnregistrer(donnees)}
          >
            {peutPartager(fichiers.data ?? []) ? <Share /> : <Download />}
            {fichiers.isPending
              ? t("posts.preparation")
              : t("posts.enregistrerPhotos", { count: nbPhotos })}
          </Button>
          <p className="text-xs text-muted-foreground">{t("posts.enregistrerAide")}</p>

          {slidesNonNettoyees > 0 && (
            <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning">
              {t("posts.slidesNonNettoyees", { count: slidesNonNettoyees })}
            </p>
          )}
          {fichiers.isError && (
            <p className="text-sm text-destructive">{(fichiers.error as Error).message}</p>
          )}
          {erreurPartage && <p className="text-sm text-destructive">{erreurPartage}</p>}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigator.clipboard.writeText(tousLesTextes)}
          >
            <Copy />
            {t("posts.copierTout")}
          </Button>
        </CardContent>
      </Card>

      {/* 2 — Passer sur le téléphone, seulement utile sur ordinateur. */}
      <CarteQr url={window.location.href} />

      {/* 3 — Musique : juste l'accès, sans afficher le lien à rallonge. */}
      {donnees.musique_url && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-5">
            <Music className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t("posts.musique")}</p>
              <p className="text-xs text-muted-foreground">{t("posts.musiqueFavori")}</p>
            </div>
            <Button asChild className="shrink-0">
              <a href={donnees.musique_url} target="_blank" rel="noreferrer">
                {t("posts.ouvrirMusique")}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 3.5 — Description / hashtags à coller dans la légende TikTok. */}
      {donnees.hashtags && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t("posts.hashtagsTitre")}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(donnees.hashtags ?? "")}
              >
                <Copy className="size-3.5" />
                {t("posts.copier")}
              </Button>
            </div>
            <p className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed text-primary">
              {donnees.hashtags}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4 — Les slides : photo à poster, photo d'origine, texte. */}
      <div className="space-y-4">
        {liste.map((slide, index) => (
          <Card key={slide.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t("posts.slide", { position: slide.position })}
                  {slide.position_sophia && <Badge>{t("posts.sophia")}</Badge>}
                </span>
                {!publie && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("posts.monterSlide")}
                      disabled={index === 0 || deplacer.isPending}
                      onClick={() => deplacer.mutate({ index, delta: -1 })}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("posts.descendreSlide")}
                      disabled={index === liste.length - 1 || deplacer.isPending}
                      onClick={() => deplacer.mutate({ index, delta: 1 })}
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                )}
              </div>

              {/* La photo à poster et l'originale côte à côte : c'est en les
                  comparant que le poster retrouve où placer son texte. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {estPropre(slide) ? (
                  <Visuel
                    url={slide.media_library!.url}
                    legende={t("posts.photoAPoster")}
                    onZoom={() => setLoupe(slide.media_library!.url)}
                  />
                ) : slide.media_library?.url ? (
                  // Photo présente mais jamais nettoyée : elle porte encore son
                  // texte. On la montre pour ne pas cacher le problème, mais on
                  // la barre d'un avertissement et on n'en propose pas l'enreg.
                  <figure className="space-y-1.5">
                    <figcaption className="text-xs font-medium uppercase tracking-wide text-warning">
                      {t("posts.photoAvecTexte")}
                    </figcaption>
                    <button
                      type="button"
                      onClick={() => setLoupe(slide.media_library!.url)}
                      className="block w-full"
                    >
                      <img
                        src={slide.media_library.url}
                        alt=""
                        className="w-full rounded-lg border-2 border-warning/60 object-contain"
                      />
                    </button>
                    <p className="text-[11px] text-muted-foreground">
                      {t("posts.photoManquanteAide")}
                    </p>
                  </figure>
                ) : (
                  // Aucune version : on ne montre pas un trou, on signale.
                  <div className="flex flex-col justify-center gap-1 rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4 text-center">
                    <span className="text-xs font-medium text-warning">
                      {t("posts.photoManquante")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("posts.photoManquanteAide")}
                    </span>
                  </div>
                )}
                {slide.reference_url && (
                  <Visuel
                    url={slide.reference_url}
                    legende={t("posts.placementTitre")}
                    onZoom={() => setLoupe(slide.reference_url!)}
                  />
                )}
              </div>

              {estPropre(slide) && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => enregistrerUne(slide)}
                >
                  <Share />
                  {t("posts.enregistrerPhoto")}
                </Button>
              )}

              {slide.texte_overlay && (
                <TexteCopiable texte={slide.texte_overlay} label={t("posts.texteSlide")} />
              )}

              {estAdmin && (
                <ControlesAdminSlide
                  slide={slide}
                  postId={id!}
                  compteReferenceId={refId.data ?? null}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 5 — Validation et publication, en dernier. */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          {publie ? (
            <p className="text-sm text-success">
              {t("posts.publieLe", {
                date: new Date(donnees.publie_at!).toLocaleString(i18n.language),
              })}
            </p>
          ) : (
            <>
              {donnees.statut !== "valide_par_poster" && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={valider.isPending}
                  onClick={() => valider.mutate()}
                >
                  {t("posts.valider")}
                </Button>
              )}

              <div className="space-y-2">
                <Label htmlFor="lien">{t("posts.lienPublie")}</Label>
                <Input
                  id="lien"
                  type="url"
                  inputMode="url"
                  placeholder="https://www.tiktok.com/@..."
                  value={lienPublie}
                  onChange={(e) => setLienPublie(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">{t("posts.lienObligatoireAide")}</p>
              </div>

              {publier.isError && (
                <p className="text-sm text-destructive">
                  {publier.error instanceof Error ? publier.error.message : t("posts.lienObligatoire")}
                </p>
              )}

              <Button
                className="w-full"
                disabled={publier.isPending || !lienPublie.trim()}
                onClick={() => publier.mutate()}
              >
                {publier.isPending ? t("common.saving") : t("posts.marquerPublie")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function texteComplet(post: Post, slides: PostSlide[]): string {
  const lignes = slides
    .filter((s) => s.texte_overlay)
    .map((s) => `Slide ${s.position}\n${s.texte_overlay}`);
  if (post.hashtags) lignes.push(`Description :\n${post.hashtags}`);
  if (post.musique_url) lignes.push(`Musique : ${post.musique_url}`);
  return lignes.join("\n\n");
}
