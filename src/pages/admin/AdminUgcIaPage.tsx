import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Clapperboard, Download, ExternalLink, Scissors, Sparkles, Trash2, UserRound } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EtatRequete, TitreCarte } from "@/features/bleo/ui";
import {
  CLE_VIDEOS_UGC_IA,
  couperPassageUgcIa,
  genererVideoUgcIa,
  importerTiktokUgcIa,
  listerPersonasUgcIa,
  listerVideosUgcIa,
  suivreGenerationsUgcIa,
  supprimerVideoUgcIa,
  type PersonaUgcIa,
  type VideoUgcIa,
} from "@/features/ugcIa/api";
import {
  arrondiDixieme,
  erreurPassage,
  lireSecondes,
  passageInitial,
  PASSAGE_MAX_S,
  PASSAGE_MIN_S,
  peutCouper,
  peutGenerer,
  PROMPT_DEFAUT,
  type ResolutionUgcIa,
  type StatutVideoUgcIa,
} from "@/features/ugcIa/logique";

/** Toutes les 15 s tant qu'une génération tourne (Genjutsu prend quelques minutes). */
const INTERVALLE_SUIVI_MS = 15_000;

function messageErreur(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

const VARIANTE_STATUT: Record<StatutVideoUgcIa, "secondary" | "info" | "warning" | "success" | "error"> = {
  importee: "secondary",
  coupee: "info",
  en_cours: "warning",
  prete: "success",
  echec: "error",
};

/**
 * UGC IA : une réaction TikTok qui marche, refaite par un persona synthétique
 * (Sophie pour l'instant) avec Higgsfield Genjutsu. Hors podz ; les vidéos
 * restent ici, dans la bibliothèque de la page.
 */
export function AdminUgcIaPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const personas = useQuery({ queryKey: ["ugc-ia", "personas"], queryFn: listerPersonasUgcIa });
  const videos = useQuery({ queryKey: CLE_VIDEOS_UGC_IA, queryFn: listerVideosUgcIa });
  const persona = personas.data?.[0] ?? null;
  const enCours = (videos.data ?? []).some((v) => v.statut === "en_cours");
  const [erreurSuivi, setErreurSuivi] = React.useState<string | null>(null);

  // Relève Higgsfield tant qu'une génération tourne ; s'arrête tout seul ensuite.
  React.useEffect(() => {
    if (!enCours) return;
    let actif = true;
    // Un relevé à la fois : un rapatriement lent ne doit pas être doublé par le suivant.
    let enVol = false;
    const relever = async () => {
      if (enVol) return;
      enVol = true;
      try {
        await suivreGenerationsUgcIa();
        if (actif) setErreurSuivi(null);
      } catch (e) {
        if (actif) setErreurSuivi(messageErreur(e));
      } finally {
        enVol = false;
      }
      if (actif) await qc.invalidateQueries({ queryKey: CLE_VIDEOS_UGC_IA });
    };
    void relever();
    const minuteur = setInterval(() => void relever(), INTERVALLE_SUIVI_MS);
    return () => {
      actif = false;
      clearInterval(minuteur);
    };
  }, [enCours, qc]);

  return (
    <div className="space-y-6" data-testid="page-ugc-ia">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Clapperboard className="size-6 text-muted-foreground" aria-hidden />
            {t("ugcIa.titre")}
          </span>
        }
        description={t("ugcIa.description")}
      />

      <EtatRequete erreur={personas.error ?? videos.error} chargement={personas.isLoading || videos.isLoading} />

      {personas.data && !persona && <p className="text-sm text-muted-foreground">{t("ugcIa.aucunPersona")}</p>}

      {persona && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <CartePersona persona={persona} />
          <CarteImport persona={persona} />
        </div>
      )}

      <section className="space-y-3" aria-labelledby="ugc-ia-bibliotheque">
        <h2 id="ugc-ia-bibliotheque" className="text-sm font-semibold">
          {t("ugcIa.bibliotheque")}
        </h2>
        {erreurSuivi && (
          <p role="alert" className="text-sm text-destructive">
            {t("ugcIa.erreurSuivi", { message: erreurSuivi })}
          </p>
        )}
        {videos.data && videos.data.length === 0 && (
          <EmptyState icon={<Clapperboard />} title={t("ugcIa.vide")} description={t("ugcIa.videDetail")} />
        )}
        {videos.data?.map((v) => <CarteVideo key={v.id} video={v} persona={persona} />)}
      </section>
    </div>
  );
}

function CartePersona({ persona }: { persona: PersonaUgcIa }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={UserRound}>{t("ugcIa.persona")}</TitreCarte>
      </CardHeader>
      <CardContent className="flex items-start gap-3">
        <img src={persona.image_url} alt={persona.nom} className="size-20 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{persona.nom}</p>
          <p className="text-xs text-muted-foreground">{persona.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CarteImport({ persona }: { persona: PersonaUgcIa }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lien, setLien] = React.useState("");
  const importer = useMutation({
    mutationFn: () => importerTiktokUgcIa(lien.trim(), persona.id),
    onSuccess: async () => {
      setLien("");
      await qc.invalidateQueries({ queryKey: CLE_VIDEOS_UGC_IA });
    },
  });
  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={Sparkles}>{t("ugcIa.nouvelle")}</TitreCarte>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
          <li>{t("ugcIa.etape1")}</li>
          <li>{t("ugcIa.etape2", { min: PASSAGE_MIN_S, max: PASSAGE_MAX_S })}</li>
          <li>{t("ugcIa.etape3", { nom: persona.nom })}</li>
        </ol>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (lien.trim()) importer.mutate();
          }}
        >
          <Input
            className="min-w-0 flex-1"
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            placeholder="https://www.tiktok.com/@…/video/…"
            aria-label={t("ugcIa.lienTiktok")}
          />
          <Button type="submit" loading={importer.isPending} disabled={!lien.trim()}>
            {t("ugcIa.importer")}
          </Button>
        </form>
        {importer.isPending && <p className="text-xs text-muted-foreground">{t("ugcIa.importEnCours")}</p>}
        {importer.error && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(importer.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CarteVideo({ video, persona }: { video: VideoUgcIa; persona: PersonaUgcIa | null }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const rafraichir = () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_UGC_IA });
  const supprimer = useMutation({ mutationFn: () => supprimerVideoUgcIa(video.id), onSuccess: rafraichir });
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(video.created_at));
  const vues = video.source_vues != null ? new Intl.NumberFormat(i18n.language, { notation: "compact" }).format(video.source_vues) : null;

  return (
    <Card data-testid={`video-${video.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <Badge variant={VARIANTE_STATUT[video.statut]}>{t(`ugcIa.statut.${video.statut}`)}</Badge>
          <a href={video.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            {t("ugcIa.source")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          {vues && <span className="text-muted-foreground">{t("ugcIa.vues", { vues })}</span>}
          <span className="text-muted-foreground">{date}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={supprimer.isPending}
          onClick={() => {
            if (window.confirm(t(video.statut === "en_cours" ? "ugcIa.confirmerSuppressionEnCours" : "ugcIa.confirmerSuppression"))) supprimer.mutate();
          }}
        >
          <Trash2 aria-hidden />
          {t("ugcIa.supprimer")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {video.source_texte && <p className="line-clamp-2 text-xs text-muted-foreground">« {video.source_texte} »</p>}
        {video.erreur && (
          <p role="alert" className="text-sm text-destructive">
            {video.erreur}
          </p>
        )}
        {supprimer.error && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(supprimer.error)}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {peutCouper(video.statut) && video.brut_url && <BlocCoupe video={video} />}
          {video.coupe_url && (
            <figure className="space-y-1.5">
              <figcaption className="text-xs font-medium">{t("ugcIa.passage", { debut: video.debut_s, fin: video.fin_s })}</figcaption>
              <video src={video.coupe_url} controls muted playsInline className="aspect-[9/16] w-full rounded-lg bg-black object-contain" />
            </figure>
          )}
          {peutGenerer(video) && <BlocGeneration video={video} persona={persona} />}
          {video.statut === "en_cours" && (
            <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
              <Spinner />
              <p>{t("ugcIa.enCours")}</p>
              <p className="text-xs">{t("ugcIa.enCoursDetail")}</p>
            </div>
          )}
          {video.statut === "prete" && video.video_url && (
            <figure className="space-y-1.5">
              <figcaption className="flex items-center justify-between gap-2 text-xs font-medium">
                {t("ugcIa.resultat", { nom: persona?.nom ?? "" })}
                <a href={video.video_url} download className="inline-flex items-center gap-1 underline">
                  <Download className="size-3" aria-hidden />
                  {t("ugcIa.telecharger")}
                </a>
              </figcaption>
              <video src={video.video_url} controls playsInline className="aspect-[9/16] w-full rounded-lg bg-black object-contain" />
            </figure>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** La vidéo TikTok entière et le passage à garder (début, fin). */
function BlocCoupe({ video }: { video: VideoUgcIa }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lecteur = React.useRef<HTMLVideoElement>(null);
  const initial = passageInitial(video);
  const [debut, setDebut] = React.useState(initial.debut);
  const [fin, setFin] = React.useState(initial.fin);
  const d = lireSecondes(debut);
  const f = lireSecondes(fin);
  const erreur = erreurPassage(d, f, video.source_duree_s);
  const couper = useMutation({
    mutationFn: () => couperPassageUgcIa(video.id, d ?? 0, f ?? 0),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_UGC_IA }),
  });
  const maintenant = () => arrondiDixieme(lecteur.current?.currentTime ?? 0);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        {t("ugcIa.videoSource")}
        {video.source_duree_s != null && <span className="text-muted-foreground"> · {Math.round(video.source_duree_s)} s</span>}
      </p>
      <video ref={lecteur} src={video.brut_url ?? undefined} controls muted playsInline className="aspect-[9/16] w-full rounded-lg bg-black object-contain" />
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["debut", debut, setDebut],
            ["fin", fin, setFin],
          ] as const
        ).map(([cle, valeur, changer]) => (
          <div key={cle} className="space-y-1 text-xs">
            <label className="block space-y-1">
              <span className="text-muted-foreground">{t(`ugcIa.${cle}`)}</span>
              <Input size="sm" inputMode="decimal" value={valeur} onChange={(e) => changer(e.target.value)} />
            </label>
            <Button variant="link" size="xs" onClick={() => changer(maintenant())}>
              {t("ugcIa.prendreTemps")}
            </Button>
          </div>
        ))}
      </div>
      {erreur && <p className="text-xs text-destructive">{t(`ugcIa.erreurPassage.${erreur}`, { min: PASSAGE_MIN_S, max: PASSAGE_MAX_S })}</p>}
      <Button variant="outline" size="sm" className="w-full" loading={couper.isPending} disabled={erreur != null} onClick={() => couper.mutate()}>
        <Scissors aria-hidden />
        {video.coupe_url ? t("ugcIa.recouper") : t("ugcIa.couper")}
      </Button>
      {couper.error && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(couper.error)}
        </p>
      )}
    </div>
  );
}

const RESOLUTIONS: ReadonlyArray<{ cle: ResolutionUgcIa; contenu: string }> = [
  { cle: "480p", contenu: "480p" },
  { cle: "720p", contenu: "720p" },
  { cle: "1080p", contenu: "1080p" },
];

/** Le prompt, la résolution et le bouton qui lance Genjutsu (facturé). */
function BlocGeneration({ video, persona }: { video: VideoUgcIa; persona: PersonaUgcIa | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [prompt, setPrompt] = React.useState(video.prompt || PROMPT_DEFAUT);
  const [resolution, setResolution] = React.useState<ResolutionUgcIa>(video.resolution ?? "720p");
  const generer = useMutation({
    mutationFn: () => genererVideoUgcIa(video.id, prompt, resolution),
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_UGC_IA }),
  });

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{t("ugcIa.generation")}</p>
      <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} aria-label={t("ugcIa.prompt")} />
      <Segments libelle={t("ugcIa.resolution")} options={RESOLUTIONS} actif={resolution} onChange={setResolution} />
      <p className="text-xs text-muted-foreground">{t("ugcIa.facturation")}</p>
      <Button size="sm" className="w-full" loading={generer.isPending} onClick={() => generer.mutate()}>
        <Sparkles aria-hidden />
        {video.statut === "echec" ? t("ugcIa.relancer") : t("ugcIa.generer", { nom: persona?.nom ?? "" })}
      </Button>
      {generer.error && (
        <p role="alert" className="text-xs text-destructive">
          {messageErreur(generer.error)}
        </p>
      )}
    </div>
  );
}
