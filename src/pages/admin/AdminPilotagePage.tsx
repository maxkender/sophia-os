import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, ExternalLink, Flag, PackageOpen, Tags } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { BarChart, type PointBarre } from "@/components/charts/BarChart";
import { InlineBar } from "@/components/charts/InlineBar";
import { abrege, exact, moyenneGlissante } from "@/components/charts/echelle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { BadgeClassement } from "@/features/moteur/BadgeClassement";
import {
  chargerPilotageDashboard,
  compterContestationsAVerifier,
  listerLabels,
  type PilotageDashboard,
} from "@/features/moteur/api";
import { useApplication } from "@/features/moteur/ApplicationContext";
import { nomApplication } from "@/features/moteur/applications";
import { useLabelsApplications } from "@/features/moteur/multiapp/useLabelsApplications";
import {
  lignesStock,
  resumeVues,
  SEUIL_STOCK_JOURS,
  tauxPublication,
  type LigneStock,
} from "@/features/moteur/pilotage";
// Le tableau de la page Allocation : même gabarit ici, titres en petites
// capitales, chiffres alignés à droite, ligne dépliable.
import { Tableau } from "@/features/moteur/repartition/Tableau";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

const PERIODES = [7, 30, 90] as const;
type Periode = (typeof PERIODES)[number];

/** Format d'un nombre à virgule, dans la langue de l'interface. */
function decimal(n: number, langue: string, chiffres = 1): string {
  return n.toLocaleString(localeDate(langue), {
    minimumFractionDigits: chiffres,
    maximumFractionDigits: chiffres,
  });
}

function pourcent(part: number, langue: string): string {
  return new Intl.NumberFormat(localeDate(langue), { style: "percent", maximumFractionDigits: 0 }).format(part);
}

function jourCourt(jour: string, langue: string): string {
  return new Date(`${jour}T12:00:00`).toLocaleDateString(localeDate(langue), { day: "numeric", month: "short" });
}

function jourLong(jour: string, langue: string): string {
  return new Date(`${jour}T12:00:00`).toLocaleDateString(localeDate(langue), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Un tableau qui défile tout seul sur un écran étroit, sans pousser la page. */
function Defilant({ children }: { children: React.ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

/** Un compte, cliquable vers sa fiche, avec son @ en petit. */
function LienCompte({ compte, suffixe }: {
  compte: { compte_id: string; nom: string; handle: string | null };
  suffixe?: React.ReactNode;
}) {
  return (
    <Link
      to={`/admin/createurs/${compte.compte_id}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-baseline gap-1.5 hover:underline"
    >
      <span>{compte.nom}</span>
      {compte.handle ? <span className="font-mono text-xs text-muted-foreground">@{compte.handle}</span> : null}
      {suffixe}
    </Link>
  );
}

function ListeComptes({ comptes, vide, suffixe }: {
  comptes: Array<{ compte_id: string; nom: string; handle: string | null; joursSansPost?: number }>;
  vide: string;
  suffixe?: (c: { joursSansPost?: number }) => React.ReactNode;
}) {
  if (comptes.length === 0) return <p className="text-xs text-muted-foreground">{vide}</p>;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-md bg-muted/40 px-3 py-2 text-sm">
      {comptes.map((c) => (
        <LienCompte key={c.compte_id} compte={c} suffixe={suffixe?.(c)} />
      ))}
    </div>
  );
}

function CarteVues({ serie }: { serie: PilotageDashboard["vuesSerie"] }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const [periode, setPeriode] = React.useState<Periode>(30);

  // Moyenne calculée sur toute la série puis coupée : le premier jour affiché
  // a lui aussi sa fenêtre complète.
  const moyenne = React.useMemo(() => moyenneGlissante(serie.map((s) => s.vues_delta), 7), [serie]);
  const debut = Math.max(0, serie.length - periode);
  const points: PointBarre[] = serie.slice(debut).map((s) => ({
    key: s.jour,
    axisLabel: jourCourt(s.jour, langue),
    tooltipTitle: jourLong(s.jour, langue),
    value: s.vues_delta,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pilotage.vuesTitre")}</CardTitle>
        <CardDescription>{t("pilotage.vuesDesc")}</CardDescription>
        <CardAction>
          <div className="inline-flex gap-1" role="group" aria-label={t("pilotage.periodeAria")}>
            {PERIODES.map((p) => (
              <Button
                key={p}
                size="xs"
                variant={p === periode ? "secondary" : "ghost"}
                aria-pressed={p === periode}
                onClick={() => setPeriode(p)}
              >
                {t("pilotage.periode", { n: p })}
              </Button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pilotage.vuesVide")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-muted-foreground/30" aria-hidden />
                {t("pilotage.vuesSerie")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3.5 rounded-full bg-foreground" aria-hidden />
                {t("pilotage.vuesMoyenne")}
              </span>
            </div>
            <BarChart
              points={points}
              average={moyenne.slice(debut)}
              averageLabel={t("pilotage.vuesMoyenne")}
              valueLabel={t("pilotage.vuesSerie")}
              formatTick={(n) => abrege(n, langue)}
              formatValue={(n) => exact(n, langue)}
              ariaLabel={t("pilotage.vuesTitre")}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

type CleAFaire = "retard" | "stock" | "aujourdhui" | "contestations";

interface LigneAFaire {
  cle: CleAFaire;
  icone: React.ComponentType<{ className?: string }>;
  titre: string;
  aide?: string;
  nombre: number;
  urgent: boolean;
  lien: string;
}

function CarteAFaire({
  dash,
  stock,
  contestations,
}: {
  dash: PilotageDashboard;
  stock: LigneStock[];
  contestations: number;
}) {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = React.useState<CleAFaire | null>(null);
  const sousSeuil = stock.filter((l) => l.jours < SEUIL_STOCK_JOURS);

  const lignes: LigneAFaire[] = (
    [
      {
        cle: "retard",
        icone: AlertTriangle,
        titre: t("pilotage.aFaireRetard"),
        nombre: dash.alertes.niveau2.length,
        urgent: true,
        lien: "/admin/surveillance",
      },
      {
        cle: "stock",
        icone: PackageOpen,
        titre: t("pilotage.aFaireStock"),
        nombre: sousSeuil.length,
        urgent: true,
        lien: "/admin/sources",
      },
      {
        cle: "contestations",
        icone: Flag,
        titre: t("pilotage.aFaireContestations"),
        nombre: contestations,
        urgent: false,
        lien: "/admin/retours-contestes",
      },
      {
        cle: "aujourdhui",
        icone: Clock,
        titre: t("pilotage.aFaireAujourdhui"),
        aide: t("pilotage.aFaireAujourdhuiAide"),
        nombre: dash.alertes.niveau1.length,
        urgent: false,
        lien: "/admin/surveillance",
      },
    ] satisfies LigneAFaire[]
  ).filter((l) => l.nombre > 0);

  const detail = (l: LigneAFaire): React.ReactNode => {
    if (l.cle === "retard") {
      return (
        <ListeComptes
          comptes={dash.alertes.niveau2}
          vide={t("pilotage.vide")}
          suffixe={(c) => (
            <span className="text-xs font-semibold text-destructive">
              {t("pilotage.jours", { n: c.joursSansPost })}
            </span>
          )}
        />
      );
    }
    if (l.cle === "aujourdhui") return <ListeComptes comptes={dash.alertes.niveau1} vide={t("pilotage.vide")} />;
    if (l.cle === "stock") {
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-md bg-muted/40 px-3 py-2 text-sm">
          {sousSeuil.map((s) => (
            <span key={s.label_id} className="inline-flex items-baseline gap-1.5">
              <span className="font-mono text-xs">{s.nom}</span>
              <span className="text-xs font-semibold text-destructive">
                {t("pilotage.jours", { n: decimal(s.jours, i18n.language) })}
              </span>
            </span>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pilotage.aFaireTitre")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Defilant>
          <Tableau
            lignes={lignes}
            cleLigne={(l) => l.cle}
            vide={t("pilotage.aFaireVide")}
            onLigne={(l) => {
              if (l.cle !== "contestations") setOuvert(ouvert === l.cle ? null : l.cle);
            }}
            ligneActive={(l) => ouvert === l.cle}
            detail={detail}
            colonnes={[
              {
                cle: "quoi",
                titre: t("pilotage.colQuoi"),
                rendu: (l) => {
                  const Icone = l.icone;
                  return (
                    <span className="flex items-start gap-2.5">
                      <Icone
                        className={cn("mt-0.5 size-4 shrink-0", l.urgent ? "text-destructive" : "text-muted-foreground")}
                      />
                      <span>
                        <span className="font-medium">{l.titre}</span>
                        {l.aide ? <span className="block text-xs text-muted-foreground">{l.aide}</span> : null}
                      </span>
                    </span>
                  );
                },
              },
              {
                cle: "combien",
                titre: t("pilotage.colCombien"),
                align: "droite",
                rendu: (l) => (
                  <span className={cn("font-semibold", l.urgent && "text-destructive")}>{l.nombre}</span>
                ),
              },
              {
                cle: "lien",
                titre: "",
                align: "droite",
                classe: "w-px whitespace-nowrap",
                rendu: (l) => (
                  <Button
                    size="xs"
                    variant="outline"
                    render={<Link to={l.lien} onClick={(e) => e.stopPropagation()} />}
                  >
                    {t("pilotage.voir")}
                  </Button>
                ),
              },
            ]}
          />
        </Defilant>
      </CardContent>
    </Card>
  );
}

function CarteSante({ parCase }: { parCase: PilotageDashboard["parCase"] }) {
  const { t, i18n } = useTranslation();
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const total = parCase.reduce((n, c) => n + c.comptes.length, 0);
  const plusGrand = Math.max(1, ...parCase.map((c) => c.comptes.length));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pilotage.santeTitre")}</CardTitle>
        <CardDescription>{t("pilotage.santeDesc", { n: total })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Defilant>
          <Tableau
            lignes={parCase}
            cleLigne={(c) => c.classement}
            onLigne={(c) => setOuvert(ouvert === c.classement ? null : c.classement)}
            ligneActive={(c) => ouvert === c.classement}
            detail={(c) => <ListeComptes comptes={c.comptes} vide={t("pilotage.santeVide")} />}
            colonnes={[
              { cle: "case", titre: t("pilotage.colCase"), rendu: (c) => <BadgeClassement classement={c.classement} /> },
              {
                cle: "comptes",
                titre: t("pilotage.colComptes"),
                align: "droite",
                rendu: (c) => <span className={c.comptes.length === 0 ? "text-muted-foreground/60" : ""}>{c.comptes.length}</span>,
              },
              {
                cle: "part",
                titre: t("pilotage.colPart"),
                align: "droite",
                classe: "text-muted-foreground",
                rendu: (c) => (total > 0 ? pourcent(c.comptes.length / total, i18n.language) : "—"),
              },
              {
                cle: "barre",
                titre: "",
                classe: "w-1/3",
                rendu: (c) => <InlineBar value={c.comptes.length} max={plusGrand} />,
              },
            ]}
          />
        </Defilant>
      </CardContent>
    </Card>
  );
}

function CarteStock({
  lignes,
  dormants,
  app,
}: {
  lignes: LigneStock[];
  dormants: string[];
  app: { slug: string; nom: string };
}) {
  const { t, i18n } = useTranslation();
  // Échelle commune : au moins deux fois le seuil, pour que le trait des 7 jours
  // ne colle pas au bord quand tout le stock est court.
  const max = Math.max(SEUIL_STOCK_JOURS * 2, ...lignes.map((l) => l.jours));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("pilotage.stockTitre")}
          <LogoApplication slug={app.slug} nom={app.nom} />
        </CardTitle>
        <CardDescription>{t("pilotage.stockDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Defilant>
          <Tableau
            lignes={lignes}
            cleLigne={(l) => l.label_id}
            vide={t("pilotage.stockVide")}
            colonnes={[
              { cle: "label", titre: t("pilotage.colLabel"), classe: "font-mono text-xs", rendu: (l) => l.nom },
              {
                cle: "jours",
                titre: t("pilotage.colJours"),
                align: "droite",
                rendu: (l) => (
                  <span className={l.jours < SEUIL_STOCK_JOURS ? "font-semibold text-destructive" : ""}>
                    {decimal(l.jours, i18n.language)}
                  </span>
                ),
              },
              {
                cle: "barre",
                titre: "",
                classe: "w-1/3",
                rendu: (l) => (
                  <InlineBar
                    value={l.jours}
                    max={max}
                    threshold={SEUIL_STOCK_JOURS}
                    tone={l.jours < SEUIL_STOCK_JOURS ? "alerte" : "neutre"}
                  />
                ),
              },
              {
                cle: "comptes",
                titre: t("pilotage.colComptes"),
                align: "droite",
                classe: "text-muted-foreground",
                rendu: (l) => l.comptes,
              },
            ]}
          />
        </Defilant>
        {dormants.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("pilotage.stockDormants", { labels: dormants.join(", ") })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CartePostsVeille({ posts }: { posts: PilotageDashboard["postsVeille"] }) {
  const { t, i18n } = useTranslation();
  const { applications } = useApplication();
  const appParId = new Map(applications.map((a) => [a.id, a]));
  const max = Math.max(1, ...posts.map((p) => p.vues));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pilotage.postsVeilleTitre")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Defilant>
          <Tableau
            lignes={posts.slice(0, 8)}
            cleLigne={(p) => p.id}
            vide={t("pilotage.postsVeilleVide")}
            colonnes={[
              {
                cle: "post",
                titre: t("pilotage.colPost"),
                rendu: (p) => {
                  const titre = p.titre?.trim() || t("posts.title");
                  // Le titre mène au TikTok : pas de colonne de lien en plus.
                  return p.publie_url ? (
                    <a
                      href={p.publie_url}
                      target="_blank"
                      rel="noreferrer"
                      title={titre}
                      className="flex max-w-[15rem] items-center gap-1.5 hover:underline"
                    >
                      <span className="truncate">{titre}</span>
                      <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    </a>
                  ) : (
                    <span className="block max-w-[15rem] truncate" title={titre}>
                      {titre}
                    </span>
                  );
                },
              },
              {
                cle: "compte",
                titre: t("pilotage.colCompte"),
                classe: "font-mono text-xs text-muted-foreground",
                rendu: (p) => (p.handle ? `@${p.handle}` : "—"),
              },
              {
                cle: "app",
                titre: t("pilotage.colApp"),
                rendu: (p) => {
                  const app = p.application_id ? appParId.get(p.application_id) : undefined;
                  return app ? <LogoApplication slug={app.slug} nom={nomApplication(app)} size="xs" /> : null;
                },
              },
              {
                cle: "vues",
                titre: t("pilotage.colVues"),
                align: "droite",
                rendu: (p) => <span title={exact(p.vues, i18n.language)}>{abrege(p.vues, i18n.language)}</span>,
              },
              { cle: "barre", titre: "", classe: "w-1/6", rendu: (p) => <InlineBar value={p.vues} max={max} /> },
            ]}
          />
        </Defilant>
      </CardContent>
    </Card>
  );
}

function CarteRecruteurs({ recruteurs }: { recruteurs: PilotageDashboard["recruteurs"] }) {
  const { t, i18n } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("pilotage.recruteursTitre")}</CardTitle>
        <CardDescription>{t("pilotage.recruteursDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Defilant>
          <Tableau
            lignes={recruteurs}
            cleLigne={(r) => r.id}
            vide={t("pilotage.vide")}
            colonnes={[
              { cle: "nom", titre: t("pilotage.colRecruteur"), rendu: (r) => r.nom },
              {
                cle: "createurs",
                titre: t("pilotage.colCreateurs"),
                align: "droite",
                classe: "text-muted-foreground",
                rendu: (r) => r.nbCreateurs,
              },
              {
                cle: "bien",
                titre: t("pilotage.colBien"),
                align: "droite",
                rendu: (r) => pourcent(r.partBien, i18n.language),
              },
              { cle: "barre", titre: "", classe: "w-1/3", rendu: (r) => <InlineBar value={r.partBien} max={1} /> },
            ]}
          />
        </Defilant>
      </CardContent>
    </Card>
  );
}

/**
 * Pilotage — la journée en un coup d'œil, dans le gabarit de la page
 * Allocation. En haut les quatre chiffres, puis les vues, puis ce qui demande
 * une action, puis le détail. La configuration (labels, applications) vit sur
 * sa propre page.
 */
export function AdminPilotagePage() {
  const { t, i18n } = useTranslation();
  const langue = i18n.language;
  const { applicationId, application, slug } = useApplication();
  const nomApp = application ? nomApplication(application) : nomApplication({ slug });

  const dash = useQuery({ queryKey: ["pilotage-dashboard"], queryFn: chargerPilotageDashboard });
  // Même clé que le badge du menu : une seule requête pour les deux.
  const contestations = useQuery({ queryKey: ["contestations-a-verifier"], queryFn: compterContestationsAVerifier });
  // Même clé que la page Labels & applications.
  const labels = useQuery({ queryKey: ["labels", "tous"], queryFn: () => listerLabels() });
  const multi = useLabelsApplications(applicationId);

  const stock = React.useMemo(() => {
    const reserves = multi.reservesParLabel
      ? [...multi.reservesParLabel.values()].flatMap((parApp) => {
          const r = applicationId ? parApp.get(applicationId) : undefined;
          return r ? [r] : [];
        })
      : [...(multi.reservesHistoriques?.values() ?? [])];
    const visibles = labels.data ? new Set(labels.data.map((l) => l.id)) : null;
    return lignesStock(reserves, visibles);
  }, [multi.reservesParLabel, multi.reservesHistoriques, applicationId, labels.data]);

  const d = dash.data;
  const vues = d ? resumeVues(d.vuesSerie) : null;
  const posts = d ? tauxPublication(d.postsJours) : null;
  const parCase = d?.parCase ?? [];
  const totalComptes = parCase.reduce((n, c) => n + c.comptes.length, 0);
  const bienStar = parCase
    .filter((c) => c.classement === "star" || c.classement === "bien")
    .reduce((n, c) => n + c.comptes.length, 0);
  const aujourdhui = new Intl.DateTimeFormat(localeDate(langue), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pilotage.title")}
        description={aujourdhui}
        actions={
          <Button size="sm" variant="outline" render={<Link to="/admin/labels" />}>
            <Tags />
            {t("pilotage.labelsApplications")}
          </Button>
        }
      />

      {dash.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {dash.isError && (
        <p className="text-sm text-destructive">{(dash.error as Error).message || t("common.error")}</p>
      )}

      {d && (
        <>
          <StatGroup>
            <StatTile
              label={t("pilotage.statVues")}
              value={vues ? abrege(vues.delta, langue) : "—"}
              info={t("pilotage.statVuesInfo")}
              detail={
                vues
                  ? [
                      t("pilotage.statVuesReleve", { date: jourCourt(vues.jour, langue) }),
                      vues.ecart !== null
                        ? t("pilotage.statVuesEcart", {
                            ecart: new Intl.NumberFormat(localeDate(langue), {
                              style: "percent",
                              maximumFractionDigits: 0,
                              signDisplay: "exceptZero",
                            }).format(vues.ecart),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t("pilotage.vuesVide")
              }
              trend={d.vuesSerie.slice(-14).map((s) => s.vues_delta)}
            />
            <StatTile
              label={t("pilotage.statPosts")}
              value={posts?.publies ?? 0}
              unit={`/ ${posts?.prevus ?? 0}`}
              info={t("pilotage.statPostsInfo")}
              detail={
                posts?.taux != null
                  ? t("pilotage.statPostsPart", { pct: Math.round(posts.taux * 100) })
                  : t("pilotage.statPostsAucun")
              }
              trend={posts?.tendance}
            />
            <StatTile
              label={t("pilotage.statBien")}
              value={bienStar}
              unit={`/ ${totalComptes}`}
              detail={
                totalComptes > 0
                  ? t("pilotage.statBienPart", { pct: Math.round((bienStar / totalComptes) * 100) })
                  : undefined
              }
            />
            <StatTile
              label={t("pilotage.statRetard")}
              value={d.alertes.niveau2.length}
              tone={d.alertes.niveau2.length > 0 ? "alerte" : "neutre"}
              detail={t("pilotage.statRetardAujourdhui", { n: d.alertes.niveau1.length })}
            />
          </StatGroup>

          <CarteVues serie={d.vuesSerie} />

          <CarteAFaire dash={d} stock={stock.lignes} contestations={contestations.data ?? 0} />

          {/* Rangés par paires de hauteur voisine : les plus longues listes ensemble. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CarteStock lignes={stock.lignes} dormants={stock.dormants} app={{ slug, nom: nomApp }} />
            <CartePostsVeille posts={d.postsVeille} />
            <CarteSante parCase={parCase} />
            <CarteRecruteurs recruteurs={d.recruteurs} />
          </div>
        </>
      )}
    </div>
  );
}
