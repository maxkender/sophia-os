import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, Film, Share } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Post } from "@/features/moteur/types";
import {
  partagerFichiers,
  peutPartager,
  recupererFichier,
  telechargerChacun,
  telechargerFichier,
} from "@/features/moteur/telechargement";

import { listerVideosPost, type VideoDuPost } from "./api";

function nomVideo(postId: string, position: number): string {
  return `${postId.slice(0, 8)}-video-${position}.mp4`;
}

/**
 * Post vidéo (comptes UGCV, 0662) : à la place des slides, les vidéos à
 * enregistrer et à mettre bout à bout dans l'ordre, puis le CTA (un texte à
 * placer comme sur la capture, ou rien s'il est déjà dans la vidéo). La
 * légende, le son et le lien restent ceux de la page de post.
 */
export function PostVideoPoster({ post }: { post: Post }) {
  const { t } = useTranslation();
  const videos = useQuery({ queryKey: ["post-videos", post.id], queryFn: () => listerVideosPost(post.id) });
  const [enCours, setEnCours] = React.useState<number | "toutes" | null>(null);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const liste = videos.data ?? [];

  async function enregistrer(choix: VideoDuPost[], cle: number | "toutes") {
    setErreur(null);
    setEnCours(cle);
    try {
      const fichiers: File[] = [];
      for (const v of choix) fichiers.push(await recupererFichier(v.url, nomVideo(post.id, v.position)));
      if (peutPartager(fichiers)) {
        try {
          await partagerFichiers(fichiers, t("postVideo.titre"));
          return;
        } catch {
          // Feuille de partage en panne : on télécharge plutôt que de bloquer.
        }
      }
      if (fichiers.length === 1) telechargerFichier(fichiers[0], fichiers[0].name);
      else await telechargerChacun(fichiers);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="post-video">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Film className="size-5 text-primary" aria-hidden />
            <p className="text-sm font-medium">{t("postVideo.titre")}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            {liste.length > 1 ? t("postVideo.aideBoutABout", { count: liste.length }) : t("postVideo.aideUne")}
          </p>
          {videos.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {videos.isError && <p className="text-sm text-destructive">{(videos.error as Error).message}</p>}
          {liste.length > 1 && (
            <Button size="lg" className="w-full" disabled={enCours != null} onClick={() => void enregistrer(liste, "toutes")}>
              <Download />
              {enCours === "toutes" ? t("posts.preparation") : t("postVideo.enregistrerToutes", { count: liste.length })}
            </Button>
          )}
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        </CardContent>
      </Card>

      {liste.map((v) => (
        <Card key={v.id} data-testid={`post-video-${v.position}`}>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">{t("postVideo.video", { position: v.position, total: liste.length })}</p>
            <video src={v.url} controls playsInline preload="metadata" className="mx-auto max-h-96 w-full rounded-lg bg-black object-contain" />
            <Button variant="outline" className="w-full" disabled={enCours != null} onClick={() => void enregistrer([v], v.position)}>
              <Share />
              {enCours === v.position ? t("posts.preparation") : t("postVideo.enregistrer")}
            </Button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-medium">{t("postVideo.ctaTitre")}</p>
          {post.video_cta_incruste ? (
            <p className="rounded-lg bg-muted/60 p-3 text-sm">{t("postVideo.ctaIncruste")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("postVideo.ctaAide")}</p>
              {post.video_cta_texte && <TexteACopier texte={post.video_cta_texte} />}
              {post.video_capture_url && (
                <figure className="space-y-1.5">
                  <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("postVideo.capture")}
                  </figcaption>
                  <a href={post.video_capture_url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={post.video_capture_url}
                      alt={t("postVideo.capture")}
                      className="mx-auto max-h-[28rem] rounded-lg border object-contain"
                    />
                  </a>
                </figure>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Tout le bloc se tape pour copier : sur mobile, viser un petit bouton est pénible. */
function TexteACopier({ texte }: { texte: string }) {
  const { t } = useTranslation();
  const [copie, setCopie] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
          setCopie(true);
          window.setTimeout(() => setCopie(false), 2000);
        } catch {
          // Presse-papier refusé : le texte reste sélectionnable.
        }
      }}
      className="w-full rounded-lg border bg-muted/60 p-4 text-left transition active:scale-[0.99]"
    >
      <span className="block whitespace-pre-wrap break-words text-base leading-relaxed">{texte}</span>
      <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
        {copie ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copie ? t("posts.copie") : t("posts.taperPourCopier")}
      </span>
    </button>
  );
}
