import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Copy, Download, Music } from "lucide-react";

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
  statut: "a_publier" | "publie" | "annule";
  tiktok_url: string | null;
}

async function videosDuCompte(compteId: string): Promise<VideoPod[]> {
  const { data, error } = await supabase
    .from("pod_videos")
    .select("id, date_publication_prevue, reaction_url, demo_url, texte_ecran, legende, musique_titre, musique_url, statut, tiktok_url")
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

function CarteVideo({ video, compteId }: { video: VideoPod; compteId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [lien, setLien] = React.useState(video.tiktok_url ?? "");
  const publier = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pod_videos")
        .update({ statut: "publie", tiktok_url: lien.trim(), publie_le: new Date().toISOString() })
        .eq("id", video.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pod-videos", compteId] }),
  });
  const publie = video.statut === "publie";
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
          {publie ? <Badge variant="success">{t("videosPod.publiee")}</Badge> : <Badge variant="secondary">{t("videosPod.video")}</Badge>}
        </div>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("videosPod.etape1")}</li>
          <li>{t("videosPod.etape2")}</li>
          <li>{t("videosPod.etape3")}</li>
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
        {!publie && (
          <div className="flex flex-wrap gap-2">
            <input
              value={lien}
              onChange={(e) => setLien(e.target.value)}
              placeholder="https://www.tiktok.com/@…/video/…"
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              aria-label={t("videosPod.lien")}
            />
            <Button size="sm" disabled={!/^https:\/\/(www\.|vm\.)?tiktok\.com\//.test(lien.trim()) || publier.isPending} onClick={() => publier.mutate()}>
              {t("videosPod.marquerPubliee")}
            </Button>
          </div>
        )}
        {publier.error && <p className="text-sm text-destructive">{(publier.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/** Vidéos du pod 3 pour le compte actif du poster (rien si le compte n'en a pas). */
export function VideosAPoster({ compteId }: { compteId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["pod-videos", compteId], queryFn: () => videosDuCompte(compteId) });
  const videos = (data ?? []).filter((v) => v.statut === "a_publier" || v.statut === "publie").slice(0, 10);
  if (!videos.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("videosPod.titre")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {videos.map((v) => (
          <CarteVideo key={v.id} video={v} compteId={compteId} />
        ))}
      </div>
    </section>
  );
}
