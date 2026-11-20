import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Boxes } from "lucide-react";

import { EtiquetteApplication, LogoApplication } from "@/components/brand/LogoApplication";
import { abrege } from "@/components/charts/echelle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Replie } from "@/components/ui/replie";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { SEUIL_STOCK_JOURS } from "@/features/moteur/pilotage";
import { BoiteDuLabel } from "@/features/bleo/SectionBoitePodz";
import { Aide } from "@/features/moteur/repartition/graphes";
import {
  autonomieMin,
  lireFichesPods,
  lireTableauPods,
  listerLivraisonsDuPod,
  listerOuverturesLangues,
  listerPods,
  listerSourcesDuLabel,
  POD_VIDEO,
} from "@/features/pods/api";
import { BlocLangues } from "@/features/pods/BlocLangues";
import { CarteRattrapage } from "@/features/pods/CarteRattrapage";
import { CarteSeriesPods } from "@/features/pods/CarteSeriesPods";
import { ComptesDuPod } from "@/features/pods/ComptesDuPod";
import { EtiquetteEtat, EtiquetteFormat, LienCompte } from "@/features/pods/Etiquettes";
import { LigneFiche, RythmePodz } from "@/features/pods/FichePodz";
import { assemblerPodz, etatLangues, langueEcriture } from "@/features/pods/identite";
import { InterrupteurAuto, LigneLivraison, ToutValiderEnB } from "@/features/pods/Livraisons";
import { PanneauDemos, PanneauPersonas } from "@/features/pods/PanneauxVideo";
import { dossierPod } from "@/features/pods/rythme";
import { localeDate } from "@/locales/localeDate";

/** Une liste de comptes TikTok, séparés par des virgules. */
function Comptes({ handles }: { handles: string[] }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {handles.map((h) => (
        <LienCompte key={h} handle={h} />
      ))}
    </span>
  );
}

/** La fiche d'un podz : ce qu'il est, ses langues, ses comptes, son rythme, ses livraisons. */
export function AdminPodzFichePage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const langue = i18n.language;

  const pods = useQuery({ queryKey: ["pods", "liste"], queryFn: listerPods });
  const fiches = useQuery({ queryKey: ["pods", "fiches"], queryFn: lireFichesPods, staleTime: 60_000 });
  const tableau = useQuery({ queryKey: ["pods", "tableau"], queryFn: () => lireTableauPods(14) });
  const ouvertures = useQuery({ queryKey: ["pods", "ouvertures"], queryFn: listerOuverturesLangues, staleTime: 300_000 });
  const livraisons = useQuery({ queryKey: ["pods", "livraisons", slug], queryFn: () => listerLivraisonsDuPod(slug), enabled: Boolean(slug) });

  const lignes = assemblerPodz(pods.data ?? [], fiches.data ?? [], tableau.data?.pods ?? []);
  const ligne = lignes.find((l) => l.pod.slug === slug);
  const labelId = ligne?.pod.label_id ?? null;
  const sources = useQuery({
    queryKey: ["pods", "sources", labelId],
    queryFn: () => listerSourcesDuLabel(labelId!),
    enabled: Boolean(labelId),
    staleTime: 300_000,
  });

  const retour = (
    <Link to="/admin/pods" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden />
      {t("pods.page.retour")}
    </Link>
  );

  if (pods.error) return <p className="text-sm text-destructive">{(pods.error as Error).message}</p>;
  if (!ligne) {
    return (
      <div className="space-y-6">
        {retour}
        {!pods.isLoading && <EmptyState icon={<Boxes />} title={t("pods.page.inconnu")} description={slug} />}
      </div>
    );
  }

  const { pod, fiche, format, modeles } = ligne;
  const video = pod.slug === POD_VIDEO;
  const chiffres = ligne.tableau;
  const runway = chiffres ? autonomieMin(chiffres.autonomie) : null;
  const langues = etatLangues(pod.langues, fiche?.comptes_par_langue ?? {}, (ouvertures.data ?? []).filter((o) => o.pod === pod.slug), pod.langues_pretes);
  const aValider = livraisons.data?.aValider ?? [];
  const decidees = livraisons.data?.decidees ?? [];
  const langueSource = langueEcriture([...aValider, ...decidees]);
  const freres = lignes.filter((l) => ligne.freres.includes(l.pod.slug));
  const nSources = sources.data?.length ?? 0;
  const vues = chiffres?.vues_moyenne ?? chiffres?.vues_mediane ?? null;

  return (
    <div className="space-y-6">
      {retour}

      {/* L'identité, en une ligne : l'appli, le label, le format, l'état. */}
      <header className="flex flex-wrap items-start gap-4">
        {pod.apps[0] ? (
          <LogoApplication slug={pod.apps[0]} taille="lg" className="mt-0.5 size-12 rounded-xl" />
        ) : (
          <span className="mt-0.5 inline-flex size-12 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
            <Boxes className="size-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-semibold">{ligne.titre}</h1>
            <EtiquetteFormat format={format} />
            <EtiquetteEtat actif={pod.actif} comptes={fiche?.comptes ?? null} />
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span>{pod.nom}</span>
            <span aria-hidden>·</span>
            <span className="font-mono text-xs">{pod.slug}</span>
            {pod.cree_le && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {t("pods.page.lance", {
                    date: new Date(pod.cree_le).toLocaleDateString(localeDate(langue), { day: "numeric", month: "long", year: "numeric" }),
                  })}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {!video && (
        <StatGroup>
          <StatTile
            label={t("pods.page.comptes")}
            value={fiche ? fiche.comptes : "—"}
            tone={pod.actif && fiche?.comptes === 0 ? "alerte" : "neutre"}
            detail={fiche ? t("pods.page.comptesDetail", { count: Object.keys(fiche.comptes_par_langue).length }) : undefined}
          />
          <StatTile
            label={t("pods.tableau.vuesMoyenne")}
            value={vues == null ? "—" : abrege(vues, langue)}
            detail={
              chiffres?.vues_mediane != null
                ? `${t("pods.tableau.mediane", { n: abrege(chiffres.vues_mediane, langue) })}${chiffres.pct_10k != null ? ` · ${chiffres.pct_10k} % ${t("pods.tableau.pct10k")}` : ""}`
                : undefined
            }
          />
          <StatTile
            label={t("pods.tableau.publies7j")}
            value={chiffres ? chiffres.publies_7j : "—"}
            detail={chiffres ? t("pods.page.publies30", { n: chiffres.publies_30j }) : undefined}
          />
          <StatTile
            label={t("pods.liste.colReserve")}
            aide={<Aide libelle={t("pods.liste.colReserve")}>{t("pods.tableau.runwayAide")}</Aide>}
            value={runway?.jours != null ? t("pods.runwayJours", { n: runway.jours.toLocaleString() }) : "—"}
            tone={runway?.jours != null && runway.jours < SEUIL_STOCK_JOURS ? "alerte" : "neutre"}
            detail={runway?.reserve_label_jours != null ? t("pods.runwayLabel", { n: runway.reserve_label_jours.toLocaleString() }) : undefined}
          />
        </StatGroup>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("pods.identite.titre")}</CardTitle>
            <CardDescription>{t("pods.identite.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              <LigneFiche libelle={t("pods.identite.label")}>
                {pod.label ? <span className="font-mono">{pod.label}</span> : <span className="text-muted-foreground">{t("pods.identite.sansLabel")}</span>}
              </LigneFiche>
              {pod.apps.length > 0 && (
                <LigneFiche libelle={t("pods.identite.application", { count: pod.apps.length })}>
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {pod.apps.map((a) => (
                      <EtiquetteApplication key={a} slug={a} />
                    ))}
                  </span>
                </LigneFiche>
              )}
              <LigneFiche libelle={t("pods.identite.format")}>
                <span className="font-medium">{t(`pods.format.${format}`)}</span>
                <span className="text-muted-foreground"> · {t(`pods.format.${format}Aide`)}</span>
              </LigneFiche>
              <LigneFiche
                libelle={
                  <span className="inline-flex items-center gap-1">
                    {t("pods.identite.modele", { count: modeles.length || 1 })}
                    <Aide libelle={t("pods.identite.modele", { count: 1 })}>{t("pods.identite.modeleAide")}</Aide>
                  </span>
                }
              >
                {modeles.length ? <Comptes handles={modeles} /> : <span className="text-muted-foreground">{t("pods.identite.sansModele")}</span>}
              </LigneFiche>
              {!video && (
                <LigneFiche
                  libelle={
                    <span className="inline-flex items-center gap-1">
                      {t("pods.identite.sources")}
                      <Aide libelle={t("pods.identite.sources")}>{t("pods.identite.sourcesAide")}</Aide>
                    </span>
                  }
                >
                  {sources.error ? (
                    <span className="text-muted-foreground">—</span>
                  ) : nSources ? (
                    <div className="space-y-1">
                      <Link to="/admin/sources" className="font-medium underline-offset-2 hover:underline">
                        {t("pods.identite.sourcesN", { count: nSources })}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        <Comptes handles={sources.data!} />
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{t("pods.identite.sansSource")}</span>
                  )}
                </LigneFiche>
              )}
              {freres.length > 0 && (
                <LigneFiche libelle={t("pods.identite.freres")}>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {freres.map((f) => (
                      <Link key={f.pod.slug} to={`/admin/pods/${f.pod.slug}`} className="underline-offset-2 hover:underline">
                        {f.pod.nom}
                      </Link>
                    ))}
                  </span>
                </LigneFiche>
              )}
              <LigneFiche libelle={t("pods.identite.atelier")}>
                <span className="font-mono text-xs">pods/{dossierPod(pod.slug)}/</span>
                <span className="text-muted-foreground"> · {t("pods.identite.atelierAide")}</span>
              </LigneFiche>
              {!video && (
                <LigneFiche libelle={t("pods.identite.validation")}>
                  <InterrupteurAuto pod={pod} />
                </LigneFiche>
              )}
            </dl>
          </CardContent>
        </Card>

        {!video && (
          <Card>
            <CardHeader>
              <CardTitle>{t("pods.fiche.rythmeTitre")}</CardTitle>
              <CardDescription>{t("pods.fiche.rythmeDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {fiche ? <RythmePodz fiche={fiche} /> : <p className="text-sm text-muted-foreground">{t("pods.fiche.enPause")}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* La boîte BLEO : seulement pour un podz en texte + banque, qui décline ses familles gagnantes. */}
      {fiche?.boite && labelId && (
        <section id="boite" className="scroll-mt-20">
          <BoiteDuLabel labelId={labelId} nom={ligne.titre} />
        </section>
      )}

      {!video && (
        <Card id="langues" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("pods.langues.titre")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BlocLangues format={format} langues={langues} langueSource={langueSource} pod={pod.slug} />
          </CardContent>
        </Card>
      )}

      {format === "images_finies" && <CarteRattrapage pod={pod.slug} />}

      {!video && <CarteSeriesPods pods={[{ slug: pod.slug, nom: pod.nom }]} fixe={pod.slug} />}

      {/* Au-delà d'une douzaine de comptes, la table est repliée : la fiche reste lisible. */}
      {!video && (fiche?.comptes ?? 0) > 12 && (
        <Replie titre={`${t("pods.page.comptes")} (${fiche!.comptes})`} aide={t("pods.page.comptesDescription")} paresseux>
          <ComptesDuPod pod={pod.slug} label={pod.label} deplacer={labelId ? { labelId, apps: pod.apps } : undefined} />
        </Replie>
      )}
      {!video && (fiche?.comptes ?? 0) <= 12 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pods.page.comptes")}</CardTitle>
            <CardDescription>{t("pods.page.comptesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ComptesDuPod pod={pod.slug} label={pod.label} deplacer={labelId ? { labelId, apps: pod.apps } : undefined} />
          </CardContent>
        </Card>
      )}

      {video && (
        <div className="space-y-2">
          <PanneauPersonas pod={pod.slug} />
          <PanneauDemos />
        </div>
      )}

      <Card id="livraisons" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>{t("pods.page.livraisons")}</CardTitle>
          <CardDescription>{t("pods.enAttente", { count: aValider.length })}</CardDescription>
          {!video && aValider.length > 0 && (
            <div className="pt-1">
              <ToutValiderEnB livraisons={aValider} />
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {livraisons.error && <p className="text-sm text-destructive">{(livraisons.error as Error).message}</p>}
          {aValider.length > 0 && (
            <div className="divide-y divide-border/60">
              {aValider.map((l) => (
                <LigneLivraison key={l.id} livraison={l} pod={pod} />
              ))}
            </div>
          )}
          {decidees.length > 0 && (
            <Replie titre={`${t("pods.historique")} (${decidees.length})`} paresseux>
              <div className="divide-y divide-border/60">
                {decidees.map((l) => (
                  <LigneLivraison key={l.id} livraison={l} />
                ))}
              </div>
            </Replie>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
