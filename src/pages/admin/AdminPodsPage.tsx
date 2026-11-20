import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Boxes } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Replie } from "@/components/ui/replie";
import { SectionBoitePodz } from "@/features/bleo/SectionBoitePodz";
import { Aide } from "@/features/moteur/repartition/graphes";
import {
  lireFichesPods,
  lireTableauPods,
  listerLivraisons,
  listerOuverturesLangues,
  listerPlaces,
  listerPods,
  parPod,
  POD_VIDEO,
} from "@/features/pods/api";
import { CarteSeriesPods } from "@/features/pods/CarteSeriesPods";
import { CarteJours, CartePercees, ChiffresPods } from "@/features/pods/Chiffres";
import { assemblerPodz } from "@/features/pods/identite";
import { ListePodz } from "@/features/pods/ListePodz";
import { InterrupteurAuto, LigneLivraison, ToutValiderEnB } from "@/features/pods/Livraisons";
import { Onglets } from "@/features/pods/Onglets";
import { lignesPods, resumePods } from "@/features/pods/resume";
import { SectionPlaces } from "@/features/pods/SectionPlaces";

/** Les vues de la page : les podz, les places libres (allocation), la file de validation, les chiffres (dont la boîte BLEO). */
type Vue = "podz" | "places" | "valider" | "chiffres";
const VUES: readonly Vue[] = ["podz", "places", "valider", "chiffres"];

/** La file de validation : une carte par podz qui a quelque chose à décider, puis l'historique. */
function FileValidation() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({ queryKey: ["pods", "livraisons"], queryFn: listerLivraisons });
  const pods = useQuery({ queryKey: ["pods", "liste"], queryFn: listerPods });

  const liste = pods.data ?? [];
  const attente = parPod(liste, data?.aValider ?? []);
  const slugs = [...attente.keys()].filter((slug) => attente.get(slug)!.length > 0);
  const infos = (slug: string) => liste.find((p) => p.slug === slug);
  const decidees = data?.decidees ?? [];

  return (
    <div className="space-y-6">
      {(error || pods.error) && <p className="text-sm text-destructive">{((error ?? pods.error) as Error).message}</p>}

      {!isLoading && !slugs.length && (
        <EmptyState icon={<Boxes />} title={t("pods.vide")} description={t("pods.videDesc")} />
      )}

      {slugs.map((slug) => {
        const pod = infos(slug);
        const aValider = attente.get(slug) ?? [];
        return (
          <Card key={slug} id={`pod-${slug}`} className="scroll-mt-20">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {pod?.label ?? pod?.nom ?? slug}
                {pod?.label && <span className="text-xs font-normal text-muted-foreground">{pod.nom}</span>}
                {pod && !pod.actif && <Badge variant="destructive">{t("pods.inactif")}</Badge>}
              </CardTitle>
              <CardDescription>{t("pods.enAttente", { count: aValider.length })}</CardDescription>
              {pod && slug !== POD_VIDEO && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  <InterrupteurAuto pod={pod} />
                  <ToutValiderEnB livraisons={aValider} />
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border/60">
                {aValider.map((l) => (
                  <LigneLivraison key={l.id} livraison={l} pod={pod} />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {decidees.length > 0 && (
        <Replie titre={`${t("pods.historique")} (${decidees.length})`} paresseux>
          <div className="divide-y divide-border/60">
            {decidees.map((l) => (
              <div key={l.id}>
                <p className="pt-4 text-xs font-medium text-muted-foreground">{infos(l.pod)?.label ?? infos(l.pod)?.nom ?? l.pod}</p>
                <LigneLivraison livraison={l} />
              </div>
            ))}
          </div>
        </Replie>
      )}
    </div>
  );
}

export function AdminPodsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  // Les anciens liens : `#boite-podz` (redirigé depuis /admin/bleo/podz) ouvre la vue des chiffres,
  // `#pod-<slug>` ouvre la fiche du podz.
  const demandee = params.get("vue") as Vue | null;
  const vue: Vue = demandee && VUES.includes(demandee) ? demandee : hash === "#boite-podz" || params.has("boite") ? "chiffres" : "podz";
  React.useEffect(() => {
    if (hash.startsWith("#pod-")) navigate(`/admin/pods/${hash.slice(5)}`, { replace: true });
  }, [hash, navigate]);
  React.useEffect(() => {
    if (vue === "chiffres" && hash === "#boite-podz") document.getElementById("boite-podz")?.scrollIntoView();
  }, [vue, hash]);

  const pods = useQuery({ queryKey: ["pods", "liste"], queryFn: listerPods });
  const fiches = useQuery({ queryKey: ["pods", "fiches"], queryFn: lireFichesPods, staleTime: 60_000 });
  const tableau = useQuery({ queryKey: ["pods", "tableau"], queryFn: () => lireTableauPods(14) });
  const ouvertures = useQuery({ queryKey: ["pods", "ouvertures"], queryFn: listerOuverturesLangues, staleTime: 300_000 });
  const livraisons = useQuery({ queryKey: ["pods", "livraisons"], queryFn: listerLivraisons });
  // Avant la migration 0782, la fonction n'existe pas : l'onglet reste, sans compteur.
  const places = useQuery({ queryKey: ["pods", "places"], queryFn: listerPlaces, retry: false });

  const resume = tableau.data ? resumePods(tableau.data) : null;
  const lignes = assemblerPodz(pods.data ?? [], fiches.data ?? [], tableau.data?.pods ?? []);
  // La vidéo n'est pas un podz sûr : elle reste à valider une par une.
  const toutesAValider = (livraisons.data?.aValider ?? []).filter((l) => l.pod !== POD_VIDEO);
  const aValider = livraisons.data?.aValider.length ?? resume?.aValider ?? 0;
  const erreur = (pods.error ?? tableau.error ?? fiches.error) as Error | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("pods.title")}
            <Aide libelle={t("pods.title")}>{t("pods.subtitle")}</Aide>
          </span>
        }
        description={t("pods.description")}
        actions={<ToutValiderEnB livraisons={toutesAValider} tous />}
      />

      {resume && <ChiffresPods resume={resume} />}

      <Onglets
        libelle={t("pods.onglets.aria")}
        actif={vue}
        onglets={[
          { cle: "podz", vers: "/admin/pods", contenu: t("pods.onglets.podz"), compteur: pods.data?.filter((p) => p.actif).length },
          { cle: "places", vers: "/admin/pods?vue=places", contenu: t("pods.onglets.places"), compteur: places.data?.length },
          { cle: "valider", vers: "/admin/pods?vue=valider", contenu: t("pods.onglets.valider"), compteur: aValider, alerte: true },
          { cle: "chiffres", vers: "/admin/pods?vue=chiffres", contenu: t("pods.onglets.chiffres") },
        ]}
      />

      {erreur && <p className="text-sm text-destructive">{t("pods.tableau.erreur", { message: erreur.message })}</p>}

      {vue === "podz" && <ListePodz lignes={lignes} ouvertures={ouvertures.data ?? []} />}

      {vue === "places" && <SectionPlaces />}

      {vue === "valider" && <FileValidation />}

      {vue === "chiffres" && (
        <>
          {resume && tableau.data && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <CarteJours resume={resume} />
              <CartePercees percees={tableau.data.percees} nomPod={new Map(tableau.data.pods.map((p) => [p.slug, p.nom]))} />
            </div>
          )}
          {tableau.data && <CarteSeriesPods pods={lignesPods(tableau.data.pods).map((p) => ({ slug: p.slug, nom: p.nom }))} />}
          {/* BLEO : la jauge et la boîte des podz en texte + banque (lecture seule). */}
          <SectionBoitePodz />
        </>
      )}
    </div>
  );
}
