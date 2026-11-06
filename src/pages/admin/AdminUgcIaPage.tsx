import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Clapperboard, Sparkles, UserRound } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EtatRequete, TitreCarte } from "@/features/bleo/ui";
import {
  CLE_PERSONAS_UGC_IA,
  CLE_SOURCES_UGC_IA,
  importerTiktokUgcIa,
  listerPersonasUgcIa,
  listerSourcesUgcIa,
  rapatrierPersonasUgcIa,
  suivreGenerationsUgcIa,
  type PersonaUgcIa,
} from "@/features/ugcIa/api";
import { CarteSource } from "@/features/ugcIa/CarteSource";
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

      <section className="space-y-3" aria-labelledby="ugc-ia-sources">
        <h2 id="ugc-ia-sources" className="text-sm font-semibold">
          {t("ugcIa.sources")}
        </h2>
        {erreurSuivi && (
          <p role="alert" className="text-sm text-destructive">
            {t("ugcIa.erreurSuivi", { message: erreurSuivi })}
          </p>
        )}
        {sources.data && sources.data.length === 0 && (
          <EmptyState icon={<Clapperboard />} title={t("ugcIa.vide")} description={t("ugcIa.videDetail")} />
        )}
        {sources.data?.map((s) => <CarteSource key={s.id} source={s} personas={liste} />)}
      </section>
    </div>
  );
}

function CartePersonas({ personas, chargees }: { personas: PersonaUgcIa[]; chargees: boolean }) {
  const { t } = useTranslation();
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
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.nom}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("ugcIa.ajoutParClaude")}</p>
      </CardContent>
    </Card>
  );
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
