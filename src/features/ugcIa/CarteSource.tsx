import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Clapperboard, Download, ExternalLink, RefreshCw, RotateCcw, Save, Scissors, Sparkles, Timer, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  CLE_SOURCES_UGC_IA,
  couperPassageUgcIa,
  enregistrerCtaUgcIa,
  genererUgcIa,
  lireCtaUgcIa,
  supprimerGenerationUgcIa,
  supprimerSourceUgcIa,
  type GenerationUgcIa,
  type PersonaUgcIa,
  type ResultatLancement,
  type SourceUgcIa,
} from "./api";
import { DialogueMontage } from "./Montage";
import {
  arrondiDixieme,
  basculer,
  erreurPassage,
  estMontee,
  lireSecondes,
  messageErreur,
  passageInitial,
  passageTelephoneInitial,
  PASSAGE_MAX_S,
  personasOccupes,
  peutCouper,
  PERSONAS_MAX_PAR_LANCEMENT,
  PROMPT_DEFAUT,
  TELEPHONE_MAX_S,
  type PartieSource,
  type ResolutionUgcIa,
  type StatutGenerationUgcIa,
} from "./logique";

const VARIANTE_STATUT: Record<StatutGenerationUgcIa, "warning" | "success" | "error"> = {
  en_cours: "warning",
  prete: "success",
  echec: "error",
};

const RESOLUTIONS: ReadonlyArray<{ cle: ResolutionUgcIa; contenu: string }> = [
  { cle: "480p", contenu: "480p" },
  { cle: "720p", contenu: "720p" },
  { cle: "1080p", contenu: "1080p" },
];

function useRafraichir() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CLE_SOURCES_UGC_IA });
}

function Alerte({ erreur }: { erreur: unknown }) {
  if (!erreur) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {messageErreur(erreur)}
    </p>
  );
}

/** Une étape numérotée de la carte : un titre, une phrase d'aide, puis son contenu. */
function Etape({ numero, titre, aide, children }: { numero: number; titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2" aria-label={titre}>
      <div className="flex items-start gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
          {numero}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-6">{titre}</h3>
          {aide && <p className="text-xs text-muted-foreground">{aide}</p>}
        </div>
      </div>
      <div className="space-y-2 sm:pl-8">{children}</div>
    </section>
  );
}

/**
 * Une réaction de référence, en étapes : la vidéo TikTok à gauche ; à droite,
 * 1. découper la réaction et la partie téléphone, 2. le texte à l'écran (CTA),
 * 3. les personas à lancer ; puis 4. les vidéos générées.
 */
export function CarteSource({ source, personas }: { source: SourceUgcIa; personas: PersonaUgcIa[] }) {
  const { t, i18n } = useTranslation();
  const rafraichir = useRafraichir();
  const lecteur = React.useRef<HTMLVideoElement>(null);
  // Le temps de lecture du lecteur, affiché en direct ; au clic, on relit le lecteur lui-même.
  const [temps, setTemps] = React.useState(0);
  const suivreLecture = (e: React.SyntheticEvent<HTMLVideoElement>) => setTemps(e.currentTarget.currentTime);
  const tempsLecture = React.useCallback(() => lecteur.current?.currentTime ?? 0, []);
  const supprimer = useMutation({ mutationFn: () => supprimerSourceUgcIa(source.id), onSuccess: rafraichir });
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.created_at));
  const vues = source.source_vues != null ? new Intl.NumberFormat(i18n.language, { notation: "compact" }).format(source.source_vues) : null;
  const enCours = source.generations.some((g) => g.statut === "en_cours");
  const parId = new Map(personas.map((p) => [p.id, p]));
  const occupes = personasOccupes(source.generations);

  return (
    <Card data-testid={`source-${source.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <a href={source.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
            {t("ugcIa.source")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          {vues && <span className="text-muted-foreground">· {t("ugcIa.vues", { vues })}</span>}
          <span className="text-muted-foreground">· {date}</span>
          <span className="text-muted-foreground">· {t("ugcIa.nbGenerations", { count: source.generations.length })}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={supprimer.isPending}
          onClick={() => {
            if (window.confirm(t(enCours ? "ugcIa.confirmerSuppressionSourceEnCours" : "ugcIa.confirmerSuppressionSource"))) supprimer.mutate();
          }}
        >
          <Trash2 aria-hidden />
          {t("ugcIa.supprimerSource")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <Alerte erreur={supprimer.error} />
        <div className="grid gap-6 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <aside className="space-y-1.5">
            <p className="text-xs font-medium">
              {t("ugcIa.videoSource")}
              {source.source_duree_s != null && <span className="text-muted-foreground"> · {Math.round(source.source_duree_s)} s</span>}
            </p>
            {source.brut_url ? (
              <video
                ref={lecteur}
                src={source.brut_url}
                controls
                muted
                playsInline
                preload="metadata"
                onTimeUpdate={suivreLecture}
                onSeeked={suivreLecture}
                onPause={suivreLecture}
                className="mx-auto aspect-[9/16] w-full max-w-[14rem] rounded-lg bg-black object-contain md:max-w-none"
              />
            ) : (
              <p className="text-xs text-muted-foreground">{t("ugcIa.pasDeVideo")}</p>
            )}
            {source.brut_url && (
              <p className="flex items-center justify-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm font-medium tabular-nums" data-testid="temps-lecture">
                <Timer className="size-4 text-muted-foreground" aria-hidden />
                {t("ugcIa.lecture", { temps: arrondiDixieme(temps) })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("ugcIa.aideLecteur")}</p>
            {source.source_texte && <p className="line-clamp-3 text-xs text-muted-foreground">« {source.source_texte} »</p>}
          </aside>

          <div className="min-w-0 space-y-6">
            <Etape numero={1} titre={t("ugcIa.etapeDecouper")} aide={t("ugcIa.etapeDecouperAide")}>
              {source.brut_url && (
                <>
                  <LigneCoupe source={source} partie="reaction" temps={temps} tempsLecture={tempsLecture} bloquee={!peutCouper(source.generations)} />
                  <LigneCoupe source={source} partie="telephone" temps={temps} tempsLecture={tempsLecture} bloquee={false} />
                </>
              )}
            </Etape>
            <Etape numero={2} titre={t("ugcIa.etapeCta")} aide={t("ugcIa.etapeCtaAide")}>
              <BlocCta source={source} />
            </Etape>
            <Etape numero={3} titre={t("ugcIa.etapePersonas")} aide={t("ugcIa.etapePersonasAide")}>
              {source.coupe_url ? (
                <BlocLancement source={source} personas={personas} occupes={occupes} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("ugcIa.coupeDabord")}</p>
              )}
            </Etape>
          </div>
        </div>

        {source.generations.length > 0 && (
          <Etape numero={4} titre={t("ugcIa.etapeVideos", { count: source.generations.length })} aide={t("ugcIa.etapeVideosAide")}>
            <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-4">
              {source.generations.map((g) => (
                <CarteGeneration
                  key={g.id}
                  generation={g}
                  persona={parId.get(g.persona_id) ?? null}
                  occupe={g.statut !== "en_cours" && occupes.has(g.persona_id)}
                  ctaTexte={source.cta_texte}
                />
              ))}
            </div>
          </Etape>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Une partie à couper dans la vidéo TikTok : la réaction (envoyée à Genjutsu)
 * ou la partie téléphone (gardée telle quelle). Début et fin se prennent sur
 * le lecteur d'un clic (« Prendre 3.2 s ») ou se saisissent ; le clip coupé
 * s'affiche à côté.
 */
function LigneCoupe({
  source,
  partie,
  temps,
  tempsLecture,
  bloquee,
}: {
  source: SourceUgcIa;
  partie: PartieSource;
  /** Le temps de lecture affiché (mis à jour pendant la lecture). */
  temps: number;
  /** Le temps exact du lecteur, lu au moment du clic. */
  tempsLecture: () => number;
  bloquee: boolean;
}) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const initial = partie === "reaction" ? passageInitial(source) : passageTelephoneInitial(source);
  const [debut, setDebut] = React.useState(initial.debut);
  const [fin, setFin] = React.useState(initial.fin);
  const max = partie === "reaction" ? PASSAGE_MAX_S : TELEPHONE_MAX_S;
  const d = lireSecondes(debut);
  const f = lireSecondes(fin);
  const erreur = erreurPassage(d, f, source.source_duree_s, max);
  const couper = useMutation({ mutationFn: () => couperPassageUgcIa(source.id, partie, d ?? 0, f ?? 0), onSuccess: rafraichir });
  const clip = partie === "reaction" ? source.coupe_url : source.telephone_url;
  const coupeDebut = partie === "reaction" ? source.debut_s : source.telephone_debut_s;
  const coupeFin = partie === "reaction" ? source.fin_s : source.telephone_fin_s;
  const nom = t(`ugcIa.partie.${partie}`);

  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid={`coupe-${partie}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{nom}</p>
        <Badge variant={partie === "reaction" ? "info" : "secondary"}>{t(`ugcIa.partieRole.${partie}`)}</Badge>
        <span className="text-xs text-muted-foreground">
          {clip && coupeDebut != null && coupeFin != null ? t("ugcIa.coupee", { debut: coupeDebut, fin: coupeFin }) : t("ugcIa.pasCoupee")}
        </span>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            {(
              [
                ["debut", debut, setDebut],
                ["fin", fin, setFin],
              ] as const
            ).map(([cle, valeur, changer]) => (
              <div key={cle} className="space-y-1">
                <span className="block text-xs text-muted-foreground">{t(`ugcIa.${cle}`)}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    size="sm"
                    className="w-20"
                    inputMode="decimal"
                    value={valeur}
                    onChange={(e) => changer(e.target.value)}
                    aria-label={t(`ugcIa.${cle}De`, { partie: nom })}
                  />
                  <Button
                    variant="outline"
                    size="xs"
                    title={t("ugcIa.prendreTemps")}
                    aria-label={t("ugcIa.prendrePour", { champ: t(`ugcIa.${cle}De`, { partie: nom }), temps: arrondiDixieme(temps) })}
                    onClick={() => changer(arrondiDixieme(tempsLecture()))}
                  >
                    <Timer aria-hidden />
                    {t("ugcIa.prendre", { temps: arrondiDixieme(temps) })}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              loading={couper.isPending}
              disabled={erreur != null || bloquee}
              onClick={() => couper.mutate()}
            >
              <Scissors aria-hidden />
              {t(`ugcIa.couperPartie.${partie}`)}
            </Button>
          </div>
          {erreur && <p className="text-xs text-destructive">{t(`ugcIa.erreurPassage.${erreur}`, { max })}</p>}
          {bloquee && <p className="text-xs text-muted-foreground">{t("ugcIa.coupeBloquee")}</p>}
          <Alerte erreur={couper.error} />
        </div>
        {clip && (
          <div className="flex shrink-0 items-end gap-2">
            <video
              src={clip}
              controls
              muted={partie === "reaction"}
              playsInline
              preload="metadata"
              className="aspect-[9/16] h-28 w-auto rounded-md bg-black object-contain"
            />
            <a href={clip} download className="inline-flex items-center gap-1 text-xs underline">
              <Download className="size-3" aria-hidden />
              {t("ugcIa.telecharger")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/** Le texte à l'écran de la source, lu sur la vidéo et corrigeable à la main. */
function BlocCta({ source }: { source: SourceUgcIa }) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const [texte, setTexte] = React.useState(source.cta_texte ?? "");
  // Le texte enregistré change (relecture, autre onglet) : on suit, sauf saisie en cours.
  const [base, setBase] = React.useState(source.cta_texte ?? "");
  if ((source.cta_texte ?? "") !== base) {
    if (texte === base) setTexte(source.cta_texte ?? "");
    setBase(source.cta_texte ?? "");
  }
  const enregistrer = useMutation({ mutationFn: () => enregistrerCtaUgcIa(source.id, texte), onSuccess: rafraichir });
  const relire = useMutation({ mutationFn: () => lireCtaUgcIa(source.id), onSuccess: rafraichir });
  const modifie = texte.trim() !== (source.cta_texte ?? "").trim();
  const jamaisLu = source.cta_texte == null && !source.cta_image_url;

  return (
    <>
      <Textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={2}
        aria-label={t("ugcIa.ctaTexte")}
        placeholder={jamaisLu ? t("ugcIa.ctaJamaisLu") : t("ugcIa.ctaVide")}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={enregistrer.isPending} disabled={!modifie} onClick={() => enregistrer.mutate()}>
          <Save aria-hidden />
          {t("ugcIa.enregistrer")}
        </Button>
        <Button variant="outline" size="sm" loading={relire.isPending} disabled={!source.brut_url} onClick={() => relire.mutate()}>
          <RefreshCw aria-hidden />
          {jamaisLu ? t("ugcIa.lireCta") : t("ugcIa.relireCta")}
        </Button>
      </div>
      <Alerte erreur={enregistrer.error ?? relire.error} />
    </>
  );
}

/** Les personas à cocher, la qualité, et le bouton qui lance Genjutsu pour chacun. */
function BlocLancement({ source, personas, occupes }: { source: SourceUgcIa; personas: PersonaUgcIa[]; occupes: Set<string> }) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const [coches, setCoches] = React.useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = React.useState(PROMPT_DEFAUT);
  const [resolution, setResolution] = React.useState<ResolutionUgcIa>("720p");
  const libres = personas.filter((p) => !occupes.has(p.id));
  const choisis = [...coches].filter((id) => !occupes.has(id));
  const lancer = useMutation({
    mutationFn: () => genererUgcIa(source.id, choisis, prompt, resolution),
    onSuccess: () => setCoches(new Set()),
    onSettled: rafraichir,
  });
  const toutCoche = libres.length > 0 && libres.every((p) => coches.has(p.id));

  return (
    <>
      <fieldset className="space-y-2">
        <legend className="sr-only">{t("ugcIa.personasACocher", { max: PERSONAS_MAX_PAR_LANCEMENT })}</legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {personas.map((p) => {
            const occupe = occupes.has(p.id);
            return (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                title={p.description}
              >
                <input type="checkbox" checked={coches.has(p.id) && !occupe} disabled={occupe} onChange={() => setCoches((c) => basculer(c, p.id))} />
                <img src={p.image_url} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                <span className="min-w-0">
                  <span className="block font-medium">{p.nom}</span>
                  {occupe && <span className="block text-xs text-muted-foreground">{t("ugcIa.dejaEnCours")}</span>}
                </span>
              </label>
            );
          })}
        </div>
        {libres.length > 1 && (
          <Button
            variant="link"
            size="xs"
            onClick={() => setCoches(toutCoche ? new Set() : new Set(libres.slice(0, PERSONAS_MAX_PAR_LANCEMENT).map((p) => p.id)))}
          >
            {toutCoche ? t("ugcIa.toutDecocher") : t("ugcIa.toutCocher")}
          </Button>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("ugcIa.qualite")}</span>
        <Segments libelle={t("ugcIa.resolution")} options={RESOLUTIONS} actif={resolution} onChange={setResolution} />
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">{t("ugcIa.reglagesAvances")}</summary>
        <Textarea className="mt-2" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} aria-label={t("ugcIa.prompt")} />
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" loading={lancer.isPending} disabled={choisis.length === 0} onClick={() => lancer.mutate()}>
          <Sparkles aria-hidden />
          {choisis.length === 0 ? t("ugcIa.cocheUnPersona") : t("ugcIa.genererPour", { count: choisis.length })}
        </Button>
        <span className="text-xs text-muted-foreground">{t("ugcIa.facturation")}</span>
      </div>
      <Alerte erreur={lancer.error} />
      <ResultatsLancement resultats={lancer.data?.resultats} />
    </>
  );
}

/** Les personas pour lesquels le lancement n'est pas parti (les autres apparaissent en cours). */
function ResultatsLancement({ resultats }: { resultats: ResultatLancement[] | undefined }) {
  const ratees = (resultats ?? []).filter((r) => r.erreur);
  if (ratees.length === 0) return null;
  return (
    <ul role="alert" className="space-y-0.5 text-xs text-destructive">
      {ratees.map((r) => (
        <li key={r.personaId}>
          {r.nom ?? r.personaId} : {r.erreur}
        </li>
      ))}
    </ul>
  );
}

/**
 * Une vidéo générée : son état, son résultat, de quoi la monter (recadrer,
 * bandeau) et de quoi la refaire (autre qualité, autre prompt).
 */
function CarteGeneration({
  generation: g,
  persona,
  occupe,
  ctaTexte,
}: {
  generation: GenerationUgcIa;
  persona: PersonaUgcIa | null;
  occupe: boolean;
  ctaTexte: string | null;
}) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const [refaire, setRefaire] = React.useState(false);
  const [monter, setMonter] = React.useState(false);
  const montageEnCours = g.montage_statut === "en_cours";
  const [prompt, setPrompt] = React.useState(g.prompt || PROMPT_DEFAUT);
  const [resolution, setResolution] = React.useState<ResolutionUgcIa>(g.resolution);
  const relancer = useMutation({
    mutationFn: () => genererUgcIa(g.source_id, [g.persona_id], prompt, resolution),
    onSuccess: (r) => {
      if (!r.resultats.some((x) => x.erreur)) setRefaire(false);
    },
    onSettled: rafraichir,
  });
  const supprimer = useMutation({ mutationFn: () => supprimerGenerationUgcIa(g.id), onSuccess: rafraichir });
  const nom = persona?.nom ?? "?";

  return (
    <div className="space-y-2 rounded-lg border p-2" data-testid={`generation-${g.id}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {persona && <img src={persona.image_url} alt="" className="size-6 rounded-full object-cover" />}
        <span className="font-medium">{nom}</span>
        <Badge variant={VARIANTE_STATUT[g.statut]}>{t(`ugcIa.statut.${g.statut}`)}</Badge>
        {estMontee(g) && <Badge variant="info">{t("ugcIa.montage.montee")}</Badge>}
        <span className="text-muted-foreground">
          {g.resolution}
          {g.debut_s != null && g.fin_s != null && ` · ${g.debut_s}→${g.fin_s} s`}
        </span>
      </div>
      {g.statut === "en_cours" && (
        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-2 text-center text-xs text-muted-foreground">
          <Spinner />
          <p>{t("ugcIa.enCours")}</p>
          <p>{t("ugcIa.enCoursDetail")}</p>
        </div>
      )}
      {montageEnCours && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          {t("ugcIa.montage.enCours")}
        </p>
      )}
      {g.montage_statut === "echec" && g.montage_erreur && (
        <p role="alert" className="text-xs text-destructive">
          {t("ugcIa.montage.echec", { erreur: g.montage_erreur })}
        </p>
      )}
      {g.statut === "prete" && g.video_url && (
        <video key={g.video_url} src={g.video_url} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-lg bg-black object-contain" />
      )}
      {g.erreur && (
        <p role="alert" className="text-xs text-destructive">
          {g.erreur}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {g.statut === "prete" && g.video_url && (
          <Button variant="outline" size="xs" render={<a href={g.video_url} download />}>
            <Download aria-hidden />
            {t("ugcIa.telecharger")}
          </Button>
        )}
        {g.statut === "prete" && g.video_brute_url && (
          <Button variant="outline" size="xs" disabled={montageEnCours} onClick={() => setMonter(true)}>
            <Clapperboard aria-hidden />
            {t("ugcIa.montage.monter")}
          </Button>
        )}
        {g.statut !== "en_cours" && (
          <Button variant="outline" size="xs" disabled={occupe} title={occupe ? t("ugcIa.personaOccupe") : undefined} onClick={() => setRefaire((v) => !v)}>
            <RotateCcw aria-hidden />
            {t("ugcIa.refaire")}
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          loading={supprimer.isPending}
          onClick={() => {
            if (window.confirm(t(g.statut === "en_cours" ? "ugcIa.confirmerSuppressionEnCours" : "ugcIa.confirmerSuppression"))) supprimer.mutate();
          }}
        >
          <Trash2 aria-hidden />
          {t("ugcIa.supprimer")}
        </Button>
      </div>
      {refaire && (
        <div className="space-y-2 border-t pt-2">
          <Segments libelle={t("ugcIa.resolution")} options={RESOLUTIONS} actif={resolution} onChange={setResolution} />
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} aria-label={t("ugcIa.prompt")} />
          <Button size="xs" className="w-full" loading={relancer.isPending} onClick={() => relancer.mutate()}>
            <Sparkles aria-hidden />
            {t("ugcIa.refairePour", { nom })}
          </Button>
          <ResultatsLancement resultats={relancer.data?.resultats} />
        </div>
      )}
      <Alerte erreur={relancer.error ?? supprimer.error} />
      {monter && <DialogueMontage generation={g} nomPersona={nom} ctaTexte={ctaTexte} ouvert={monter} fermer={() => setMonter(false)} />}
    </div>
  );
}
