import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Copy, Download, ExternalLink, Music } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { telechargerUrl } from "@/features/moteur/telechargement";
import { supabase } from "@/lib/supabase/client";

/** Vidéo de pod (pod 3) prévue pour un compte : réaction + démo + textes à coller. */
interface VideoPod {
  id: string;
  date_publication_prevue: string;
  reaction_url: string;
  demo_url: string;
  texte_ecran: string;
  legende: string;
  musique_titre: string | null;
  musique_url: string | null;
  source_url: string | null;
  statut: "a_publier" | "publie" | "annule";
  tiktok_url: string | null;
  instagram_url: string | null;
}

/** Les deux publications d'une vidéo : 'publie' une fois les DEUX liens posés. */
const PLATEFORMES = {
  tiktok_url: { regex: /^https:\/\/(www\.|vm\.)?tiktok\.com\//, placeholder: "https://www.tiktok.com/@…/video/…" },
  instagram_url: { regex: /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\//, placeholder: "https://www.instagram.com/reel/…" },
} as const;
type Colonne = keyof typeof PLATEFORMES;

async function videosDuCompte(compteId: string): Promise<VideoPod[]> {
  const { data, error } = await supabase
    .from("pod_videos")
    .select("id, date_publication_prevue, reaction_url, demo_url, texte_ecran, legende, musique_titre, musique_url, source_url, statut, tiktok_url, instagram_url")
    .eq("compte_id", compteId)
    .neq("statut", "annule")
    .order("date_publication_prevue")
    .limit(30);
  if (error) throw error;
  return (data ?? []) as VideoPod[];
}

function Copier({ texte, libelle }: { texte: string; libelle: string }) {
  const [copie, setCopie] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() =>
        void navigator.clipboard?.writeText(texte).then(() => {
          setCopie(true);
          window.setTimeout(() => setCopie(false), 1500);
        })
      }
    >
      {copie ? <CheckCircle2 /> : <Copy />}
      {libelle}
    </Button>
  );
}

/** Un lien de publication (TikTok ou Reel), enregistré seul dans sa colonne. */
function LienPublication({
  video,
  compteId,
  colonne,
  libelle,
  handle,
}: {
  video: VideoPod;
  compteId: string;
  colonne: Colonne;
  libelle: string;
  handle: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lien, setLien] = React.useState(video[colonne] ?? "");
  const enregistrer = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("pod_videos")
        .update({ [colonne]: lien.trim() })
        .eq("id", video.id)
        .select("statut, tiktok_url, instagram_url")
        .single();
      if (error) throw error;
      // Le second lien posé fait passer la vidéo en publiée (relu en base, pas
      // sur l'état de la carte : les deux liens peuvent partir coup sur coup).
      if (data.tiktok_url && data.instagram_url && data.statut === "a_publier") {
        const { error: e } = await supabase
          .from("pod_videos")
          .update({ statut: "publie", publie_le: new Date().toISOString() })
          .eq("id", video.id);
        if (e) throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pod-videos", compteId] }),
  });
  const { regex, placeholder } = PLATEFORMES[colonne];
  const enregistre = video[colonne];
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        {libelle}
        {handle ? ` · @${handle}` : ""}
      </p>
      {enregistre ? (
        <a className="flex items-center gap-1 truncate text-sm underline" href={enregistre} target="_blank" rel="noreferrer">
          <CheckCircle2 className="size-4 shrink-0 text-primary" />
          {t("videosPod.lienEnregistre")}
        </a>
      ) : (
        <div className="flex flex-wrap gap-2">
          <input
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            placeholder={placeholder}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
            aria-label={libelle}
          />
          <Button size="sm" disabled={!regex.test(lien.trim()) || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            {t("videosPod.enregistrerLien")}
          </Button>
        </div>
      )}
      {enregistrer.error && <p className="text-sm text-destructive">{(enregistrer.error as Error).message}</p>}
    </div>
  );
}

function CarteVideo({
  video,
  compteId,
  handleTiktok,
  handleInstagram,
}: {
  video: VideoPod;
  compteId: string;
  handleTiktok: string | null;
  handleInstagram: string | null;
}) {
  const { t, i18n } = useTranslation();
  const publie = video.statut === "publie";
  // Un seul des deux liens posé : on dit où il reste à publier.
  const reste = !publie && Boolean(video.tiktok_url) !== Boolean(video.instagram_url)
    ? video.tiktok_url
      ? { fait: "TikTok", reste: "Instagram" }
      : { fait: "Instagram", reste: "TikTok" }
    : null;
  const jour = new Date(`${video.date_publication_prevue}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <Card className={publie ? "opacity-70" : "border-primary/30"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold capitalize">{jour}</p>
          {publie ? (
            <Badge variant="success">{t("videosPod.publiee")}</Badge>
          ) : reste ? (
            <Badge variant="secondary">{t("videosPod.reste", reste)}</Badge>
          ) : (
            <Badge variant="secondary">{t("videosPod.video")}</Badge>
          )}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("videosPod.etape1")}</li>
          <li>{t("videosPod.etape2")}</li>
          <li>{t("videosPod.etape3")}</li>
          <li>{t("videosPod.etape4")}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void telechargerUrl(video.reaction_url, "1-reaction.mp4")}>
            <Download />
            {t("videosPod.reaction")}
          </Button>
          <Button size="sm" onClick={() => void telechargerUrl(video.demo_url, "2-demo.mp4")}>
            <Download />
            {t("videosPod.demo")}
          </Button>
        </div>
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t("videosPod.texteEcran")}</p>
          <p>{video.texte_ecran}</p>
          <Copier texte={video.texte_ecran} libelle={t("videosPod.copier")} />
        </div>
        <div className="space-y-1 rounded-md bg-muted/50 p-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t("videosPod.legende")}</p>
          <p>{video.legende}</p>
          <Copier texte={video.legende} libelle={t("videosPod.copier")} />
        </div>
        {video.source_url && (
          <p className="flex items-center gap-1 text-sm">
            <ExternalLink className="size-4" />
            <a className="underline" href={video.source_url} target="_blank" rel="noreferrer">
              {t("videosPod.reference")}
            </a>
          </p>
        )}
        {video.musique_titre && (
          <p className="flex items-center gap-1 text-sm">
            <Music className="size-4" />
            {video.musique_url ? (
              <a className="underline" href={video.musique_url} target="_blank" rel="noreferrer">
                {video.musique_titre}
              </a>
            ) : (
              video.musique_titre
            )}
          </p>
        )}
        <LienPublication video={video} compteId={compteId} colonne="tiktok_url" libelle={t("videosPod.lien")} handle={handleTiktok} />
        <LienPublication
          video={video}
          compteId={compteId}
          colonne="instagram_url"
          libelle={t("videosPod.lienInstagram")}
          handle={handleInstagram}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Vidéos du pod 3 pour le compte actif du poster. Sans vidéo : rien, sauf si
 * `vide` est fourni (compte UGC vidéo, dont c'est l'unique contenu).
 */
export function VideosAPoster({
  compteId,
  handleTiktok = null,
  handleInstagram = null,
  vide,
}: {
  compteId: string;
  handleTiktok?: string | null;
  handleInstagram?: string | null;
  vide?: string;
}) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["pod-videos", compteId], queryFn: () => videosDuCompte(compteId) });
  const videos = (data ?? []).filter((v) => v.statut === "a_publier" || v.statut === "publie").slice(0, 10);
  if (!videos.length) {
    if (!vide) return null;
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{t("videosPod.titre")}</h2>
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{vide}</p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("videosPod.titre")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {videos.map((v) => (
          <CarteVideo key={v.id} video={v} compteId={compteId} handleTiktok={handleTiktok} handleInstagram={handleInstagram} />
        ))}
      </div>
    </section>
  );
}
