import * as React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  chargerPilotageDashboard,
  creerLabel,
  ecrireReglage,
  lireReglages,
  listerLabels,
  supprimerLabel,
} from "@/features/moteur/api";
import { cn } from "@/lib/utils";

function abrege(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function LabelsPilotageCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const labels = useQuery({ queryKey: ["labels"], queryFn: listerLabels });
  const [nom, setNom] = React.useState("");
  const [couleur, setCouleur] = React.useState("#2f6f4e");

  const creer = useMutation({
    mutationFn: () => creerLabel(nom.trim(), couleur),
    onSuccess: () => {
      setNom("");
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
  });
  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerLabel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("labels.gestion")}</CardTitle>
        <CardDescription>{t("labels.gestionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nom.trim()) creer.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="labNom">{t("labels.nom")}</Label>
            <Input id="labNom" value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="labCoul">{t("labels.couleur")}</Label>
            <Input
              id="labCoul"
              type="color"
              className="h-9 w-14 p-1"
              value={couleur}
              onChange={(e) => setCouleur(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={creer.isPending || !nom.trim()}>
            {creer.isPending ? t("common.saving") : t("labels.creer")}
          </Button>
        </form>
        <div className="list-enter flex flex-wrap gap-2">
          {(labels.data ?? []).map((lab) => (
            <div
              key={lab.id}
              className="flex items-center gap-1 border border-border/80 px-2 py-1 text-xs"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: lab.couleur ?? "#888" }}
              />
              <span className="font-medium">{lab.nom}</span>
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(t("labels.confirmDelete"))) supprimer.mutate(lab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PaiementPilotageCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const reglages = useQuery({ queryKey: ["reglages"], queryFn: lireReglages });
  const [base, setBase] = React.useState<number | null>(null);
  const [unitaire, setUnitaire] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (reglages.data) {
      setBase(reglages.data.paiement.tarif_base_mensuel);
      setUnitaire(reglages.data.paiement.tarif_par_post_jour);
    }
  }, [reglages.data]);

  const save = useMutation({
    mutationFn: async () => {
      await ecrireReglage("paiement", {
        tarif_base_mensuel: base ?? 0,
        tarif_par_post_jour: unitaire ?? 0,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reglages"] }),
  });

  if (base === null || unitaire === null) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
      </Card>
    );
  }

  const exemple = (base ?? 0) + 2 * (unitaire ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paiement.title")}</CardTitle>
        <CardDescription>{t("paiement.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tarifBase">{t("paiement.base")}</Label>
            <Input
              id="tarifBase"
              type="number"
              min={0}
              value={base}
              onChange={(e) => setBase(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tarifUnit">{t("paiement.unitaire")}</Label>
            <Input
              id="tarifUnit"
              type="number"
              min={0}
              value={unitaire}
              onChange={(e) => setUnitaire(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("paiement.formule", { exemple })}
        </p>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t("common.saving") : t("common.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Courbe des Δ vues journaliers (j0 − j1), figés à l’update ELO. */
function GraphVuesDelta({
  serie,
}: {
  serie: Array<{ jour: string; vues_delta: number | null; vues_totales: number }>;
}) {
  const { t, i18n } = useTranslation();
  const points = serie.filter((s) => s.vues_delta != null);
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("pilotage.vuesVide")}</p>
    );
  }
  const max = Math.max(...points.map((p) => Math.abs(p.vues_delta!)), 1);

  return (
    <div className="space-y-3">
      <div className="flex h-40 items-end gap-1">
        {points.map((p) => {
          const d = p.vues_delta!;
          const h = Math.max(4, (Math.abs(d) / max) * 100);
          return (
            <div
              key={p.jour}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${p.jour}: ${d >= 0 ? "+" : ""}${abrege(d)}`}
            >
              <div
                className={cn(
                  "w-full max-w-[28px] rounded-t-sm transition-colors",
                  d >= 0 ? "bg-emerald-600/80 group-hover:bg-emerald-600" : "bg-amber-600/80",
                )}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>
          {new Date(`${points[0]!.jour}T12:00:00`).toLocaleDateString(i18n.language, {
            day: "numeric",
            month: "short",
          })}
        </span>
        <span>
          {new Date(`${points[points.length - 1]!.jour}T12:00:00`).toLocaleDateString(
            i18n.language,
            { day: "numeric", month: "short" },
          )}
        </span>
      </div>
      {(() => {
        const last = points[points.length - 1]!;
        return (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("pilotage.dernierDelta")} </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                (last.vues_delta ?? 0) >= 0 ? "text-success" : "text-warning",
              )}
            >
              {(last.vues_delta ?? 0) >= 0 ? "+" : ""}
              {abrege(last.vues_delta ?? 0)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {t("pilotage.totalVues", { n: abrege(last.vues_totales) })}
            </span>
          </p>
        );
      })()}
    </div>
  );
}

function RangList({
  title,
  desc,
  empty,
  children,
}: {
  title: string;
  desc: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {empty ? <EmptyState title={t("pilotage.vide")} /> : children}
      </CardContent>
    </Card>
  );
}

export function AdminPilotagePage() {
  const { t } = useTranslation();
  const dash = useQuery({
    queryKey: ["pilotage-dashboard"],
    queryFn: chargerPilotageDashboard,
  });

  const d = dash.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t("pilotage.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pilotage.subtitleNew")}</p>
      </div>

      {dash.isPending && (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}

      {d && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("pilotage.vuesTitre")}</CardTitle>
              <CardDescription>{t("pilotage.vuesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <GraphVuesDelta serie={d.vuesSerie} />
            </CardContent>
          </Card>

          {(d.alertes.niveau2.length > 0 || d.alertes.niveau1.length > 0) && (
            <div className="grid gap-3 lg:grid-cols-2">
              {d.alertes.niveau2.length > 0 && (
                <Card className="border-destructive/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-4" />
                      {t("pilotage.alerte2Titre")}
                    </CardTitle>
                    <CardDescription>{t("pilotage.alerte2Desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {d.alertes.niveau2.map((a) => (
                      <Link
                        key={a.compte_id}
                        to={`/admin/createurs/${a.compte_id}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-2 text-sm hover:bg-destructive/10"
                      >
                        <span className="truncate font-medium">
                          {a.nom}
                          {a.handle ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              @{a.handle}
                            </span>
                          ) : null}
                        </span>
                        <Badge variant="destructive">
                          {t("pilotage.joursSans", { n: a.joursSansPost })}
                        </Badge>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
              {d.alertes.niveau1.length > 0 && (
                <Card className="border-warning/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-warning">
                      <AlertTriangle className="size-4" />
                      {t("pilotage.alerte1Titre")}
                    </CardTitle>
                    <CardDescription>{t("pilotage.alerte1Desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {d.alertes.niveau1.map((a) => (
                      <Link
                        key={a.compte_id}
                        to={`/admin/createurs/${a.compte_id}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-warning/20 bg-warning/5 px-2.5 py-2 text-sm hover:bg-warning/10"
                      >
                        <span className="truncate font-medium">
                          {a.nom}
                          {a.handle ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              @{a.handle}
                            </span>
                          ) : null}
                        </span>
                        <Badge variant="warning">{t("pilotage.pasVeille")}</Badge>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <RangList
              title={t("pilotage.eloBasTitre")}
              desc={t("pilotage.eloBasDesc")}
              empty={d.eloBas.length === 0}
            >
              {d.eloBas.map((c, i) => (
                <Link
                  key={c.compte_id}
                  to={`/admin/createurs/${c.compte_id}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {c.nom}
                    {c.handle ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">@{c.handle}</span>
                    ) : null}
                  </span>
                  <Badge variant="secondary">ELO {c.score.toFixed(1)}</Badge>
                </Link>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.eloTopTitre")}
              desc={t("pilotage.eloTopDesc")}
              empty={d.eloTop.length === 0}
            >
              {d.eloTop.map((c, i) => (
                <Link
                  key={c.compte_id}
                  to={`/admin/createurs/${c.compte_id}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm hover:bg-muted/40"
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {c.nom}
                    {c.handle ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">@{c.handle}</span>
                    ) : null}
                  </span>
                  <Badge variant="secondary">ELO {c.score.toFixed(1)}</Badge>
                </Link>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.recruteursTitre")}
              desc={t("pilotage.recruteursDesc")}
              empty={d.recruteurs.length === 0}
            >
              {d.recruteurs.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                >
                  <span className="truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {r.nom}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {t("pilotage.nbCreateurs", { n: r.nbCreateurs })}
                    </span>
                  </span>
                  <Badge variant="secondary">ELO {r.eloMoyen.toFixed(1)}</Badge>
                </div>
              ))}
            </RangList>

            <RangList
              title={t("pilotage.postsVeilleTitre")}
              desc={t("pilotage.postsVeilleDesc")}
              empty={d.postsVeille.length === 0}
            >
              {d.postsVeille.map((p, i) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {p.titre?.trim() || t("posts.title")}
                    {p.handle ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">@{p.handle}</span>
                    ) : null}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">{abrege(p.vues)}</span>
                    {p.publie_url && (
                      <a
                        href={p.publie_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </RangList>
          </div>
        </>
      )}

      <LabelsPilotageCard />
      <PaiementPilotageCard />
    </div>
  );
}
