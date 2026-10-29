import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, GitBranch, Layers, Lock, Send } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { lireFamille, listerContenusFamille, listerPassagesFamille } from "@/features/bleo/api";
import { CarteValeursParLangue } from "@/features/bleo/CarteValeursParLangue";
import { formaterJour, formaterNombre, formaterQuand, formaterVues } from "@/features/bleo/format";
import {
  BadgeEtat,
  BadgeVerdict,
  EnteteTableau,
  EtatRequete,
  Generation,
  Ligne,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
  Tableau,
  TitreCarte,
} from "@/features/bleo/ui";
import { nomLangue } from "@/features/moteur/langues";

/**
 * BLEO, une famille d'accroche : son verdict, ses contenus génération par
 * génération (G0 la racine, G1 même accroche, G2 accroche reformulée) et ses
 * 100 derniers passages.
 */
export function AdminBleoFamillePage() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const famille = useQuery({ queryKey: ["bleo", "famille", id], queryFn: () => lireFamille(id), enabled: Boolean(id) });
  const contenus = useQuery({
    queryKey: ["bleo", "famille", id, "contenus"],
    queryFn: () => listerContenusFamille(id),
    enabled: Boolean(id),
  });
  const ids = (contenus.data ?? []).map((c) => c.id);
  const passages = useQuery({
    queryKey: ["bleo", "famille", id, "passages", ids.join(",")],
    queryFn: () => listerPassagesFamille(ids),
    enabled: ids.length > 0,
  });
  const generationDe = new Map((contenus.data ?? []).map((c) => [c.id, c.generation]));
  const f = famille.data;

  return (
    <div className="space-y-6" data-testid="page-bleo-famille">
      <Link to="/admin/bleo/familles" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden />
        {t("bleo.familles.titre")}
      </Link>

      <EtatRequete erreur={famille.error ?? contenus.error ?? passages.error} chargement={famille.isLoading} />
      {famille.data === null && <p className="text-sm text-muted-foreground">{t("bleo.familles.introuvable")}</p>}

      {f && (
        <>
          <PageHeader
            title={
              <span className="flex items-start gap-2">
                <GitBranch className="mt-1 size-6 shrink-0 text-muted-foreground" aria-hidden />
                <span>{f.accroche ?? f.racine_titre ?? "—"}</span>
              </span>
            }
            description={t("bleo.famille.description", {
              label: f.label_nom ?? "—",
              cree: formaterJour(f.created_at.slice(0, 10), i18n.language),
            })}
            actions={
              <span className="flex flex-wrap items-center gap-1.5">
                <BadgeVerdict verdict={f.verdict} />
                {f.close && (
                  <Badge variant="outline" title={formaterQuand(f.close_le, i18n.language)}>
                    <Lock aria-hidden />
                    {t("bleo.close")}
                  </Badge>
                )}
                {f.voie === 2 && <Badge variant="secondary">{t("bleo.voie2")}</Badge>}
              </span>
            }
          />

          <StatGroup>
            <StatTile
              label={t("bleo.colonnes.contenus")}
              value={f.n_contenus}
              detail={t("bleo.famille.generations", { g: f.gen_max })}
            />
            <StatTile label={t("bleo.colonnes.passages")} value={f.n_passages} detail={t("bleo.famille.horsRappels")} />
            <StatTile
              label={t("bleo.colonnes.vuesMax")}
              value={formaterVues(f.vues_max, i18n.language)}
              detail={t("bleo.famille.vuesTotal", { n: formaterVues(f.vues_total, i18n.language) })}
            />
            <StatTile
              label={t("bleo.colonnes.rMoyen")}
              value={formaterNombre(f.r_moyen, 2)}
              detail={
                f.verdict_le ? t("bleo.famille.verdictLe", { quand: formaterQuand(f.verdict_le, i18n.language) }) : undefined
              }
            />
          </StatGroup>

          <Card>
            <CardHeader>
              <TitreCarte icone={Layers}>{t("bleo.famille.contenus")}</TitreCarte>
              <CardDescription>{t("bleo.famille.contenusDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tableau minWidth="58rem">
                <EnteteTableau>
                  <th className={TH}>{t("bleo.colonnes.generation")}</th>
                  <th className={TH}>{t("bleo.colonnes.titre")}</th>
                  <th className={TH}>{t("bleo.colonnes.type")}</th>
                  <th className={TH}>{t("bleo.colonnes.etat")}</th>
                  <th className={TH}>{t("bleo.colonnes.verdict")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.passages")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.vuesMax")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.vuesMoyenne")}</th>
                  <th className={`${TH_NUM} cursor-help`} title={t("bleo.colonnes.rMoyenAide")}>
                    {t("bleo.colonnes.rMoyen")}
                  </th>
                  <th className={`${TH_NUM} cursor-help`} title={t("bleo.colonnes.valeurAide")}>
                  {t("bleo.colonnes.valeur")}
                </th>
                </EnteteTableau>
                <tbody>
                  {(contenus.data ?? []).map((c) => (
                    <Ligne key={c.id} className={c.statut === "rejete" ? "text-muted-foreground line-through" : undefined}>
                      <td className={TD}>
                        <Generation g={c.generation} />
                      </td>
                      <td className={`${TD} max-w-[22rem]`}>
                        <span className="line-clamp-2" title={c.titre ?? undefined}>
                          {c.titre ?? "—"}
                        </span>
                        {c.source_url && (
                          <a
                            href={c.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3" aria-hidden />
                            {t("bleo.famille.source")}
                          </a>
                        )}
                      </td>
                      <td className={TD}>
                        {t(`bleo.types.${c.type_bleo ?? "inconnu"}`, { defaultValue: c.type_bleo ?? "—" })}
                        {c.pod && <span className="block text-[11px] text-muted-foreground">{c.pod}</span>}
                      </td>
                      <td className={TD}>
                        <BadgeEtat etat={c.etat_bleo} />
                      </td>
                      <td className={TD}>
                        <BadgeVerdict verdict={c.verdict} />
                      </td>
                      <td className={TD_NUM}>{c.n_passages}</td>
                      <td className={TD_NUM}>{formaterVues(c.vues_max, i18n.language)}</td>
                      <td className={TD_NUM}>{formaterVues(c.vues_moyenne, i18n.language)}</td>
                      <td className={TD_NUM}>{formaterNombre(c.r_moyen, 2)}</td>
                      <td className={TD_NUM}>{formaterNombre(c.valeur_max, 2)}</td>
                    </Ligne>
                  ))}
                </tbody>
              </Tableau>
            </CardContent>
          </Card>

          <CarteValeursParLangue contenus={contenus.data ?? []} />

          <Card>
            <CardHeader>
              <TitreCarte icone={Send}>{t("bleo.famille.passages")}</TitreCarte>
              <CardDescription>{t("bleo.famille.passagesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tableau minWidth="44rem">
                <EnteteTableau>
                  <th className={TH}>{t("bleo.colonnes.jour")}</th>
                  <th className={TH}>{t("bleo.colonnes.compte")}</th>
                  <th className={TH}>{t("bleo.colonnes.generation")}</th>
                  <th className={TH}>{t("bleo.colonnes.langue")}</th>
                  <th className={TH}>{t("bleo.colonnes.statut")}</th>
                  <th className={TH_NUM}>{t("bleo.colonnes.vues")}</th>
                  <th className={TH_NUM}>r</th>
                  <th className={TH}>{t("bleo.colonnes.lien")}</th>
                </EnteteTableau>
                <tbody>
                  {(passages.data ?? []).map((p) => (
                    <Ligne key={p.id} className={p.est_rappel ? "text-muted-foreground" : undefined}>
                      <td className={TD}>{formaterJour(p.date_publication_prevue, i18n.language)}</td>
                      <td className={TD}>
                        <Link to={`/admin/createurs/${p.compte_id}`} className="underline-offset-2 hover:underline">
                          @{p.comptes?.handle_tiktok ?? "?"}
                        </Link>
                        {p.est_rappel && <span className="ml-1 text-[10px]">{t("bleo.categories.rappel")}</span>}
                      </td>
                      <td className={TD}>
                        <Generation g={generationDe.get(p.contenu_id) ?? null} />
                      </td>
                      <td className={TD}>{nomLangue(p.langue)}</td>
                      <td className={TD}>{t(`bleo.statutsPassage.${p.statut}`, { defaultValue: p.statut })}</td>
                      <td className={TD_NUM}>{formaterVues(p.vues, i18n.language)}</td>
                      <td className={TD_NUM}>{formaterNombre(p.r, 2)}</td>
                      <td className={TD}>
                        {p.publie_url ? (
                          <a href={p.publie_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                            <ExternalLink className="size-3" aria-hidden />
                            TikTok
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </Ligne>
                  ))}
                </tbody>
              </Tableau>
              {passages.data && passages.data.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("bleo.famille.aucunPassage")}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
