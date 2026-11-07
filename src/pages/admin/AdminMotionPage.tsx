import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Archive, Clapperboard, Film, ImageUp, KeyRound, Languages, ScrollText, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Replie } from "@/components/ui/replie";
import { Textarea } from "@/components/ui/textarea";
import { EtatRequete, TitreCarte } from "@/features/bleo/ui";
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
  validerLangueMotion,
  validerScriptMotion,
  type VideoMotion,
} from "@/features/motion/api";
import {
  comptesDeLaLangue,
  dernieresLignes,
  LANGUES_MOTION,
  moteurAuTravail,
  type ScriptEditable,
  scriptEditable,
  scriptModifie,
  scriptsDifferents,
  VARIANTE_LANGUE,
  VARIANTE_VIDEO, attendLaPilote, languePiloteDe } from "@/features/motion/logique";
import { messageErreur } from "@/features/ugcIa/logique";

/** Toutes les 10 s tant que le moteur travaille (script demandé, langues à rendre). */
const INTERVALLE_SUIVI_MS = 10_000;

/**
 * Motion : une vidéo explicative en papier découpé, refaite dans plusieurs
 * langues (voix, bruitages, sous-titres) par le moteur (une session Claude
 * Code hors podz), validée ici langue par langue puis postée sur le compte
 * MOTION de la langue. Le modèle : « Why is Switzerland never at war? ».
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
  const liste = videos.data ?? [];
  const video = liste.find((v) => v.id === choisie) ?? liste.find((v) => v.statut !== "archive") ?? null;

  return (
    <div className="space-y-6" data-testid="page-motion">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Film className="size-6 text-muted-foreground" aria-hidden />
            {t("motion.titre")}
          </span>
        }
        description={t("motion.description")}
      />

      <EtatRequete erreur={videos.error} chargement={videos.isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteNouveauSujet onCree={setChoisie} />
        <CarteReglages comptes={comptes.data ?? []} erreur={comptes.error} />
      </div>

      {videos.data && liste.length === 0 && (
        <EmptyState icon={<Clapperboard />} title={t("motion.vide")} description={t("motion.videDetail")} />
      )}

      {liste.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ListeVideos videos={liste} choisie={video?.id ?? null} onChoisir={setChoisie} />
          {video && <DetailVideo key={video.id} video={video} comptes={comptes.data ?? []} />}
        </div>
      )}
    </div>
  );
}

function CarteNouveauSujet({ onCree }: { onCree: (id: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [sujet, setSujet] = React.useState("");
  const [consigne, setConsigne] = React.useState("");
  const [langues, setLangues] = React.useState<string[]>([...LANGUES_MOTION]);
  const [capture, setCapture] = React.useState<File | null>(null);
  const champCapture = React.useRef<HTMLInputElement>(null);
  const creer = useMutation({
    mutationFn: async () => {
      const { video } = await creerVideoMotion(sujet.trim(), consigne.trim(), langues);
      if (capture) await deposerCaptureMotion(video.id, capture);
      return video.id;
    },
    onSuccess: (id) => {
      setSujet("");
      setConsigne("");
      setCapture(null);
      if (champCapture.current) champCapture.current.value = "";
      onCree(id);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION }),
  });
  const basculer = (l: string, coche: boolean) =>
    setLangues((avant) => (coche ? LANGUES_MOTION.filter((x) => x === l || avant.includes(x)) : avant.filter((x) => x !== l)));

  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={Sparkles}>{t("motion.nouveau")}</TitreCarte>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (sujet.trim() && langues.length > 0) creer.mutate();
          }}
        >
          <Input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder={t("motion.sujetExemple")} aria-label={t("motion.sujet")} />
          <Textarea
            value={consigne}
            onChange={(e) => setConsigne(e.target.value)}
            placeholder={t("motion.consigneExemple")}
            aria-label={t("motion.consigne")}
            rows={3}
          />
          <fieldset className="flex flex-wrap items-center gap-3 text-sm">
            <legend className="sr-only">{t("motion.langues")}</legend>
            {LANGUES_MOTION.map((l) => (
              <label key={l} className="flex items-center gap-1.5">
                <Checkbox checked={langues.includes(l)} onCheckedChange={(c) => basculer(l, c === true)} />
                {l.toUpperCase()}
              </label>
            ))}
          </fieldset>
          <label className="block space-y-1 text-xs text-muted-foreground">
            <span>{t("motion.captureAnglais")}</span>
            <input
              ref={champCapture}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full text-xs"
              onChange={(e) => setCapture(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button type="submit" loading={creer.isPending} disabled={!sujet.trim() || langues.length === 0}>
            {t("motion.creer")}
          </Button>
          {creer.error && (
            <p role="alert" className="text-sm text-destructive">
              {messageErreur(creer.error)}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function CarteReglages({ comptes, erreur }: { comptes: CompteMotion[]; erreur: unknown }) {
  const { t } = useTranslation();
  const jeton = useMutation({ mutationFn: genererJetonMotion });
  const [copie, setCopie] = React.useState(false);
  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={Languages}>{t("motion.comptes")}</TitreCarte>
      </CardHeader>
      <CardContent className="space-y-3">
        {erreur ? <p className="text-sm text-destructive">{messageErreur(erreur)}</p> : null}
        <ul className="space-y-1 text-sm">
          {LANGUES_MOTION.map((l) => {
            const duLabel = comptesDeLaLangue(comptes, l);
            return (
              <li key={l} className="flex items-center gap-2">
                <Badge variant="outline">{l.toUpperCase()}</Badge>
                {duLabel.length === 0 ? (
                  <span className="text-xs text-warning-foreground">{t("motion.aucunCompte")}</span>
                ) : (
                  <span className="text-xs">{duLabel.map((c) => libelleCompte(c, t("motion.inactif"))).join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t("motion.labelAide")}</p>
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
      </CardContent>
    </Card>
  );
}

function libelleCompte(c: CompteMotion, inactif = "inactif"): string {
  const nom = c.handle_tiktok ? `@${c.handle_tiktok}` : (c.persona_nom ?? c.id.slice(0, 8));
  return c.is_active ? nom : `${nom} (${inactif})`;
}

function ListeVideos({ videos, choisie, onChoisir }: { videos: VideoMotion[]; choisie: string | null; onChoisir: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="space-y-2" aria-label={t("motion.videos")}>
      {videos.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onChoisir(v.id)}
            className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 ${v.id === choisie ? "border-primary bg-accent/40" : "bg-card"} ${v.statut === "archive" ? "opacity-60" : ""}`}
          >
            <p className="line-clamp-2 text-sm font-medium">{v.sujet}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Badge variant={VARIANTE_VIDEO[v.statut]}>{t(`motion.statutVideo.${v.statut}`)}</Badge>
              {v.langues.map((l) => (
                <Badge key={l.langue} variant={VARIANTE_LANGUE[l.statut]} size="sm" title={t(`motion.statutLangue.${l.statut}`)}>
                  {l.langue.toUpperCase()}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{new Date(v.updated_at).toLocaleString(i18n.language)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DetailVideo({ video, comptes }: { video: VideoMotion; comptes: CompteMotion[] }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const relire = () => qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION });
  const archiver = useMutation({ mutationFn: () => archiverVideoMotion(video.id), onSettled: relire });
  const journal = dernieresLignes(video.journal);
  const tacheEnCours = video.taches.find((x) => x.statut === "en_attente" || x.statut === "en_cours");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <h2 className="text-base font-semibold">{video.sujet}</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={VARIANTE_VIDEO[video.statut]}>{t(`motion.statutVideo.${video.statut}`)}</Badge>
                {video.projet && <span className="text-xs text-muted-foreground">videos/{video.projet}</span>}
              </div>
            </div>
            {video.statut !== "archive" && (
              <Button
                variant="ghost"
                size="sm"
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
        </CardHeader>
        <CardContent className="space-y-3">
          {video.consigne && <p className="text-xs text-muted-foreground">{t("motion.consigneDonnee", { consigne: video.consigne })}</p>}
          <Capture video={video} />
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
          {journal.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground" aria-label={t("motion.journal")}>
              {journal.map((l, i) => (
                <li key={`${l.at}-${i}`}>
                  <span className="tabular-nums">{l.at ? new Date(l.at).toLocaleString(i18n.language) : ""}</span> · {l.message}
                </li>
              ))}
            </ul>
          )}
          {archiver.error && <p className="text-sm text-destructive">{messageErreur(archiver.error)}</p>}
        </CardContent>
      </Card>

      <EditeurScript video={video} />

      {video.langues.length > 0 && (
        <section className="space-y-3" aria-labelledby={`motion-langues-${video.id}`}>
          <h3 id={`motion-langues-${video.id}`} className="text-sm font-semibold">
            {t("motion.languesVideo")}
          </h3>
          <div className="grid gap-3 xl:grid-cols-2">
            {video.langues.map((l) => (
              <CarteLangue key={l.langue} video={video} langue={l} comptes={comptesDeLaLangue(comptes, l.langue)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** La capture d'accueil Sophia en anglais : le moteur la traduit pour faire la fin de chaque langue. */
function Capture({ video }: { video: VideoMotion }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const champ = React.useRef<HTMLInputElement>(null);
  const deposer = useMutation({
    mutationFn: (f: File) => deposerCaptureMotion(video.id, f),
    onSettled: () => {
      if (champ.current) champ.current.value = "";
      return qc.invalidateQueries({ queryKey: CLE_VIDEOS_MOTION });
    },
  });
  return (
    <div className="flex items-start gap-3">
      {video.capture_url ? (
        <a href={video.capture_url} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={video.capture_url} alt={t("motion.captureAnglais")} className="h-28 w-auto rounded-md border object-cover" />
        </a>
      ) : null}
      <div className="min-w-0 space-y-1">
        {!video.capture_url && <p className="text-sm text-warning-foreground">{t("motion.captureManquante")}</p>}
        <label className="block space-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ImageUp className="size-3.5" aria-hidden />
            {video.capture_url ? t("motion.captureRemplacer") : t("motion.captureAnglais")}
          </span>
          <input
            ref={champ}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-xs"
            disabled={deposer.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) deposer.mutate(f);
            }}
          />
        </label>
        {deposer.isPending && <p className="text-xs text-muted-foreground">{t("motion.captureEnvoi")}</p>}
        {deposer.error && <p className="text-xs text-destructive">{messageErreur(deposer.error)}</p>}
      </div>
    </div>
  );
}

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
  const erreur = enregistrer.error ?? valider.error ?? refaire.error;

  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={ScrollText}>{t("motion.script")}</TitreCarte>
      </CardHeader>
      <CardContent className="space-y-3">
        {!texte ? (
          <p className="text-sm text-muted-foreground">{t("motion.scriptEnAttente")}</p>
        ) : (
          <>
            <ol className="space-y-2">
              {texte.scenes.map((s, i) => (
                <li key={s.id ?? i} className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{s.id ?? t("motion.scene", { n: i + 1 })}</span>
                  <Textarea
                    rows={2}
                    value={s.texte}
                    disabled={verrouille}
                    aria-label={t("motion.texteScene", { id: s.id ?? i + 1 })}
                    onChange={(e) =>
                      setTexte({ ...texte, scenes: texte.scenes.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)) })
                    }
                  />
                </li>
              ))}
            </ol>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t("motion.outro")}</span>
              <Textarea rows={2} value={texte.outro} disabled={verrouille} onChange={(e) => setTexte({ ...texte, outro: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{t("motion.legende")}</span>
              <Textarea rows={2} value={texte.legende} disabled={verrouille} onChange={(e) => setTexte({ ...texte, legende: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!modifie || verrouille} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
                {t("motion.enregistrer")}
              </Button>
              <Button
                disabled={verrouille || !["script_pret", "production", "a_valider"].includes(video.statut)}
                loading={valider.isPending}
                onClick={() => {
                  if (window.confirm(t("motion.confirmValiderScript"))) valider.mutate();
                }}
              >
                {t("motion.validerScript")}
              </Button>
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-3">
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
        {erreur && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(erreur)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CarteLangue({ video, langue, comptes }: { video: VideoMotion; langue: LangueMotion; comptes: CompteMotion[] }) {
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
  const pilote = languePiloteDe(video.langues.map((l) => l.langue));
  const estPilote = langue.langue === pilote;
  // La pilote validée lance les autres langues, même sans compte MOTION pour la publier tout de suite.
  const sansPublier = estPilote && !cible;
  const erreur = valider.error ?? rejeter.error;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{langue.langue.toUpperCase()}</span>
          <Badge variant={VARIANTE_LANGUE[langue.statut]}>{t(`motion.statutLangue.${langue.statut}`)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {attendLaPilote(langue, video.langues, pilote) && (
          <p className="text-xs text-muted-foreground">{t("motion.apresPilote", { pilote: pilote.toUpperCase() })}</p>
        )}
        {langue.video_url ? (
          <video
            src={langue.video_url}
            controls
            playsInline
            preload="metadata"
            className="mx-auto aspect-[9/16] max-h-[520px] w-auto rounded-md bg-black"
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t("motion.pasEncoreDeVideo")}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {langue.duree_s != null && <span>{t("motion.duree", { s: langue.duree_s })}</span>}
          {langue.video_brute_url && (
            <a href={langue.video_brute_url} target="_blank" rel="noreferrer" className="underline">
              {t("motion.sansSousTitres")}
            </a>
          )}
        </div>
        {langue.legende && <p className="whitespace-pre-line rounded-md bg-muted px-2 py-1 text-xs">{langue.legende}</p>}
        {langue.commentaire && langue.statut === "rejetee" && (
          <p className="text-xs text-destructive">{t("motion.commentaireRejet", { commentaire: langue.commentaire })}</p>
        )}
        <p className="text-xs">
          {langue.statut === "distribuee"
            ? t("motion.distribuee", { compte: libelleCompteId(comptes, langue.compte_id) })
            : cible
              ? t("motion.compteCible", { compte: libelleCompte(cible) })
              : <span className="text-warning-foreground">{t("motion.aucunCompteLangue", { langue: langue.langue.toUpperCase() })}</span>}
        </p>
        {decidable && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
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
                {sansPublier ? t("motion.validerPilote") : t("motion.validerPublier")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejet((r) => !r)}>
                {t("motion.rejeter")}
              </Button>
            </div>
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
                />
                <Button type="submit" size="sm" variant="destructive" loading={rejeter.isPending} disabled={!commentaire.trim()}>
                  {t("motion.envoyerRejet")}
                </Button>
              </form>
            )}
          </div>
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
      </CardContent>
    </Card>
  );
}

function libelleCompteId(comptes: CompteMotion[], id: string | null): string {
  const c = comptes.find((x) => x.id === id);
  return c ? libelleCompte(c) : (id?.slice(0, 8) ?? "?");
}
