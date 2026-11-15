import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArrowRight,
  Bot,
  Check,
  Clapperboard,
  Download,
  Film,
  Globe2,
  KeyRound,
  Plus,
  Scissors,
  Settings2,
  Trash2,
  UserRound,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Replie } from "@/components/ui/replie";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";
import { EtatRequete } from "@/features/bleo/ui";
import { lienTelechargement, nomFichierMotion } from "@/features/motion/telechargement";
import { ZoneCapture } from "@/features/motion/ZoneCapture";
import {
  archiverVideoMotion,
  CLE_COMPTES_MOTION,
  CLE_VIDEOS_MOTION,
  type CompteMotion,
  creerVideoMotion,
  demanderScriptMotion,
  deposerCaptureMotion,
  genererJetonMotion,
  type LangueMotion,
  listerComptesMotion,
  listerVideosMotion,
  majScriptMotion,
  rejeterLangueMotion,
  STYLES_MOTION,
  type StyleMotion,
  validerLangueMotion,
  validerScriptMotion,
  type VideoMotion,
} from "@/features/motion/api";
import {
  type ActionMotion,
  attendLaPilote,
  comptesDeLaLangue,
  dernieresLignes,
  type EtatEtape,
  etapesVideo,
  type GroupeMotion,
  GROUPES_MOTION,
  groupeVideo,
  LANGUES_MOTION,
  languePiloteDe,
  languesOrdonnees,
  moteurAuTravail,
  ongletParDefaut,
  prochaineAction,
  type ScriptEditable,
  ajouterScene,
  ANIMATION_MAX,
  problemeScript,
  SCENES_MAX,
  scriptEditable,
  scriptModifie,
  supprimerScene,
  scriptsDifferents,
  VARIANTE_LANGUE,
  VARIANTE_VIDEO,
} from "@/features/motion/logique";
import { messageErreur } from "@/features/ugcIa/logique";
import { cn } from "@/lib/utils";

/** Toutes les 10 s tant que le moteur travaille (script demandé, langues à rendre). */
const INTERVALLE_SUIVI_MS = 10_000;

const ICONE_STYLE: Record<StyleMotion, typeof Scissors> = { papier: Scissors, geographie: Globe2 };

type Onglet = "videos" | "script" | "details";

/**
 * Motion : une vidéo explicative (papier découpé ou carte), refaite dans
 * plusieurs langues par le moteur (une session Claude Code hors podz), validée
 * ici langue par langue puis postée sur le compte MOTION de la langue.
 *
 * La page dit d'abord qui a la main : la liste range les vidéos par « à toi de
 * jouer / le moteur travaille / terminées », et chaque vidéo montre ses étapes
 * et la prochaine chose à faire.
 */
export function AdminMotionPage() {
  const { t } = useTranslation();
  const videos = useQuery({
    queryKey: CLE_VIDEOS_MOTION,
    queryFn: listerVideosMotion,
    refetchInterval: (q) => (moteurAuTravail(q.state.data ?? []) ? INTERVALLE_SUIVI_MS : false),
  });
  const comptes = useQuery({ queryKey: CLE_COMPTES_MOTION, queryFn: listerComptesMotion });
  const [choisie, setChoisie] = React.useState<string | null>(null);
  const [nouveau, setNouveau] = React.useState(false);
  const [reglages, setReglages] = React.useState(false);
  const liste = videos.data ?? [];
  const video =
    liste.find((v) => v.id === choisie) ??
    liste.find((v) => groupeVideo(v) === "a_toi") ??
    liste.find((v) => v.statut !== "archive") ??
    null;
  const sansCompte = LANGUES_MOTION.filter((l) => comptesDeLaLangue(comptes.data ?? [], l).length === 0).length;
  const travaille = moteurAuTravail(liste);

  return (
    <div className="space-y-5" data-testid="page-motion">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Film className="size-6 text-muted-foreground" aria-hidden />
            {t("motion.titre")}
          </span>
        }
        description={t("motion.description")}
        actions={
          <>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                travaille ? "border-info/40 text-info-foreground" : "text-muted-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", travaille ? "animate-pulse bg-info" : "bg-muted-foreground/40")} aria-hidden />
              {travaille ? t("motion.moteurActif") : t("motion.moteurRepos")}
            </span>
            <Button variant="outline" onClick={() => setReglages(true)}>
              <Settings2 aria-hidden />
              {t("motion.reglages")}
              {sansCompte > 0 && (
                <Badge variant="warning" size="sm">
                  {sansCompte}
                </Badge>
              )}
            </Button>
            <Button onClick={() => setNouveau(true)}>
              <Plus aria-hidden />
              {t("motion.nouveau")}
            </Button>
          </>
        }
      />

      <EtatRequete erreur={videos.error} chargement={videos.isLoading} />

      {videos.data && liste.length === 0 && (
        <EmptyState
          icon={<Clapperboard />}
          title={t("motion.vide")}
          description={t("motion.videDetail")}
          action={
            <Button onClick={() => setNouveau(true)}>
              <Plus aria-hidden />
              {t("motion.nouveau")}
            </Button>
          }
        />
      )}

      {liste.length > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <ListeVideos videos={liste} choisie={video?.id ?? null} onChoisir={setChoisie} />
          {video ? (
            <DetailVideo key={video.id} video={video} comptes={comptes.data ?? []} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("motion.aucuneVideoChoisie")}</p>
          )}
        </div>
      )}

      <DialogueNouveauSujet
        ouvert={nouveau}
        onOuvert={setNouveau}
        onCree={(id) => {
          setChoisie(id);
          setNouveau(false);
        }}
      />
      <DialogueReglages ouvert={reglages} onOuvert={setReglages} comptes={comptes.data ?? []} erreur={comptes.error} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

function ListeVideos({ videos, choisie, onChoisir }: { videos: VideoMotion[]; choisie: string | null; onChoisir: (id: string) => void }) {
  const { t } = useTranslation();
  const parGroupe = React.useMemo(() => {
    const g = new Map<GroupeMotion, VideoMotion[]>(GROUPES_MOTION.map((x) => [x, []]));
    for (const v of videos) g.get(groupeVideo(v))!.push(v);
    return g;
  }, [videos]);

  return (
    <nav className="space-y-4 lg:sticky lg:top-4" aria-label={t("motion.videos")}>
      {GROUPES_MOTION.map((g) => {
        const items = parGroupe.get(g)!;
        if (items.length === 0) return null;
        const contenu = (
          <ul className="space-y-1.5">
            {items.map((v) => (
              <li key={v.id}>
                <ElementListe video={v} choisie={v.id === choisie} onChoisir={onChoisir} />
              </li>
            ))}
          </ul>
        );
        if (g === "archive")
          return (
            <Replie key={g} titre={`${t(`motion.groupes.${g}`)} (${items.length})`} className="bg-transparent">
              {contenu}
            </Replie>
          );
        return (
          <section key={g} className="space-y-1.5">
            <h2 className="flex items-center gap-1.5 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g === "a_toi" ? <UserRound className="size-3.5" aria-hidden /> : g === "moteur" ? <Bot className="size-3.5" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              {t(`motion.groupes.${g}`)}
              <span className="tabular-nums">· {items.length}</span>
            </h2>
            {contenu}
          </section>
        );
      })}
    </nav>
  );
}

function ElementListe({ video: v, choisie, onChoisir }: { video: VideoMotion; choisie: boolean; onChoisir: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const Icone = ICONE_STYLE[v.style ?? "papier"];
  const pilote = languePiloteDe(v.langues_visees?.length ? v.langues_visees : v.langues.map((l) => l.langue));
  return (
    <button
      type="button"
      onClick={() => onChoisir(v.id)}
      aria-current={choisie ? "true" : undefined}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
        choisie ? "border-primary bg-accent/40 ring-1 ring-primary/30" : "bg-card",
      )}
    >
      <div className="flex items-start gap-2">
        <Icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={t(`motion.styles.${v.style ?? "papier"}.nom`)} />
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">{v.sujet}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 pl-6">
        <Badge variant={VARIANTE_VIDEO[v.statut]} size="sm">
          {t(`motion.statutVideo.${v.statut}`)}
        </Badge>
        {languesOrdonnees(v.langues, pilote).map((l) => (
          <Badge key={l.langue} variant={VARIANTE_LANGUE[l.statut]} size="sm" title={t(`motion.statutLangue.${l.statut}`)}>
            {l.langue.toUpperCase()}
          </Badge>
        ))}
      </div>
      <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground">{t("motion.majDepuis", { quand: depuis(v.updated_at, i18n.language) })}</p>
    </button>
  );
}

/** « il y a 3 h », « hier »… */
function depuis(date: string, langue: string): string {
  const s = (new Date(date).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(langue, { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

/* ------------------------------------------------------------------ */
/* Détail                                                              */
/* ------------------------------------------------------------------ */

function DetailVideo({ video, comptes }: { video: VideoMotion; comptes: CompteMotion[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const archiver = useMutation({
    mutationFn: () => archiverVideoMotion(video.id),
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION }),
  });
  const [onglet, setOnglet] = React.useState<Onglet>(() => ongletParDefaut(video));
  const pilote = languePiloteDe(video.langues_visees?.length ? video.langues_visees : video.langues.map((l) => l.langue));
  const action = prochaineAction(video);
  const Icone = ICONE_STYLE[video.style ?? "papier"];
  const nbVideos = video.langues.filter((l) => l.video_url).length;

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-lg leading-snug font-semibold">{video.sujet}</h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant={VARIANTE_VIDEO[video.statut]}>{t(`motion.statutVideo.${video.statut}`)}</Badge>
                <span className="inline-flex items-center gap-1">
                  <Icone className="size-3.5" aria-hidden />
                  {t(`motion.styles.${video.style ?? "papier"}.nom`)}
                </span>
                {video.projet && <span className="font-mono">· videos/{video.projet}</span>}
              </div>
            </div>
            {video.statut !== "archive" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                loading={archiver.isPending}
                onClick={() => {
                  if (window.confirm(t("motion.confirmArchiver"))) archiver.mutate();
                }}
              >
                <Archive aria-hidden />
                {t("motion.archiver")}
              </Button>
            )}
          </div>
          <Etapes video={video} pilote={pilote} />
          <ProchaineEtape action={action} pilote={pilote} erreur={video.erreur} onOnglet={setOnglet} onglet={onglet} />
          {archiver.error && <p className="text-sm text-destructive">{messageErreur(archiver.error)}</p>}
        </CardHeader>
      </Card>

      <Segments<Onglet>
        libelle={t("motion.onglets.videos")}
        actif={onglet}
        onChange={setOnglet}
        options={[
          { cle: "videos", contenu: <>{t("motion.onglets.videos")} {nbVideos > 0 && <span className="tabular-nums text-muted-foreground">{nbVideos}</span>}</> },
          { cle: "script", contenu: t("motion.onglets.script") },
          { cle: "details", contenu: t("motion.onglets.details") },
        ]}
      />

      {onglet === "videos" &&
        (video.langues.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("motion.pasEncoreDeVideo")}</p>
        ) : (
          <div className="grid gap-3 2xl:grid-cols-2">
            {languesOrdonnees(video.langues, pilote).map((l) => (
              <CarteLangue key={l.langue} video={video} langue={l} pilote={pilote} comptes={comptesDeLaLangue(comptes, l.langue)} />
            ))}
          </div>
        ))}
      {onglet === "script" && <EditeurScript video={video} />}
      {onglet === "details" && <Details video={video} />}
    </div>
  );
}

const STYLE_ETAPE: Record<EtatEtape, string> = {
  faite: "border-success/40 bg-success/10 text-success-foreground",
  a_toi: "border-warning/50 bg-warning/10 text-warning-foreground ring-2 ring-warning/20",
  moteur: "border-info/40 bg-info/10 text-info-foreground",
  a_venir: "border-dashed text-muted-foreground",
};

function Etapes({ video, pilote }: { video: VideoMotion; pilote: string }) {
  const { t } = useTranslation();
  const etapes = etapesVideo(video);
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={t("motion.journal")}>
      {etapes.map((e, i) => (
        <li key={e.cle} className="flex items-center gap-1.5">
          {i > 0 && <span className="h-px w-3 bg-border" aria-hidden />}
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", STYLE_ETAPE[e.etat])}>
            {e.etat === "faite" ? (
              <Check className="size-3.5" aria-hidden />
            ) : e.etat === "moteur" ? (
              <Bot className="size-3.5" aria-hidden />
            ) : e.etat === "a_toi" ? (
              <UserRound className="size-3.5" aria-hidden />
            ) : (
              <span className="tabular-nums">{i + 1}</span>
            )}
            <span className="font-medium">{t(`motion.etapes.${e.cle}`, { langue: pilote.toUpperCase() })}</span>
            <span className="opacity-70">· {t(`motion.etatEtape.${e.etat}`)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProchaineEtape({
  action,
  pilote,
  erreur,
  onglet,
  onOnglet,
}: {
  action: ActionMotion;
  pilote: string;
  erreur: string | null;
  onglet: Onglet;
  onOnglet: (o: Onglet) => void;
}) {
  const { t } = useTranslation();
  const langues = "langues" in action ? action.langues.map((l) => l.toUpperCase()).join(", ") : "";
  const variante =
    action.cle === "echec"
      ? "error"
      : action.cle === "relire_script" || action.cle === "valider_pilote" || action.cle === "valider_langues"
        ? "warning"
        : action.cle === "terminee"
          ? "success"
          : action.cle === "archivee"
            ? "default"
            : "info";
  const cible: Onglet | null =
    action.cle === "relire_script" ? "script" : action.cle === "valider_pilote" || action.cle === "valider_langues" ? "videos" : action.cle === "echec" ? "details" : null;
  return (
    <Alert variant={variante} role="status">
      {variante === "info" ? <Bot aria-hidden /> : variante === "warning" ? <UserRound aria-hidden /> : <ArrowRight aria-hidden />}
      <AlertDescription className="text-foreground">
        {t(`motion.action.${action.cle}`, { pilote: pilote.toUpperCase(), langues })}
        {erreur && <span className="text-destructive">{erreur}</span>}
      </AlertDescription>
      {cible && cible !== onglet && (
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => onOnglet(cible)}>
            {cible === "script" ? t("motion.ouvrirScript") : cible === "videos" ? t("motion.voirVideos") : t("motion.onglets.details")}
            <ArrowRight aria-hidden />
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Vidéos                                                       */
/* ------------------------------------------------------------------ */

function CarteLangue({ video, langue, pilote, comptes }: { video: VideoMotion; langue: LangueMotion; pilote: string; comptes: CompteMotion[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const relire = () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION });
  const [commentaire, setCommentaire] = React.useState("");
  const [rejet, setRejet] = React.useState(false);
  const valider = useMutation({ mutationFn: () => validerLangueMotion(video.id, langue.langue), onSettled: relire });
  const rejeter = useMutation({
    mutationFn: () => rejeterLangueMotion(video.id, langue.langue, commentaire.trim()),
    onSuccess: () => {
      setCommentaire("");
      setRejet(false);
    },
    onSettled: relire,
  });
  const cible = comptes.find((c) => c.is_active) ?? null;
  const decidable = langue.statut === "a_valider" || langue.statut === "validee";
  const estPilote = langue.langue === pilote;
  // La pilote validée lance les autres langues, même sans compte MOTION pour la publier tout de suite.
  const sansPublier = estPilote && !cible;
  const erreur = valider.error ?? rejeter.error;
  const aDecider = langue.statut === "a_valider";

  return (
    <Card className={cn(aDecider && "border-warning/50")}>
      <CardContent className="flex gap-4 p-4 max-sm:flex-col">
        <div className="shrink-0 sm:w-48">
          {langue.video_url ? (
            <video
              src={langue.video_url}
              controls
              playsInline
              preload="metadata"
              className="mx-auto aspect-[9/16] w-full max-w-60 rounded-md bg-black"
            />
          ) : (
            <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              {attendLaPilote(langue, video.langues, pilote)
                ? t("motion.apresPilote", { pilote: pilote.toUpperCase() })
                : t("motion.pasEncoreDeVideo")}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{langue.langue.toUpperCase()}</span>
            {estPilote && (
              <Badge variant="outline" size="sm">
                {t("motion.pilote")}
              </Badge>
            )}
            <Badge variant={VARIANTE_LANGUE[langue.statut]}>{t(`motion.statutLangue.${langue.statut}`)}</Badge>
            {langue.duree_s != null && <span className="text-xs text-muted-foreground tabular-nums">{t("motion.duree", { s: langue.duree_s })}</span>}
          </div>

          {langue.video_url && attendLaPilote(langue, video.langues, pilote) && (
            <p className="text-xs text-muted-foreground">{t("motion.apresPilote", { pilote: pilote.toUpperCase() })}</p>
          )}

          {langue.legende && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t("motion.legende")}</p>
              <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs whitespace-pre-line">{langue.legende}</p>
            </div>
          )}

          {langue.commentaire && langue.statut === "rejetee" && (
            <p className="text-xs text-destructive">{t("motion.commentaireRejet", { commentaire: langue.commentaire })}</p>
          )}

          <p className="text-xs">
            {langue.statut === "distribuee" ? (
              t("motion.distribuee", { compte: libelleCompteId(comptes, langue.compte_id) })
            ) : cible ? (
              <span className="text-muted-foreground">{t("motion.compteCible", { compte: libelleCompte(cible) })}</span>
            ) : (
              <span className="text-warning-foreground">{t("motion.aucunCompteLangue", { langue: langue.langue.toUpperCase() })}</span>
            )}
          </p>

          <div className="mt-auto space-y-2">
            <div className="flex flex-wrap gap-2">
              {decidable && (
                <>
                  <Button
                    size="sm"
                    disabled={(!cible && !estPilote) || !langue.video_url}
                    loading={valider.isPending}
                    onClick={() => {
                      const message = sansPublier
                        ? t("motion.confirmPilote", { langue: langue.langue.toUpperCase() })
                        : t("motion.confirmPublier", { langue: langue.langue.toUpperCase() });
                      if (window.confirm(message)) valider.mutate();
                    }}
                  >
                    <Check aria-hidden />
                    {sansPublier ? t("motion.validerPilote") : t("motion.validerPublier")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejet((r) => !r)} aria-expanded={rejet}>
                    {t("motion.rejeter")}
                  </Button>
                </>
              )}
              {langue.video_url && (
                <Button
                  size="sm"
                  variant="ghost"
                  render={<a href={lienTelechargement(langue.video_url, nomFichierMotion(video.sujet, langue.langue))} download />}
                >
                  <Download aria-hidden />
                  {t("motion.telecharger")}
                </Button>
              )}
            </div>
            {langue.video_brute_url && (
              <a
                href={lienTelechargement(langue.video_brute_url, nomFichierMotion(video.sujet, langue.langue, "sans-sous-titres"))}
                download
                className="block text-xs text-muted-foreground underline"
              >
                {t("motion.sansSousTitres")}
              </a>
            )}
            {rejet && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (commentaire.trim()) rejeter.mutate();
                }}
              >
                <Textarea
                  rows={2}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder={t("motion.commentaireExemple")}
                  aria-label={t("motion.commentaire")}
                  autoFocus
                />
                <Button type="submit" size="sm" variant="destructive" loading={rejeter.isPending} disabled={!commentaire.trim()}>
                  {t("motion.envoyerRejet")}
                </Button>
              </form>
            )}
            {valider.data?.date && <p className="text-xs text-success-foreground">{t("motion.postCree", { date: valider.data.date })}</p>}
            {valider.data?.lancees && valider.data.lancees.length > 0 && (
              <p className="text-xs text-success-foreground">
                {t("motion.languesLancees", { langues: valider.data.lancees.map((l) => l.toUpperCase()).join(", ") })}
              </p>
            )}
            {erreur && (
              <p role="alert" className="text-xs text-destructive">
                {messageErreur(erreur)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Script                                                       */
/* ------------------------------------------------------------------ */

function EditeurScript({ video }: { video: VideoMotion }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const relire = () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION });
  const original = React.useMemo(() => scriptEditable(video.script), [video.script]);
  const [texte, setTexte] = React.useState<ScriptEditable | null>(original);
  const [consigne, setConsigne] = React.useState("");
  // Le moteur a réécrit le script : on repart de sa version.
  const signature = JSON.stringify(original);
  React.useEffect(() => setTexte(original), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const modifie = scriptsDifferents(texte, original);
  const probleme = problemeScript(texte);
  const changerScene = (i: number, champ: "texte" | "animation", valeur: string) =>
    setTexte((e) => (e ? { ...e, scenes: e.scenes.map((x, j) => (j === i ? { ...x, [champ]: valeur } : x)) } : e));
  const enregistrer = useMutation({ mutationFn: () => majScriptMotion(video.id, scriptModifie(texte!)), onSettled: relire });
  const valider = useMutation({
    mutationFn: async () => {
      if (modifie && texte) await majScriptMotion(video.id, scriptModifie(texte));
      return validerScriptMotion(video.id);
    },
    onSettled: relire,
  });
  const refaire = useMutation({
    mutationFn: () => demanderScriptMotion(video.id, consigne.trim()),
    onSuccess: () => setConsigne(""),
    onSettled: relire,
  });
  const verrouille = video.statut === "archive" || video.statut === "script_demande";
  const validable = !verrouille && ["script_pret", "production", "a_valider"].includes(video.statut);
  const erreur = enregistrer.error ?? valider.error ?? refaire.error;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          {!texte ? (
            <p className="text-sm text-muted-foreground">{t("motion.scriptEnAttente")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("motion.scriptAide")}</p>
              <ol className="divide-y rounded-lg border">
                {texte.scenes.map((s, i) => (
                  <li key={s.origine != null ? `o${s.origine}` : `n${i}`} className="group flex gap-3 p-2.5">
                    <div className="w-8 shrink-0 pt-2 text-right">
                      <span className="block font-mono text-xs text-muted-foreground">{i + 1}</span>
                      {s.origine == null && <span className="block text-[10px] text-primary">{t("motion.sceneNouvelle")}</span>}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Textarea
                        rows={1}
                        value={s.texte}
                        disabled={verrouille}
                        placeholder={t("motion.texteSceneExemple")}
                        className="border-transparent bg-transparent shadow-none before:hidden hover:border-input has-focus-visible:border-ring"
                        style={{ minHeight: "2.25rem", resize: "none" }}
                        aria-label={t("motion.texteScene", { id: i + 1 })}
                        onChange={(e) => changerScene(i, "texte", e.target.value)}
                      />
                      <Textarea
                        rows={1}
                        value={s.animation}
                        disabled={verrouille}
                        maxLength={ANIMATION_MAX}
                        placeholder={t("motion.animationExemple")}
                        className="border-transparent bg-muted/40 text-xs text-muted-foreground shadow-none before:hidden hover:border-input has-focus-visible:border-ring"
                        style={{ minHeight: "2rem", resize: "none" }}
                        aria-label={t("motion.animationScene", { id: i + 1 })}
                        onChange={(e) => changerScene(i, "animation", e.target.value)}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 pt-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={verrouille || texte.scenes.length >= SCENES_MAX}
                        title={t("motion.ajouterSceneApres", { n: i + 1 })}
                        aria-label={t("motion.ajouterSceneApres", { n: i + 1 })}
                        onClick={() => setTexte((e) => (e ? ajouterScene(e, i) : e))}
                      >
                        <Plus aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={verrouille || texte.scenes.length <= 1}
                        title={t("motion.supprimerScene", { n: i + 1 })}
                        aria-label={t("motion.supprimerScene", { n: i + 1 })}
                        onClick={() => {
                          if (!s.texte.trim() && !s.animation.trim()) setTexte((e) => (e ? supprimerScene(e, i) : e));
                          else if (window.confirm(t("motion.confirmSupprimerScene", { n: i + 1 }))) setTexte((e) => (e ? supprimerScene(e, i) : e));
                        }}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                variant="outline"
                size="sm"
                disabled={verrouille || texte.scenes.length >= SCENES_MAX}
                onClick={() => setTexte((e) => (e ? ajouterScene(e, e.scenes.length - 1) : e))}
              >
                <Plus aria-hidden />
                {t("motion.ajouterScene")}
              </Button>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("motion.outro")}</span>
                  <Textarea rows={3} value={texte.outro} disabled={verrouille} onChange={(e) => setTexte({ ...texte, outro: e.target.value })} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t("motion.legende")}</span>
                  <Textarea rows={3} value={texte.legende} disabled={verrouille} onChange={(e) => setTexte({ ...texte, legende: e.target.value })} />
                </label>
              </div>
            </>
          )}
        </CardContent>
        {texte && (
          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur">
            {modifie && <span className="text-xs text-warning-foreground">{t("motion.scriptModifie")}</span>}
            {modifie && probleme && <span className="text-xs text-destructive">{t(`motion.probleme.${probleme}`)}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" disabled={!modifie || verrouille || !!probleme} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                {t("motion.enregistrer")}
              </Button>
              <Button
                disabled={!validable || (modifie && !!probleme)}
                loading={valider.isPending}
                onClick={() => {
                  if (window.confirm(t("motion.confirmValiderScript"))) valider.mutate();
                }}
              >
                <Check aria-hidden />
                {t("motion.validerScript")}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm font-medium">{t("motion.refaireTitre")}</p>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-0 flex-1"
              value={consigne}
              onChange={(e) => setConsigne(e.target.value)}
              placeholder={t("motion.refaireExemple")}
              aria-label={t("motion.refaireConsigne")}
              disabled={video.statut === "archive"}
            />
            <Button variant="outline" loading={refaire.isPending} disabled={video.statut === "archive"} onClick={() => refaire.mutate()}>
              {t("motion.refaire")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(erreur)}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Détails                                                      */
/* ------------------------------------------------------------------ */

function Details({ video }: { video: VideoMotion }) {
  const { t, i18n } = useTranslation();
  const journal = dernieresLignes(video.journal, 100);
  const tacheEnCours = video.taches.find((x) => x.statut === "en_attente" || x.statut === "en_cours");
  return (
    <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t("motion.consigneTitre")}</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line text-muted-foreground">{video.consigne || t("motion.aucuneConsigne")}</p>
          </CardContent>
        </Card>
        <Capture video={video} />
      </div>
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold">{t("motion.journal")}</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          {tacheEnCours && (
            <p className="text-xs text-info-foreground">
              {t(`motion.tache.${tacheEnCours.type}`)} · {t(`motion.tacheStatut.${tacheEnCours.statut}`)}
              {tacheEnCours.langue ? ` · ${tacheEnCours.langue.toUpperCase()}` : ""}
            </p>
          )}
          {video.erreur && (
            <p role="alert" className="text-sm text-destructive">
              {video.erreur}
            </p>
          )}
          <ol className="relative space-y-3 border-l pl-4" aria-label={t("motion.journal")}>
            {journal.map((l, i) => (
              <li key={`${l.at}-${i}`} className="text-xs">
                <span className="absolute -left-[4.5px] mt-1 size-2 rounded-full bg-border" aria-hidden />
                <p className="text-muted-foreground tabular-nums">{l.at ? new Date(l.at).toLocaleString(i18n.language) : ""}</p>
                <p>{l.message}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

/** La capture d'accueil Sophia en anglais : le moteur la traduit pour faire la fin de chaque langue. */
function Capture({ video }: { video: VideoMotion }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const deposer = useMutation({
    mutationFn: (f: File) => deposerCaptureMotion(video.id, f),
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION }),
  });
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">{t("motion.captureTitre")}</h3>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("motion.captureAide")}</p>
        {video.capture_url ? (
          <a href={video.capture_url} target="_blank" rel="noreferrer" className="inline-block">
            <img src={video.capture_url} alt={t("motion.captureAnglais")} className="h-40 w-auto max-w-full rounded-md border object-cover" />
          </a>
        ) : (
          <p className="text-sm text-warning-foreground">{t("motion.captureManquante")}</p>
        )}
        {video.statut !== "archive" && (
          <ZoneCapture fichier={null} onFichier={(f) => f && deposer.mutate(f)} disabled={deposer.isPending} />
        )}
        {deposer.isPending && <p className="text-xs text-muted-foreground">{t("motion.captureEnvoi")}</p>}
        {deposer.error && <p className="text-xs text-destructive">{messageErreur(deposer.error)}</p>}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dialogues : nouveau sujet, comptes et moteur                        */
/* ------------------------------------------------------------------ */

function DialogueNouveauSujet({ ouvert, onOuvert, onCree }: { ouvert: boolean; onOuvert: (o: boolean) => void; onCree: (id: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sujet, setSujet] = React.useState("");
  const [consigne, setConsigne] = React.useState("");
  const [langues, setLangues] = React.useState<string[]>([...LANGUES_MOTION]);
  const [capture, setCapture] = React.useState<File | null>(null);
  const [style, setStyle] = React.useState<StyleMotion>("papier");
  const creer = useMutation({
    mutationFn: async () => {
      const { video } = await creerVideoMotion(sujet.trim(), consigne.trim(), langues, style);
      if (capture) await deposerCaptureMotion(video.id, capture);
      return video.id;
    },
    onSuccess: (id) => {
      setSujet("");
      setConsigne("");
      setCapture(null);
      onCree(id);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION }),
  });
  const basculer = (l: string, coche: boolean) =>
    setLangues((avant) => (coche ? LANGUES_MOTION.filter((x) => x === l || avant.includes(x)) : avant.filter((x) => x !== l)));

  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t("motion.nouveau")}</DialogTitle>
          <DialogDescription>{t("motion.nouveauAide")}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            className="space-y-4 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (sujet.trim() && langues.length > 0) creer.mutate();
            }}
          >
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t("motion.style")}</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("motion.style")}>
                {STYLES_MOTION.map((s) => {
                  const Icone = ICONE_STYLE[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={style === s}
                      onClick={() => setStyle(s)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
                        style === s ? "border-primary bg-accent/40 ring-1 ring-primary/30" : "bg-card",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Icone className="size-4" aria-hidden />
                        {t(`motion.styles.${s}.nom`)}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{t(`motion.styles.${s}.description`)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("motion.sujet")}</span>
              <Input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder={t("motion.sujetExemple")} autoFocus />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("motion.consigne")}</span>
              <Textarea value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder={t("motion.consigneExemple")} rows={3} />
            </label>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{t("motion.langues")}</legend>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {LANGUES_MOTION.map((l) => (
                  <label key={l} className="flex items-center gap-1.5">
                    <Checkbox checked={langues.includes(l)} onCheckedChange={(c) => basculer(l, c === true)} />
                    {l.toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>
            <ZoneCapture fichier={capture} onFichier={setCapture} disabled={creer.isPending} />
            {creer.error && (
              <p role="alert" className="text-sm text-destructive">
                {messageErreur(creer.error)}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={creer.isPending} disabled={!sujet.trim() || langues.length === 0}>
                {t("motion.creer")}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function DialogueReglages({
  ouvert,
  onOuvert,
  comptes,
  erreur,
}: {
  ouvert: boolean;
  onOuvert: (o: boolean) => void;
  comptes: CompteMotion[];
  erreur: unknown;
}) {
  const { t } = useTranslation();
  const jeton = useMutation({ mutationFn: genererJetonMotion });
  const [copie, setCopie] = React.useState(false);
  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("motion.reglages")}</DialogTitle>
          <DialogDescription>{t("motion.labelAide")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4 pb-5">
          {erreur ? <p className="text-sm text-destructive">{messageErreur(erreur)}</p> : null}
          <ul className="divide-y rounded-lg border text-sm">
            {LANGUES_MOTION.map((l) => {
              const duLabel = comptesDeLaLangue(comptes, l);
              return (
                <li key={l} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-6 font-semibold">{l.toUpperCase()}</span>
                  {duLabel.length === 0 ? (
                    <span className="text-xs text-warning-foreground">{t("motion.aucunCompte")}</span>
                  ) : (
                    <span className="text-xs">{duLabel.map((c) => libelleCompte(c, t("motion.inactif"))).join(", ")}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <Replie titre={t("motion.moteur")} aide={t("motion.moteurAide")}>
            <Button variant="outline" size="sm" loading={jeton.isPending} onClick={() => jeton.mutate()}>
              <KeyRound aria-hidden />
              {t("motion.genererJeton")}
            </Button>
            {jeton.data?.jeton && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{jeton.data.jeton}</code>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      void navigator.clipboard?.writeText(jeton.data.jeton).then(() => setCopie(true));
                    }}
                  >
                    {copie ? t("motion.copie") : t("motion.copier")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("motion.jetonAide")}</p>
              </div>
            )}
            {jeton.error && <p className="text-sm text-destructive">{messageErreur(jeton.error)}</p>}
          </Replie>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function libelleCompte(c: CompteMotion, inactif = "inactif"): string {
  const nom = c.handle_tiktok ? `@${c.handle_tiktok}` : (c.persona_nom ?? c.id.slice(0, 8));
  return c.is_active ? nom : `${nom} (${inactif})`;
}

function libelleCompteId(comptes: CompteMotion[], id: string | null): string {
  const c = comptes.find((x) => x.id === id);
  return c ? libelleCompte(c) : (id?.slice(0, 8) ?? "?");
}
