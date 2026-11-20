// L'allocation des podz : les places libres, les comptes qui pourraient les prendre, et le journal des déplacements.
// L'OS montre, l'admin décide : rien ne bouge sans un clic confirmé, et chaque déplacement s'annule.
import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Undo2 } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { abrege } from "@/components/charts/echelle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { canoniserLangue, drapeauLangue, nomLangue } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import {
  annulerDeplacement,
  deplacerCompte,
  listerCandidats,
  listerDeplacements,
  listerPlaces,
  type CandidatPlace,
  type PlaceLibre,
} from "./api";
import { LienCompte } from "./Etiquettes";
import { candidatsMontres, SEUIL_EMPILEMENT } from "./identite";

const TH = cn(MICRO_LABEL, "px-3 py-2 text-left font-medium whitespace-nowrap");
const TD = "px-3 py-2.5 align-middle";
const NUM = "text-right tabular-nums whitespace-nowrap";

function Candidats({ place }: { place: PlaceLibre }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const langue = i18n.language;
  const { data, error, isLoading } = useQuery({
    queryKey: ["pods", "candidats", place.label_id, place.langue],
    queryFn: () => listerCandidats(place.label_id, place.langue),
  });
  const [tous, setTous] = React.useState(false);
  const deplacer = useMutation({
    mutationFn: (c: CandidatPlace) => deplacerCompte(c.compte_id, c.labels[0]?.id ?? null, place.label_id, `place libre ${place.label} ${place.langue}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const montres = candidatsMontres(data, tous);
  const caches = data.length - montres.length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("pods.places.candidatsAide", { seuil: SEUIL_EMPILEMENT })}</p>
      {montres.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(data.length ? "pods.places.aucunEmpile" : "pods.places.aucunCandidat")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className={TH}>{t("pods.places.colCompte")}</th>
                <th className={TH}>{t("pods.places.colLabel")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.places.colEmpilement")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.places.colPosts")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.tableau.vuesMoyenne")}</th>
                <th className={cn(TH, "text-right")}>{t("pods.places.colCree")}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {montres.map((c) => (
                <tr key={c.compte_id} className="border-b border-border/40 last:border-0">
                  <td className={TD}>
                    <div className="font-medium">{c.handle ? <LienCompte handle={c.handle} /> : "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[`${drapeauLangue(canoniserLangue(c.langue))} ${canoniserLangue(c.langue)}`, c.pays, c.poster].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className={cn(TD, "font-mono text-xs")}>{c.labels.map((l) => l.nom).join(", ") || "—"}</td>
                  <td className={cn(TD, NUM, c.empilement >= SEUIL_EMPILEMENT && "font-semibold")}>{c.empilement}</td>
                  <td className={cn(TD, NUM)}>{c.posts_15j}</td>
                  <td className={cn(TD, NUM)}>{c.vues_moyenne == null ? "—" : abrege(c.vues_moyenne, langue)}</td>
                  <td className={cn(TD, NUM)}>
                    {new Date(c.cree_le).toLocaleDateString(localeDate(langue), { day: "numeric", month: "short" })}
                  </td>
                  <td className={cn(TD, "text-right")}>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={deplacer.isPending || c.labels.length > 1}
                      title={c.labels.length > 1 ? t("pods.places.plusieursLabels") : undefined}
                      onClick={() =>
                        window.confirm(
                          t("pods.places.confirm", {
                            compte: c.handle ? `@${c.handle}` : c.compte_id.slice(0, 8),
                            de: c.labels[0]?.nom ?? "—",
                            vers: place.label,
                          }),
                        ) && deplacer.mutate(c)
                      }
                    >
                      {t("pods.places.deplacer")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(caches > 0 || tous) && (
        <button type="button" onClick={() => setTous(!tous)} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {tous ? t("pods.places.voirEmpiles") : t("pods.places.voirTous", { count: caches })}
        </button>
      )}
      {deplacer.error && (
        <p role="alert" className="text-sm text-destructive">
          {(deplacer.error as Error).message}
        </p>
      )}
    </div>
  );
}

/** Les derniers déplacements, avec leur annulation. */
function JournalDeplacements() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "deplacements"], queryFn: () => listerDeplacements(30) });
  const annuler = useMutation({
    mutationFn: (id: number) => annulerDeplacement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
  if (error || !data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pods.places.journalTitre")}</CardTitle>
        <CardDescription>{t("pods.places.journalDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/50 text-sm">
          {data.map((d) => (
            <li key={d.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2", d.annule_le && "text-muted-foreground line-through")}>
              <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground no-underline">
                {new Date(d.deplace_le).toLocaleString(localeDate(i18n.language), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="font-medium">{d.handle ? `@${d.handle}` : d.compte_id.slice(0, 8)}</span>
              {d.langue && <span>{drapeauLangue(canoniserLangue(d.langue))}</span>}
              <span className="font-mono text-xs">
                {d.label_de ?? "—"} → {d.label_vers ?? "—"}
              </span>
              {!d.annule_le && (
                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  disabled={annuler.isPending}
                  onClick={() => window.confirm(t("pods.places.confirmAnnuler", { compte: d.handle ? `@${d.handle}` : "", de: d.label_de ?? "—" })) && annuler.mutate(d.id)}
                >
                  <Undo2 aria-hidden />
                  {t("pods.places.annuler")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {annuler.error && (
          <p role="alert" className="pt-2 text-sm text-destructive">
            {(annuler.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** La vue « Places libres » de la page Podz. */
export function SectionPlaces() {
  const { t, i18n } = useTranslation();
  const { data, error, isLoading } = useQuery({ queryKey: ["pods", "places"], queryFn: listerPlaces });
  const [ouverte, setOuverte] = React.useState<string | null>(null);
  const cle = (p: PlaceLibre) => `${p.pod}:${p.langue}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("pods.places.titre")}</CardTitle>
          <CardDescription>{t("pods.places.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{t("pods.places.erreur", { message: (error as Error).message })}</p>}
          {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {data && data.length === 0 && <p className="text-sm text-muted-foreground">{t("pods.places.vide")}</p>}
          {data && data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={TH}>{t("pods.liste.colPodz")}</th>
                    <th className={TH}>{t("pods.places.colLangue")}</th>
                    <th className={TH}>{t("pods.places.colEtat")}</th>
                    <th className={cn(TH, "text-right")}>{t("pods.places.colComptesLabel")}</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => {
                    const k = cle(p);
                    const deplie = ouverte === k;
                    const code = canoniserLangue(p.langue);
                    return (
                      <React.Fragment key={k}>
                        <tr className={cn("border-b border-border/50", deplie && "border-b-0 bg-muted/30")}>
                          <td className={TD}>
                            <span className="flex items-center gap-2">
                              {p.applications?.[0] && <LogoApplication slug={p.applications[0]} taille="xs" decoratif />}
                              <Link to={`/admin/pods/${p.pod}`} className="font-semibold underline-offset-2 hover:underline">
                                {p.label}
                              </Link>
                            </span>
                          </td>
                          <td className={cn(TD, "whitespace-nowrap")}>
                            <span className="mr-1.5 text-base leading-none">{drapeauLangue(code)}</span>
                            {nomLangue(code)} <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
                          </td>
                          <td className={TD}>
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className={cn("size-1.5 rounded-full", p.prete ? "bg-warning" : "bg-info")} aria-hidden />
                              {t(p.prete ? "pods.places.prete" : "pods.places.aPreparer")}
                              {p.ouverte_le &&
                                ` · ${t("pods.langues.geste.ouverte", {
                                  par: t(`pods.langues.par.${p.ouverte_par ?? "soupape"}`),
                                  jour: new Date(p.ouverte_le).toLocaleDateString(localeDate(i18n.language), { day: "numeric", month: "numeric" }),
                                }).toLowerCase()}`}
                            </span>
                          </td>
                          <td className={cn(TD, NUM)}>{p.comptes_label}</td>
                          <td className={cn(TD, "text-right")}>
                            <Button size="xs" variant="outline" aria-expanded={deplie} onClick={() => setOuverte(deplie ? null : k)}>
                              {deplie ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                              {t("pods.places.choisir")}
                            </Button>
                          </td>
                        </tr>
                        {deplie && (
                          <tr className="border-b border-border/50 bg-muted/30">
                            <td colSpan={5} className="px-3 pb-4 pt-1">
                              <Candidats place={p} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="pt-4 text-xs text-muted-foreground">
            {t("pods.places.recrues")}{" "}
            <Link to="/admin/repartition" className="underline underline-offset-2">
              {t("pods.places.recruesLien")}
            </Link>
          </p>
        </CardContent>
      </Card>

      <JournalDeplacements />
    </div>
  );
}
