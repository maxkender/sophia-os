import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, RefreshCw, RotateCcw, Save, Scissors, Sparkles, Trash2 } from "lucide-react";

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
import {
  arrondiDixieme,
  basculer,
  erreurPassage,
  lireSecondes,
  messageErreur,
  passageInitial,
  PASSAGE_MAX_S,
  personasOccupes,
  peutCouper,
  PERSONAS_MAX_PAR_LANCEMENT,
  PROMPT_DEFAUT,
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

const VIDEO = "aspect-[9/16] w-full rounded-lg bg-black object-contain";

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

/**
 * Une réaction de référence : la vidéo TikTok et son passage coupé, son CTA
 * (premier écran + texte, corrigeable), le lancement pour les personas
 * cochés, puis toutes les vidéos générées à partir d'elle.
 */
export function CarteSource({ source, personas }: { source: SourceUgcIa; personas: PersonaUgcIa[] }) {
  const { t, i18n } = useTranslation();
  const rafraichir = useRafraichir();
  const supprimer = useMutation({ mutationFn: () => supprimerSourceUgcIa(source.id), onSuccess: rafraichir });
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.created_at));
  const vues = source.source_vues != null ? new Intl.NumberFormat(i18n.language, { notation: "compact" }).format(source.source_vues) : null;
  const enCours = source.generations.some((g) => g.statut === "en_cours");
  const parId = new Map(personas.map((p) => [p.id, p]));

  return (
    <Card data-testid={`source-${source.id}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <a href={source.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
            {t("ugcIa.source")}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          {vues && <span className="text-muted-foreground">{t("ugcIa.vues", { vues })}</span>}
          <span className="text-muted-foreground">{date}</span>
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
      <CardContent className="space-y-5">
        {source.source_texte && <p className="line-clamp-2 text-xs text-muted-foreground">« {source.source_texte} »</p>}
        <Alerte erreur={supprimer.error} />
        <div className="grid gap-4 md:grid-cols-3">
          {source.brut_url && <BlocCoupe source={source} bloque={!peutCouper(source.generations)} />}
          <BlocCta source={source} />
          <BlocLancement source={source} personas={personas} />
        </div>
        {source.generations.length > 0 && (
          <section className="space-y-2" aria-label={t("ugcIa.videosGenerees")}>
            <h3 className="text-xs font-semibold">{t("ugcIa.videosGenerees")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {source.generations.map((g) => (
                <CarteGeneration
                  key={g.id}
                  generation={g}
                  persona={parId.get(g.persona_id) ?? null}
                  occupe={g.statut !== "en_cours" && personasOccupes(source.generations).has(g.persona_id)}
                />
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

/** La vidéo TikTok entière et le passage à garder (début, fin). */
function BlocCoupe({ source, bloque }: { source: SourceUgcIa; bloque: boolean }) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const lecteur = React.useRef<HTMLVideoElement>(null);
  const [debut, setDebut] = React.useState(() => passageInitial(source).debut);
  const [fin, setFin] = React.useState(() => passageInitial(source).fin);
  const d = lireSecondes(debut);
  const f = lireSecondes(fin);
  const erreur = erreurPassage(d, f, source.source_duree_s);
  const couper = useMutation({ mutationFn: () => couperPassageUgcIa(source.id, d ?? 0, f ?? 0), onSuccess: rafraichir });
  const maintenant = () => arrondiDixieme(lecteur.current?.currentTime ?? 0);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        {t("ugcIa.videoSource")}
        {source.source_duree_s != null && <span className="text-muted-foreground"> · {Math.round(source.source_duree_s)} s</span>}
      </p>
      <video ref={lecteur} src={source.brut_url ?? undefined} controls muted playsInline className={VIDEO} />
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
      {erreur && <p className="text-xs text-destructive">{t(`ugcIa.erreurPassage.${erreur}`, { max: PASSAGE_MAX_S })}</p>}
      {bloque && <p className="text-xs text-muted-foreground">{t("ugcIa.coupeBloquee")}</p>}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        loading={couper.isPending}
        disabled={erreur != null || bloque}
        onClick={() => couper.mutate()}
      >
        <Scissors aria-hidden />
        {source.coupe_url ? t("ugcIa.recouper") : t("ugcIa.couper")}
      </Button>
      <Alerte erreur={couper.error} />
    </div>
  );
}

/** Le CTA de la source : son premier écran et le texte qu'on y lit, corrigeable à la main. */
function BlocCta({ source }: { source: SourceUgcIa }) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const [texte, setTexte] = React.useState(source.cta_texte ?? "");
  // Le texte enregistré change (recapture, autre onglet) : on suit, sauf saisie en cours.
  const [base, setBase] = React.useState(source.cta_texte ?? "");
  if ((source.cta_texte ?? "") !== base) {
    if (texte === base) setTexte(source.cta_texte ?? "");
    setBase(source.cta_texte ?? "");
  }
  const enregistrer = useMutation({ mutationFn: () => enregistrerCtaUgcIa(source.id, texte), onSuccess: rafraichir });
  const relire = useMutation({ mutationFn: () => lireCtaUgcIa(source.id), onSuccess: rafraichir });
  const modifie = texte.trim() !== (source.cta_texte ?? "").trim();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{t("ugcIa.cta")}</p>
      {source.cta_image_url ? (
        <img src={source.cta_image_url} alt={t("ugcIa.premierEcran")} className={VIDEO} />
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {t("ugcIa.ctaAbsent")}
        </div>
      )}
      <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} aria-label={t("ugcIa.ctaTexte")} placeholder={t("ugcIa.ctaVide")} />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" loading={enregistrer.isPending} disabled={!modifie} onClick={() => enregistrer.mutate()}>
          <Save aria-hidden />
          {t("ugcIa.enregistrer")}
        </Button>
        <Button variant="outline" size="sm" loading={relire.isPending} disabled={!source.brut_url} onClick={() => relire.mutate()}>
          <RefreshCw aria-hidden />
          {source.cta_image_url ? t("ugcIa.relireCta") : t("ugcIa.capturerCta")}
        </Button>
      </div>
      <Alerte erreur={enregistrer.error ?? relire.error} />
    </div>
  );
}

/** Le passage coupé et le lancement de Genjutsu pour les personas cochés. */
function BlocLancement({ source, personas }: { source: SourceUgcIa; personas: PersonaUgcIa[] }) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const [coches, setCoches] = React.useState<Set<string>>(() => new Set());
  const [prompt, setPrompt] = React.useState(PROMPT_DEFAUT);
  const [resolution, setResolution] = React.useState<ResolutionUgcIa>("720p");
  const occupes = personasOccupes(source.generations);
  const choisis = [...coches].filter((id) => !occupes.has(id));
  const lancer = useMutation({
    mutationFn: () => genererUgcIa(source.id, choisis, prompt, resolution),
    onSuccess: () => setCoches(new Set()),
    onSettled: rafraichir,
  });

  if (!source.coupe_url) {
    return (
      <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
        {t("ugcIa.coupeDabord")}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{t("ugcIa.passage", { debut: source.debut_s, fin: source.fin_s })}</p>
      <video src={source.coupe_url} controls muted playsInline className="aspect-[9/16] max-h-80 w-full rounded-lg bg-black object-contain" />
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">{t("ugcIa.personasACocher", { max: PERSONAS_MAX_PAR_LANCEMENT })}</legend>
        <div className="flex flex-wrap gap-1.5">
          {personas.map((p) => {
            const occupe = occupes.has(p.id);
            return (
              <label
                key={p.id}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs has-checked:border-primary has-checked:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                title={occupe ? t("ugcIa.personaOccupe") : p.description}
              >
                <input type="checkbox" checked={coches.has(p.id) && !occupe} disabled={occupe} onChange={() => setCoches((c) => basculer(c, p.id))} />
                <img src={p.image_url} alt="" className="size-5 rounded-full object-cover" />
                {p.nom}
              </label>
            );
          })}
        </div>
      </fieldset>
      <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} aria-label={t("ugcIa.prompt")} />
      <Segments libelle={t("ugcIa.resolution")} options={RESOLUTIONS} actif={resolution} onChange={setResolution} />
      <p className="text-xs text-muted-foreground">{t("ugcIa.facturation")}</p>
      <Button size="sm" className="w-full" loading={lancer.isPending} disabled={choisis.length === 0} onClick={() => lancer.mutate()}>
        <Sparkles aria-hidden />
        {t("ugcIa.genererPour", { count: choisis.length })}
      </Button>
      <Alerte erreur={lancer.error} />
      <ResultatsLancement resultats={lancer.data?.resultats} />
    </div>
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

/** Une vidéo générée : son état, son résultat, et de quoi la refaire (autre qualité, autre prompt). */
function CarteGeneration({ generation: g, persona, occupe }: { generation: GenerationUgcIa; persona: PersonaUgcIa | null; occupe: boolean }) {
  const { t } = useTranslation();
  const rafraichir = useRafraichir();
  const [refaire, setRefaire] = React.useState(false);
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
        {persona && <img src={persona.image_url} alt="" className="size-5 rounded-full object-cover" />}
        <span className="font-medium">{nom}</span>
        <Badge variant={VARIANTE_STATUT[g.statut]}>{t(`ugcIa.statut.${g.statut}`)}</Badge>
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
      {g.statut === "prete" && g.video_url && <video src={g.video_url} controls playsInline className={VIDEO} />}
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
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} aria-label={t("ugcIa.prompt")} />
          <Segments libelle={t("ugcIa.resolution")} options={RESOLUTIONS} actif={resolution} onChange={setResolution} />
          <Button size="xs" className="w-full" loading={relancer.isPending} onClick={() => relancer.mutate()}>
            <Sparkles aria-hidden />
            {t("ugcIa.refairePour", { nom })}
          </Button>
          <ResultatsLancement resultats={relancer.data?.resultats} />
        </div>
      )}
      <Alerte erreur={relancer.error ?? supprimer.error} />
    </div>
  );
}
