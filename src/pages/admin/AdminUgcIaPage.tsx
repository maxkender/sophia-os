import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronsDownUp, ChevronsUpDown, Clapperboard, Link2, Sparkles, UserRound } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EtatRequete, TitreCarte } from "@/features/bleo/ui";
import {
  CLE_ASSEMBLAGES,
  listerAssemblages,
  assignerPersonaUgcIa,
  CLE_COMPTES_UGCV,
  CLE_PERSONAS_UGC_IA,
  CLE_SOURCES_UGC_IA,
  type CompteUgcv,
  importerTiktokUgcIa,
  listerComptesUgcv,
  listerPersonasUgcIa,
  listerSourcesUgcIa,
  rapatrierPersonasUgcIa,
  suivreGenerationsUgcIa,
  type PersonaUgcIa,
} from "@/features/ugcIa/api";
import { CarteSource } from "@/features/ugcIa/CarteSource";
import { CartePostsUgcv } from "@/features/ugcIa/PostsUgcv";
import { CarteAssemblages } from "@/features/ugcIa/Assemblage";
import { CarteDemos } from "@/features/ugcIa/Demos";
import { videoDAssemblage, type VideoChoisie } from "@/features/ugcIa/logique";
import { useSourcesFermees } from "@/features/ugcIa/accordeon";
import { messageErreur } from "@/features/ugcIa/logique";

/** Toutes les 15 s tant qu'une génération tourne (Genjutsu prend quelques minutes). */
const INTERVALLE_SUIVI_MS = 15_000;
/** Toutes les 5 s tant qu'un montage tourne (le serveur le rend en arrière-plan). */
const INTERVALLE_MONTAGE_MS = 5_000;

/**
 * UGC IA : une réaction TikTok qui marche (la source), refaite par un ou
 * plusieurs personas synthétiques avec Higgsfield Genjutsu. Hors podz ; les
 * vidéos restent ici. Les personas sont ajoutés par Claude (skill `ugc-ia`).
 */
export function AdminUgcIaPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const personas = useQuery({ queryKey: CLE_PERSONAS_UGC_IA, queryFn: listerPersonasUgcIa });
  const sources = useQuery({ queryKey: CLE_SOURCES_UGC_IA, queryFn: listerSourcesUgcIa });
  const enCours = (sources.data ?? []).some((s) => s.generations.some((g) => g.statut === "en_cours"));
  const montageEnCours = (sources.data ?? []).some((s) => s.generations.some((g) => g.montage_statut === "en_cours"));
  const [erreurSuivi, setErreurSuivi] = React.useState<string | null>(null);

  // Un persona ajouté par Claude pointe vers une image externe : on la copie chez nous, une fois.
  const aRapatrier = (personas.data ?? []).some((p) => !p.image_path);
  const rapatriement = React.useRef(false);
  React.useEffect(() => {
    if (!aRapatrier || rapatriement.current) return;
    rapatriement.current = true;
    rapatrierPersonasUgcIa()
      .catch(() => undefined)
      .finally(() => void qc.invalidateQueries({ queryKey: CLE_PERSONAS_UGC_IA }));
  }, [aRapatrier, qc]);

  // Un montage se rend côté serveur : on relit les vidéos jusqu'à ce qu'il soit fini.
  React.useEffect(() => {
    if (!montageEnCours) return;
    const minuteur = setInterval(() => void qc.invalidateQueries({ queryKey: CLE_SOURCES_UGC_IA }), INTERVALLE_MONTAGE_MS);
    return () => clearInterval(minuteur);
  }, [montageEnCours, qc]);

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
      if (actif) await qc.invalidateQueries({ queryKey: CLE_SOURCES_UGC_IA });
    };
    void relever();
    const minuteur = setInterval(() => void relever(), INTERVALLE_SUIVI_MS);
    return () => {
      actif = false;
      clearInterval(minuteur);
    };
  }, [enCours, qc]);

  const liste = personas.data ?? [];
  const accordeon = useSourcesFermees(sources.data?.map((s) => s.id));
  // Une vidéo complète à envoyer en post (bouton « Envoyer » de sa carte).
  const [aEnvoyer, setAEnvoyer] = React.useState<VideoChoisie | null>(null);
  const assemblages = useQuery({ queryKey: CLE_ASSEMBLAGES, queryFn: listerAssemblages });
  const nomPersona = new Map(liste.map((p) => [p.id, p.nom]));
  const completes = (assemblages.data ?? [])
    .map((a) => videoDAssemblage(a, `${(a.persona_id && nomPersona.get(a.persona_id)) || "?"} + ${a.demo_nom ?? "?"}`))
    .filter((v): v is VideoChoisie => v != null);
  const nbSources = sources.data?.length ?? 0;
  const nbFermees = (sources.data ?? []).filter((s) => accordeon.fermees.has(s.id)).length;
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

      <EtatRequete erreur={personas.error ?? sources.error} chargement={personas.isLoading || sources.isLoading} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CartePersonas personas={liste} chargees={Boolean(personas.data)} />
        <CarteImport />
      </div>

      <CarteAssemblages personas={liste} envoyer={setAEnvoyer} />

      <CartePostsUgcv sources={sources.data ?? []} personas={liste} completes={completes} aEnvoyer={aEnvoyer} finEnvoi={() => setAEnvoyer(null)} />

      <CarteDemos sources={sources.data ?? []} />

      <section className="space-y-3" aria-labelledby="ugc-ia-sources">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ugc-ia-sources" className="flex items-center gap-2 text-sm font-semibold">
            <Clapperboard className="size-4 text-muted-foreground" aria-hidden />
            {t("ugcIa.sources")}
            {nbSources > 0 && <span className="font-normal text-muted-foreground">({nbSources})</span>}
          </h2>
          {nbSources > 1 && (
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" disabled={nbFermees === 0} onClick={accordeon.toutOuvrir}>
                <ChevronsUpDown aria-hidden />
                {t("ugcIa.toutOuvrir")}
              </Button>
              <Button variant="ghost" size="xs" disabled={nbFermees === nbSources} onClick={accordeon.toutFermer}>
                <ChevronsDownUp aria-hidden />
                {t("ugcIa.toutFermer")}
              </Button>
            </div>
          )}
        </div>
        {erreurSuivi && (
          <p role="alert" className="text-sm text-destructive">
            {t("ugcIa.erreurSuivi", { message: erreurSuivi })}
          </p>
        )}
        {sources.data && sources.data.length === 0 && (
          <EmptyState icon={<Clapperboard />} title={t("ugcIa.vide")} description={t("ugcIa.videDetail")} />
        )}
        {sources.data?.map((s) => (
          <CarteSource key={s.id} source={s} personas={liste} ouverte={!accordeon.fermees.has(s.id)} basculer={() => accordeon.basculer(s.id)} />
        ))}
      </section>
    </div>
  );
}

function CartePersonas({ personas, chargees }: { personas: PersonaUgcIa[]; chargees: boolean }) {
  const { t } = useTranslation();
  const comptes = useQuery({ queryKey: CLE_COMPTES_UGCV, queryFn: listerComptesUgcv });
  return (
    <Card>
      <CardHeader>
        <TitreCarte icone={UserRound}>{t("ugcIa.personas", { count: personas.length })}</TitreCarte>
      </CardHeader>
      <CardContent className="space-y-3">
        {chargees && personas.length === 0 && <p className="text-sm text-muted-foreground">{t("ugcIa.aucunPersona")}</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {personas.map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <img src={p.image_url} alt={p.nom} className="size-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">{p.nom}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                <CompteDuPersona persona={p} personas={personas} comptes={comptes.data ?? []} />
              </div>
            </li>
          ))}
        </ul>
        {comptes.data && comptes.data.length === 0 && <p className="text-xs text-muted-foreground">{t("ugcIa.aucunCompteUgcv")}</p>}
        <p className="text-xs text-muted-foreground">{t("ugcIa.ajoutParClaude")}</p>
      </CardContent>
    </Card>
  );
}

/** Le compte UGCV d'un persona : 1 persona = 1 compte, le compte est repris à son ancien persona. */
function CompteDuPersona({ persona, personas, comptes }: { persona: PersonaUgcIa; personas: PersonaUgcIa[]; comptes: CompteUgcv[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const assigner = useMutation({
    mutationFn: (compteId: string | null) => assignerPersonaUgcIa(persona.id, compteId),
    onSettled: () => qc.invalidateQueries({ queryKey: CLE_PERSONAS_UGC_IA }),
  });
  const titulaire = (compteId: string) => personas.find((x) => x.compte_id === compteId && x.id !== persona.id);
  // Un compte qui n'est plus UGCV reste affiché tant qu'il est rattaché.
  const connu = !persona.compte_id || comptes.some((c) => c.id === persona.compte_id);
  return (
    <div className="space-y-0.5">
      <select
        className="h-7 w-full max-w-[14rem] rounded-md border bg-background px-1.5 text-xs"
        value={persona.compte_id ?? ""}
        disabled={assigner.isPending || (comptes.length === 0 && !persona.compte_id)}
        onChange={(e) => assigner.mutate(e.target.value || null)}
        aria-label={t("ugcIa.compteDe", { nom: persona.nom })}
      >
        <option value="">{t("ugcIa.sansCompte")}</option>
        {!connu && persona.compte_id && <option value={persona.compte_id}>{t("ugcIa.compteInconnu")}</option>}
        {comptes.map((c) => {
          const autre = titulaire(c.id);
          return (
            <option key={c.id} value={c.id}>
              {libelleCompte(c)}
              {autre ? ` (${t("ugcIa.repris", { nom: autre.nom })})` : ""}
            </option>
          );
        })}
      </select>
      {assigner.error && <p className="text-xs text-destructive">{messageErreur(assigner.error)}</p>}
    </div>
  );
}

function libelleCompte(c: CompteUgcv): string {
  const nom = c.handle_tiktok ? `@${c.handle_tiktok}` : (c.persona_nom ?? c.id.slice(0, 8));
  return [nom, c.poster_prenom, c.langue?.toUpperCase()].filter(Boolean).join(" · ");
}

function CarteImport() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lien, setLien] = React.useState("");
  const importer = useMutation({
    mutationFn: () => importerTiktokUgcIa(lien.trim()),
    onSuccess: async () => {
      setLien("");
      await qc.invalidateQueries({ queryKey: CLE_SOURCES_UGC_IA });
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
          <li>{t("ugcIa.etape2")}</li>
          <li>{t("ugcIa.etape3")}</li>
          <li>{t("ugcIa.etape4")}</li>
        </ol>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (lien.trim()) importer.mutate();
          }}
        >
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            className="min-w-0 flex-1"
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            placeholder="https://www.tiktok.com/@…/video/…"
            aria-label={t("ugcIa.lienTiktok")}
          />
          <Button type="submit" loading={importer.isPending} disabled={!lien.trim()}>
            <Sparkles aria-hidden />
            {t("ugcIa.importer")}
          </Button>
        </form>
        {importer.isPending && <p className="text-xs text-muted-foreground">{t("ugcIa.importEnCours")}</p>}
        {importer.data?.avertissement && <p className="text-xs text-warning-foreground">{importer.data.avertissement}</p>}
        {importer.error && (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(importer.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
