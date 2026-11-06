import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, CalendarDays, CalendarPlus, ExternalLink, Film, ImageUp, Trash2, Type, Upload, UserRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TitreCarte } from "@/features/bleo/ui";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { aujourdhui } from "@/features/moteur/api";
import { ID_SOPHIA } from "@/features/moteur/multiApp";

import {
  CLE_COMPTES_UGCV,
  CLE_POSTS_VIDEO,
  creerPostVideo,
  listerComptesUgcv,
  listerPostsVideo,
  supprimerFichiersPost,
  supprimerPostVideo,
  televerserPourPost,
  type CompteUgcv,
  type PersonaUgcIa,
  type PostVideoUgcv,
  type SourceUgcIa,
} from "./api";
import { deplacer, LEGENDE_MAX, manquePostVideo, messageErreur, VIDEOS_MAX_PAR_POST, videosDisponibles, type VideoChoisie } from "./logique";

/**
 * Posts vidéo des comptes UGCV (0662) : c'est l'admin qui les pose, un par jour
 * et par compte. Le poster les retrouve dans son calendrier comme ses autres
 * posts, et ils comptent pareil (paie, relances, planning, vues).
 */
export function CartePostsUgcv({ sources, personas }: { sources: SourceUgcIa[]; personas: PersonaUgcIa[] }) {
  const { t } = useTranslation();
  const posts = useQuery({ queryKey: CLE_POSTS_VIDEO, queryFn: listerPostsVideo });
  const comptes = useQuery({ queryKey: CLE_COMPTES_UGCV, queryFn: listerComptesUgcv });
  const [ouvert, setOuvert] = React.useState(false);
  const liste = posts.data ?? [];

  return (
    <Card data-testid="posts-ugcv">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <TitreCarte icone={Film}>{t("ugcIa.posts.titre")}</TitreCarte>
        <Button size="sm" onClick={() => setOuvert(true)} disabled={(comptes.data ?? []).length === 0}>
          <CalendarPlus aria-hidden />
          {t("ugcIa.posts.creer")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("ugcIa.posts.aide")}</p>
        {comptes.data && comptes.data.length === 0 && <p className="text-xs text-muted-foreground">{t("ugcIa.posts.sansCompte")}</p>}
        {posts.error && <p className="text-sm text-destructive">{messageErreur(posts.error)}</p>}
        {posts.data && liste.length === 0 && <p className="text-sm text-muted-foreground">{t("ugcIa.posts.aucun")}</p>}
        <ul className="divide-y">
          {liste.map((p) => (
            <LignePost key={p.id} post={p} />
          ))}
        </ul>
      </CardContent>
      {ouvert && (
        <DialogueNouveauPost
          sources={sources}
          personas={personas}
          comptes={comptes.data ?? []}
          postsExistants={liste}
          fermer={() => setOuvert(false)}
        />
      )}
    </Card>
  );
}

function LignePost({ post: p }: { post: PostVideoUgcv }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const supprimer = useMutation({
    mutationFn: () => supprimerPostVideo(p.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE_POSTS_VIDEO }),
  });
  const publie = Boolean(p.publie_at);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid={`post-ugcv-${p.id}`}>
      <span className="inline-flex items-center gap-1 font-medium tabular-nums">
        <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
        {p.date_publication_prevue}
      </span>
      <span className="inline-flex items-center gap-1">
        <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
        {p.handle_tiktok ? `@${p.handle_tiktok}` : "—"}
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Film className="size-3.5" aria-hidden />
        {t("ugcIa.posts.nbVideos", { count: p.videos.length })}
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Type className="size-3.5" aria-hidden />
        {p.video_cta_incruste ? t("ugcIa.posts.ctaIncruste") : t("ugcIa.posts.ctaTexte")}
      </span>
      <Badge variant={publie ? "success" : "outline"}>{publie ? t("ugcIa.posts.publie") : t("ugcIa.posts.aPublier")}</Badge>
      <span className="ml-auto flex items-center gap-1">
        {p.publie_url && (
          <Button variant="ghost" size="xs" asChild>
            <a href={p.publie_url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              TikTok
            </a>
          </Button>
        )}
        <Button variant="ghost" size="xs" asChild>
          <Link to={`/admin/posts/${p.id}`}>{t("ugcIa.posts.voir")}</Link>
        </Button>
        {!publie && (
          <Button
            variant="ghost"
            size="xs"
            loading={supprimer.isPending}
            aria-label={t("ugcIa.posts.supprimer")}
            onClick={() => window.confirm(t("ugcIa.posts.confirmerSuppression")) && supprimer.mutate()}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </span>
      {supprimer.error && <p className="basis-full text-xs text-destructive">{messageErreur(supprimer.error)}</p>}
    </li>
  );
}

function libelleCompte(c: CompteUgcv, persona: PersonaUgcIa | undefined): string {
  const nom = c.handle_tiktok ? `@${c.handle_tiktok}` : (c.persona_nom ?? c.id.slice(0, 8));
  return [nom, c.poster_prenom, persona ? `${persona.nom}` : null].filter(Boolean).join(" · ");
}

function DialogueNouveauPost({
  sources,
  personas,
  comptes,
  postsExistants,
  fermer,
}: {
  sources: SourceUgcIa[];
  personas: PersonaUgcIa[];
  comptes: CompteUgcv[];
  postsExistants: PostVideoUgcv[];
  fermer: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { applications } = useApplication();
  // Un dossier par post en cours de création : ses imports partent avec lui s'il est abandonné.
  const [dossier] = React.useState(() => crypto.randomUUID());
  const [compteId, setCompteId] = React.useState(comptes.length === 1 ? comptes[0].id : "");
  const [date, setDate] = React.useState(aujourdhui());
  const [videos, setVideos] = React.useState<VideoChoisie[]>([]);
  const [ctaIncruste, setCtaIncruste] = React.useState(false);
  const [ctaTouche, setCtaTouche] = React.useState(false);
  const [ctaTexte, setCtaTexte] = React.useState("");
  const [captureUrl, setCaptureUrl] = React.useState<string | null>(null);
  /** La capture importée (sinon celle de la source, qui reste à sa source). */
  const [captureChemin, setCaptureChemin] = React.useState<string | null>(null);
  const [legende, setLegende] = React.useState("");
  const [musiqueUrl, setMusiqueUrl] = React.useState("");
  const [musiqueTitre, setMusiqueTitre] = React.useState("");
  const [applicationId, setApplicationId] = React.useState(ID_SOPHIA);
  const [imports, setImports] = React.useState<string[]>([]);
  const [envoi, setEnvoi] = React.useState<"video" | "capture" | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = React.useState<string | null>(null);

  const personaDuCompte = (id: string) => personas.find((p) => p.compte_id === id);
  const groupes = videosDisponibles(sources, personas, { montee: t("ugcIa.posts.montee"), telephone: t("ugcIa.posts.telephone") });
  const options = new Map(groupes.flatMap((g) => g.options.map((o) => [o.cle, o] as const)));
  const dejaCeJour = postsExistants.some((p) => p.compte_id === compteId && p.date_publication_prevue === date);

  /** Une vidéo de la page : la première d'une source remplit le CTA, la capture, la légende et le son. */
  const ajouterDeLaPage = (cle: string) => {
    const o = options.get(cle);
    if (!o || videos.some((v) => v.cle === cle)) return;
    setVideos((avant) => [...avant, o]);
    const source = sources.find((s) => s.id === o.sourceId);
    if (!source) return;
    if (!ctaTouche && o.ctaIncruste) setCtaIncruste(true);
    if (!ctaTexte && source.cta_texte) setCtaTexte(source.cta_texte);
    if (!captureUrl && source.cta_image_url) setCaptureUrl(source.cta_image_url);
    if (!legende && source.source_texte) setLegende(source.source_texte);
    if (!musiqueUrl && source.musique_url) {
      setMusiqueUrl(source.musique_url);
      setMusiqueTitre(source.musique_titre ?? "");
    }
  };

  const importer = async (fichiers: FileList | null, quoi: "video" | "capture") => {
    if (!fichiers || fichiers.length === 0) return;
    setErreurEnvoi(null);
    setEnvoi(quoi);
    try {
      for (const f of Array.from(quoi === "capture" ? [fichiers[0]] : fichiers)) {
        const { url, chemin } = await televerserPourPost(f, dossier);
        setImports((avant) => [...avant, chemin]);
        if (quoi === "capture") {
          setCaptureUrl(url);
          setCaptureChemin(chemin);
        }
        else setVideos((avant) => [...avant, { cle: `imp:${chemin}`, url, chemin, nom: f.name }]);
      }
    } catch (e) {
      setErreurEnvoi(messageErreur(e));
    } finally {
      setEnvoi(null);
    }
  };

  const manque = manquePostVideo({ compteId, date, videos, ctaIncruste, ctaTexte, captureUrl, legende });
  const creer = useMutation({
    mutationFn: () =>
      creerPostVideo({
        compteId,
        date,
        videos: videos.map((v) => ({ url: v.url, chemin: v.chemin ?? null, nom: v.nom, generationId: v.generationId ?? null })),
        ctaTexte: ctaIncruste ? null : ctaTexte,
        ctaIncruste,
        captureUrl: ctaIncruste ? null : captureUrl,
        legende: legende.trim() || null,
        musiqueUrl: musiqueUrl.trim() || null,
        musiqueTitre: musiqueTitre.trim() || null,
        applicationId,
      }),
    onSuccess: async () => {
      // Les imports restés hors du post (vidéo retirée, capture remplacée) partent.
      const gardes = new Set([...videos.map((v) => v.chemin), ctaIncruste ? null : captureChemin].filter(Boolean));
      await supprimerFichiersPost(imports.filter((c) => !gardes.has(c))).catch(() => undefined);
      await qc.invalidateQueries({ queryKey: CLE_POSTS_VIDEO });
      fermer();
    },
  });

  const abandonner = () => {
    void supprimerFichiersPost(imports).catch(() => undefined);
    fermer();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && abandonner()}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t("ugcIa.posts.nouveau")}</DialogTitle>
          <DialogDescription>{t("ugcIa.posts.nouveauAide")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5 pb-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-muted-foreground">{t("ugcIa.posts.compte")}</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={compteId}
                onChange={(e) => setCompteId(e.target.value)}
                aria-label={t("ugcIa.posts.compte")}
              >
                <option value="">{t("ugcIa.posts.choisirCompte")}</option>
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {libelleCompte(c, personaDuCompte(c.id))}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs font-medium text-muted-foreground">{t("ugcIa.posts.jour")}</span>
              <Input type="date" value={date} min={aujourdhui()} onChange={(e) => setDate(e.target.value)} aria-label={t("ugcIa.posts.jour")} />
            </label>
            {dejaCeJour && <p className="text-xs text-destructive sm:col-span-2">{t("ugcIa.posts.dejaCeJour")}</p>}
          </section>

          <section className="space-y-2" aria-label={t("ugcIa.posts.videos")}>
            <h3 className="text-sm font-semibold">{t("ugcIa.posts.videos")}</h3>
            <p className="text-xs text-muted-foreground">{t("ugcIa.posts.videosAide")}</p>
            {videos.length > 0 && (
              <ol className="space-y-1.5">
                {videos.map((v, i) => (
                  <li key={v.cle} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <span className="w-5 text-muted-foreground tabular-nums">{i + 1}.</span>
                    <a href={v.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                      {v.nom}
                    </a>
                    <Button variant="ghost" size="icon-xs" aria-label={t("ugcIa.posts.monter")} disabled={i === 0} onClick={() => setVideos(deplacer(videos, i, -1))}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("ugcIa.posts.descendre")}
                      disabled={i === videos.length - 1}
                      onClick={() => setVideos(deplacer(videos, i, 1))}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label={t("ugcIa.posts.retirer")} onClick={() => setVideos(videos.filter((x) => x.cle !== v.cle))}>
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                value=""
                disabled={groupes.length === 0 || videos.length >= VIDEOS_MAX_PAR_POST}
                onChange={(e) => ajouterDeLaPage(e.target.value)}
                aria-label={t("ugcIa.posts.ajouterDeLaPage")}
              >
                <option value="">{groupes.length === 0 ? t("ugcIa.posts.aucuneVideoPage") : t("ugcIa.posts.ajouterDeLaPage")}</option>
                {groupes.map((g) => (
                  <optgroup key={g.sourceId} label={g.titre}>
                    {g.options.map((o) => (
                      <option key={o.cle} value={o.cle} disabled={videos.some((v) => v.cle === o.cle)}>
                        {o.nom}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <Button variant="outline" size="sm" asChild disabled={envoi != null || videos.length >= VIDEOS_MAX_PAR_POST}>
                <label className="cursor-pointer">
                  <Upload aria-hidden />
                  {envoi === "video" ? t("ugcIa.posts.envoi") : t("ugcIa.posts.importerVideo")}
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    className="sr-only"
                    disabled={envoi != null || videos.length >= VIDEOS_MAX_PAR_POST}
                    aria-label={t("ugcIa.posts.importerVideo")}
                    onChange={(e) => {
                      void importer(e.target.files, "video");
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
            </div>
          </section>

          <section className="space-y-2" aria-label={t("ugcIa.posts.cta")}>
            <h3 className="text-sm font-semibold">{t("ugcIa.posts.cta")}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ctaIncruste}
                onChange={(e) => {
                  setCtaTouche(true);
                  setCtaIncruste(e.target.checked);
                }}
              />
              {t("ugcIa.posts.ctaDejaIncruste")}
            </label>
            {!ctaIncruste && (
              <>
                <Textarea value={ctaTexte} onChange={(e) => setCtaTexte(e.target.value)} rows={2} aria-label={t("ugcIa.posts.ctaTexteChamp")} />
                <div className="flex flex-wrap items-start gap-3">
                  {captureUrl ? (
                    <img src={captureUrl} alt={t("ugcIa.posts.capture")} className="h-40 rounded-md border object-contain" />
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("ugcIa.posts.captureAide")}</p>
                  )}
                  <Button variant="outline" size="sm" asChild disabled={envoi != null}>
                    <label className="cursor-pointer">
                      <ImageUp aria-hidden />
                      {envoi === "capture" ? t("ugcIa.posts.envoi") : captureUrl ? t("ugcIa.posts.remplacerCapture") : t("ugcIa.posts.importerCapture")}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={envoi != null}
                        aria-label={t("ugcIa.posts.importerCapture")}
                        onChange={(e) => {
                          void importer(e.target.files, "capture");
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className="space-y-2">
            <label className="block space-y-1 text-sm">
              <span className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>{t("ugcIa.posts.legende")}</span>
                <span className="tabular-nums">
                  {legende.length}/{LEGENDE_MAX}
                </span>
              </span>
              <Textarea value={legende} onChange={(e) => setLegende(e.target.value)} rows={3} aria-label={t("ugcIa.posts.legende")} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-muted-foreground">{t("ugcIa.posts.son")}</span>
                <Input
                  value={musiqueUrl}
                  onChange={(e) => {
                    setMusiqueUrl(e.target.value);
                    setMusiqueTitre("");
                  }}
                  placeholder="https://www.tiktok.com/music/…" aria-label={t("ugcIa.posts.son")} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-muted-foreground">{t("ugcIa.posts.application")}</span>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={applicationId}
                  onChange={(e) => setApplicationId(e.target.value)}
                  aria-label={t("ugcIa.posts.application")}
                >
                  {(applications.length > 0 ? applications : [{ id: ID_SOPHIA, nom: "Sophia" }]).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nom}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button loading={creer.isPending} disabled={manque != null || dejaCeJour || envoi != null} onClick={() => creer.mutate()}>
              <CalendarPlus aria-hidden />
              {t("ugcIa.posts.creerLePost")}
            </Button>
            <Button variant="ghost" onClick={abandonner}>
              {t("common.cancel")}
            </Button>
            {manque && <span className="text-xs text-muted-foreground">{t(`ugcIa.posts.manque.${manque}`, { max: VIDEOS_MAX_PAR_POST })}</span>}
          </div>
          {(creer.error || erreurEnvoi) && (
            <p role="alert" className="text-sm text-destructive">
              {erreurEnvoi ?? messageErreur(creer.error)}
            </p>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
