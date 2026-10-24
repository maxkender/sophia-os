import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowRight, Check, Clock, MessageCircle, Moon, Scale, TrendingDown, TrendingUp, X } from "lucide-react";

import { LogoApplication } from "@/components/brand/LogoApplication";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import type { ActionCkd, ControleCkd, PersonneCkd, PropositionCkd, TypeControle } from "@/features/ckd/api";
import { boutonDeLaDecision } from "@/features/ckd/logique";
import { drapeauPays } from "@/features/moteur/pays";
import { BarreRepartition } from "@/features/moteur/repartition/graphes";
import { cn } from "@/lib/utils";

import type { CompteCohorte } from "./api";
import { useFormats, vuesCourtes } from "./formats";
import { BarresPubliees } from "./graphes";
import {
  bilanCompte,
  bilanSemaine,
  type EtatPost,
  ETATS_POST,
  etatPost,
  FILTRES_POSTE,
  type FiltrePoste,
  jourParDefaut,
  joursDePosts,
  libelleCohorte,
  retardsDuJour,
} from "./logique";

const TH = "pb-2 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:pr-0";
const TD = "py-2 pr-3 align-middle last:pr-0";

/** La pastille de chaque action, comme dans le suivi global. */
const POINT_ACTION: Record<ActionCkd, string> = {
  ne_pas_renouveler: "bg-destructive",
  recreer: "bg-warning",
  doubler: "bg-success",
  nudge: "bg-info",
};

/** Les cases des posts : la couleur dit l'état, le chiffre ou l'icône le redit. */
const CASE: Record<EtatPost, string> = {
  bon: "border-success/35 bg-success/12 text-success-foreground",
  normal: "border-border bg-muted text-foreground/80",
  mort: "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-200",
  attente: "border-dashed border-foreground/30 text-muted-foreground",
  manque: "border-destructive/35 bg-destructive/10 text-destructive-foreground",
  pas_encore: "border-dashed border-warning bg-warning/8 text-warning-foreground",
  a_venir: "border-dotted border-border text-muted-foreground/60",
};

const COULEUR_ETAT: Record<EtatPost, string> = {
  bon: "var(--success)",
  normal: "color-mix(in srgb, var(--muted-foreground) 45%, transparent)",
  mort: "var(--color-orange-500)",
  attente: "color-mix(in srgb, var(--muted-foreground) 20%, transparent)",
  manque: "var(--destructive)",
  pas_encore: "var(--warning)",
  a_venir: "transparent",
};

function nomPersonne(p: PersonneCkd | undefined): string {
  return p ? [p.prenom, p.nom].filter(Boolean).join(" ").trim() : "";
}

export interface PropositionsDuCompte {
  jeudi?: PropositionCkd;
  samedi?: PropositionCkd[];
}

/**
 * L'onglet de la cohorte qui fait sa première semaine de posts. Un jour à la
 * fois est mis en avant : le suivi du soir (qui n'a pas tout posté), le check du
 * jeudi, le kill / keep du samedi — avec les mêmes boutons que le suivi global.
 */
export function OngletPoste({
  lundi,
  aujourdhui,
  comptes,
  chargement,
  personnes,
  propositions,
  controleJeudi,
  controleSamedi,
  rendreControle,
  ouvrirGlobal,
}: {
  lundi: string;
  aujourdhui: string;
  comptes: CompteCohorte[];
  chargement: boolean;
  personnes: Map<string, PersonneCkd>;
  propositions: Map<string, PropositionsDuCompte>;
  controleJeudi?: ControleCkd;
  controleSamedi?: ControleCkd;
  rendreControle: (type: TypeControle, jour: string, comptes: ReadonlySet<string>) => React.ReactNode;
  ouvrirGlobal: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { date, nombre } = useFormats();
  const jours = joursDePosts(lundi);
  const [jour, setJour] = React.useState(() => jourParDefaut(lundi, aujourdhui));
  const [filtre, setFiltre] = React.useState<FiltrePoste>("tous");
  const ids = React.useMemo(() => new Set(comptes.map((c) => c.compte_id)), [comptes]);
  const s = libelleCohorte(lundi);

  if (chargement) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (comptes.length === 0) return <EmptyState title={t("ckd.cohorte.poste.aucun", { s })} />;

  const bilan = bilanSemaine(comptes, lundi, aujourdhui);
  const jourSel = jours[jour]!;
  const seuilBon = Math.min(...comptes.map((c) => c.seuil_bon));
  const seuilMort = Math.max(...comptes.map((c) => c.seuil_mort));
  const totalSemaine = comptes.reduce((a, c) => a + c.posts.length, 0);

  const lignes = comptes
    .map((compte) => ({ compte, bilan: bilanCompte(compte, aujourdhui), props: propositions.get(compte.compte_id) }))
    .sort((a, b) => b.bilan.manques - a.bilan.manques || (a.compte.handle ?? "").localeCompare(b.compte.handle ?? ""));
  const garder = (f: FiltrePoste, l: (typeof lignes)[number]) =>
    f === "manques"
      ? l.bilan.manques > 0
      : f === "morts"
        ? l.bilan.morts > 0
        : f === "propositions"
          ? Boolean(l.props?.jeudi || l.props?.samedi?.length)
          : true;
  const visibles = lignes.filter((l) => garder(filtre, l));

  return (
    <div className="space-y-5" data-testid="onglet-poste">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("ckd.cohorte.poste.titre", { s })}</h2>
          <p className="text-sm text-muted-foreground">{t("ckd.cohorte.poste.aide")}</p>
        </div>
        <div role="group" aria-label={t("ckd.cohorte.poste.joursAria")} className="flex flex-wrap gap-1.5">
          {jours.map((j, i) => {
            const cle = i === 0 ? "lundi" : i === 3 ? "jeudi" : i === 5 ? "samedi" : "soir";
            return (
              <button
                key={j}
                type="button"
                aria-pressed={i === jour}
                onClick={() => setJour(i)}
                className={cn(
                  "flex min-w-[5.5rem] flex-col items-start gap-0.5 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  i === jour ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent",
                )}
              >
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {date(j, { weekday: "short", day: "numeric" })}
                  {j < aujourdhui && <Check className={cn("size-3", i === jour ? "text-background" : "text-success")} aria-hidden />}
                  {j === aujourdhui && (
                    <span className="rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{t("ckd.cohorte.frise.auj")}</span>
                  )}
                </span>
                <span className={cn("text-[11px]", i === jour ? "text-background/75" : "text-muted-foreground")}>
                  {t(`ckd.cohorte.jalonsCourts.${cle}`)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <StatGroup>
        <StatTile
          label={t("ckd.cohorte.poste.publies")}
          value={bilan.publies}
          unit={`/ ${bilan.prevus}`}
          detail={t("ckd.cohorte.poste.publiesDetail", {
            pct: bilan.prevus > 0 ? Math.round((100 * bilan.publies) / bilan.prevus) : 0,
          })}
          trend={bilan.parJour.filter((j) => !j.aVenir && j.prevus > 0).map((j) => j.publies / j.prevus)}
        />
        <StatTile
          label={t("ckd.cohorte.poste.aJour")}
          value={bilan.aJour}
          unit={`/ ${comptes.length}`}
          detail={t("ckd.cohorte.poste.aJourDetail")}
        />
        <StatTile
          label={t("ckd.cohorte.poste.avecManque")}
          value={bilan.avecManque}
          tone={bilan.avecManque > 0 ? "alerte" : "neutre"}
          detail={t("ckd.cohorte.poste.avecManqueDetail")}
        />
        <StatTile
          label={t("ckd.cohorte.poste.mediane")}
          value={bilan.mediane !== null ? nombre(bilan.mediane) : "—"}
          detail={t("ckd.cohorte.poste.medianeTuile", { n: nombre(seuilBon) })}
        />
      </StatGroup>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ckd.cohorte.poste.parJour")}</CardTitle>
            <CardDescription>{t("ckd.cohorte.poste.parJourAide")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarresPubliees
              jourActif={jourSel}
              ariaLabel={t("ckd.cohorte.poste.parJourAria", {
                valeurs: bilan.parJour.map((j) => `${date(j.jour, { weekday: "long" })} ${j.publies}/${j.prevus}`).join(", "),
              })}
              jours={bilan.parJour.map((j) => ({
                cle: j.jour,
                libelle: date(j.jour, { weekday: "short", day: "numeric" }),
                libelleLong: date(j.jour, { weekday: "long", day: "numeric", month: "long" }),
                prevus: j.prevus,
                publies: j.publies,
                aVenir: j.aVenir,
              }))}
              texteJour={(j) => ({
                titre: j.libelleLong,
                lignes: j.aVenir
                  ? [t("ckd.cohorte.poste.aVenir", { n: j.prevus })]
                  : [
                      t("ckd.cohorte.poste.infobullePublies", { publies: j.publies, prevus: j.prevus }),
                      t("ckd.cohorte.poste.infobulleManques", { count: j.prevus - j.publies }),
                    ],
              })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ckd.cohorte.poste.repartition", { n: totalSemaine })}</CardTitle>
            <CardDescription>{t("ckd.cohorte.poste.repartitionAide")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <BarreRepartition
              hauteur="lg"
              aria-label={t("ckd.cohorte.poste.repartition", { n: totalSemaine })}
              segments={[...ETATS_POST, "a_venir" as const].map((e) => ({
                cle: e,
                valeur: bilan.repartition[e],
                couleur: e === "a_venir" ? "color-mix(in srgb, var(--muted-foreground) 10%, transparent)" : COULEUR_ETAT[e],
                libelle: t(`ckd.cohorte.etats.${e}`),
                valeurAffichee: t("ckd.cohorte.nPosts", { count: bilan.repartition[e] }),
              }))}
            />
            <ul className="divide-y divide-border/50 text-sm">
              {[...ETATS_POST, "a_venir" as const]
                .filter((e) => bilan.repartition[e] > 0)
                .map((e) => (
                  <li key={e} className="flex items-center gap-3 py-1.5">
                    <IconeEtat etat={e} />
                    <span className="min-w-0 flex-1">
                      {t(`ckd.cohorte.etats.${e}`)}
                      {(e === "bon" || e === "mort") && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {t(`ckd.cohorte.etatsAide.${e}`, { n: nombre(e === "bon" ? seuilBon : seuilMort) })}
                        </span>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">{bilan.repartition[e]}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                      {totalSemaine > 0 ? Math.round((100 * bilan.repartition[e]) / totalSemaine) : 0} %
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-foreground/20" data-testid="focus-jour">
        <CardContent className="space-y-4 pt-5">
          {jour === 5 ? (
            <>
              <EnTeteFocus
                icone={<Scale className="size-4.5" aria-hidden />}
                ton="noir"
                titre={t("ckd.cohorte.focus.samediTitre", { s })}
                aide={t("ckd.cohorte.focus.samediAide")}
                action={
                  <Button size="sm" variant="outline" onClick={ouvrirGlobal}>
                    {t("ckd.cohorte.focus.horsCohorte")}
                    <ArrowRight />
                  </Button>
                }
              />
              {jourSel > aujourdhui || !controleSamedi ? (
                <p className="text-sm text-muted-foreground">{t("ckd.cohorte.focus.samediAVenir")}</p>
              ) : (
                rendreControle("samedi", jourSel, ids)
              )}
            </>
          ) : (
            <>
              {jour === 3 && (
                <>
                  <EnTeteFocus
                    icone={<MessageCircle className="size-4.5" aria-hidden />}
                    ton="info"
                    titre={t("ckd.cohorte.focus.jeudiTitre")}
                    aide={t("ckd.cohorte.focus.jeudiAide")}
                  />
                  {jourSel > aujourdhui || !controleJeudi ? (
                    <p className="text-sm text-muted-foreground">{t("ckd.cohorte.focus.jeudiAVenir")}</p>
                  ) : (
                    rendreControle("jeudi", jourSel, ids)
                  )}
                  <div className="border-t" />
                </>
              )}
              <RetardsDuJour comptes={comptes} jour={jourSel} aujourdhui={aujourdhui} personnes={personnes} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ckd.cohorte.poste.tableau")}</CardTitle>
          <CardDescription>{t("ckd.cohorte.poste.tableauAide")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Legende />
            <div role="group" aria-label={t("ckd.cohorte.filtresAria")} className="flex flex-wrap gap-1.5">
              {FILTRES_POSTE.map((f) => (
                <Puce key={f} actif={filtre === f} onClick={() => setFiltre(f)} n={lignes.filter((l) => garder(f, l)).length}>
                  {t(`ckd.cohorte.poste.filtres.${f}`)}
                </Puce>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className={TH}>{t("ckd.cohorte.colonnes.compte")}</th>
                  {jours.slice(0, 5).map((j) => (
                    <th key={j} className={cn(TH, "text-center", j === jourSel && "text-foreground")}>
                      {date(j, { weekday: "short", day: "numeric" })}
                    </th>
                  ))}
                  <th className={cn(TH, "text-right")}>{t("ckd.cohorte.colonnes.publies")}</th>
                  <th className={cn(TH, "text-right")}>{t("ckd.cohorte.colonnes.mediane")}</th>
                  <th className={TH}>{t("ckd.cohorte.colonnes.signal")}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(({ compte: c, bilan: b, props: pr }) => {
                  const hm = c.hm_id ? personnes.get(c.hm_id) : undefined;
                  return (
                    <tr key={c.compte_id} className="border-b border-border/40" data-testid={`ligne-poste-${c.handle}`}>
                      <td className={TD}>
                        <CelluleCompte compte={c} poster={personnes.get(c.poster_id)} hm={hm} />
                      </td>
                      {jours.slice(0, 5).map((j) => (
                        <td key={j} className={cn(TD, "text-center", j === jourSel && "bg-info/6")}>
                          <span className="inline-flex gap-1">
                            {c.posts
                              .filter((p) => p.jour === j)
                              .map((p, k) => {
                                const e = etatPost(p, aujourdhui, c.seuil_mort, c.seuil_bon);
                                return (
                                  <CasePost
                                    key={k}
                                    etat={e}
                                    texte={(e === "bon" || e === "normal" || e === "mort") && p.vues !== null ? vuesCourtes(p.vues, i18n.language) : null}
                                    titre={`${date(j, { weekday: "short", day: "numeric" })} · ${
                                      p.vues !== null && p.mesure ? `${nombre(p.vues)} vues · ` : ""
                                    }${t(`ckd.cohorte.etats.${e}`)}`}
                                    url={p.url}
                                  />
                                );
                              })}
                          </span>
                        </td>
                      ))}
                      <td className={cn(TD, "text-right font-medium tabular-nums", b.manques > 0 && "text-warning-foreground")}>
                        {b.publies}/{b.prevus}
                      </td>
                      <td className={cn(TD, "text-right tabular-nums")}>{b.mediane !== null ? nombre(b.mediane) : "—"}</td>
                      <td className={TD}>
                        <Signal props={pr} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibles.length === 0 && <p className="py-4 text-sm text-muted-foreground">{t("ckd.cohorte.videFiltre")}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EnTeteFocus({
  icone,
  ton,
  titre,
  aide,
  action,
}: {
  icone: React.ReactNode;
  ton: "noir" | "info" | "attention";
  titre: string;
  aide: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
            ton === "noir" && "bg-foreground text-background",
            ton === "info" && "bg-info/10 text-info-foreground",
            ton === "attention" && "bg-warning/12 text-warning-foreground",
          )}
        >
          {icone}
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold">{titre}</h3>
          <p className="text-sm text-muted-foreground">{aide}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Le suivi du soir : les comptes qui n'ont pas publié tous leurs posts ce jour-là. */
function RetardsDuJour({
  comptes,
  jour,
  aujourdhui,
  personnes,
}: {
  comptes: CompteCohorte[];
  jour: string;
  aujourdhui: string;
  personnes: Map<string, PersonneCkd>;
}) {
  const { t } = useTranslation();
  const { date } = useFormats();
  const retards = retardsDuJour(comptes, jour);
  const long = date(jour, { weekday: "long", day: "numeric", month: "long" });
  const aVenir = jour > aujourdhui;
  return (
    <div className="space-y-3">
      <EnTeteFocus
        icone={<Moon className="size-4.5" aria-hidden />}
        ton="attention"
        titre={aVenir ? t("ckd.cohorte.focus.soirTitreAVenir", { jour: long }) : t("ckd.cohorte.focus.soirTitre", { jour: long, count: retards.length })}
        aide={
          aVenir
            ? t("ckd.cohorte.focus.soirAVenir")
            : jour === aujourdhui
              ? t("ckd.cohorte.focus.soirAideAujourdhui")
              : t("ckd.cohorte.focus.soirAidePasse")
        }
      />
      {!aVenir &&
        (retards.length === 0 ? (
          <p className="inline-flex items-center gap-2 text-sm text-success-foreground">
            <Check className="size-4" aria-hidden />
            {t("ckd.cohorte.focus.soirRien")}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {retards.map(({ compte: c, prevus, publies }) => (
              <li
                key={c.compte_id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2",
                  jour === aujourdhui ? "border-warning/40 bg-warning/6" : "border-destructive/30 bg-destructive/5",
                )}
              >
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/createurs/${c.compte_id}`} className="block truncate font-medium underline-offset-2 hover:underline">
                    {drapeauPays(c.pays)} @{c.handle}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {[nomPersonne(personnes.get(c.poster_id)), c.hm_id ? t("ckd.cohorte.hm", { nom: nomPersonne(personnes.get(c.hm_id)) }) : t("ckd.sansHm")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border bg-card px-2 py-0.5 text-xs font-semibold tabular-nums",
                    jour === aujourdhui ? "text-warning-foreground" : "text-destructive-foreground",
                  )}
                >
                  {publies}/{prevus}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function CelluleCompte({ compte: c, poster, hm }: { compte: CompteCohorte; poster?: PersonneCkd; hm?: PersonneCkd }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <Link to={`/admin/createurs/${c.compte_id}`} className="truncate font-medium underline-offset-2 hover:underline">
          {drapeauPays(c.pays)} @{c.handle}
        </Link>
        {c.application && <LogoApplication slug={c.application} taille="xs" />}
        {!c.is_active && (
          <span className="rounded-full border px-1.5 text-[10px] text-muted-foreground">{t("ckd.cohorte.arrete")}</span>
        )}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {[nomPersonne(poster), hm ? t("ckd.cohorte.hm", { nom: nomPersonne(hm) }) : t("ckd.sansHm")].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function CasePost({ etat, texte, titre, url }: { etat: EtatPost; texte: string | null; titre: string; url: string | null }) {
  const classe = cn(
    "inline-flex h-6 w-11 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums",
    CASE[etat],
  );
  const contenu = texte ?? <IconeEtat etat={etat} nue />;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={titre} aria-label={titre} className={cn(classe, "hover:brightness-95")}>
        {contenu}
      </a>
    );
  }
  return (
    <span title={titre} aria-label={titre} role="img" className={classe}>
      {contenu}
    </span>
  );
}

function IconeEtat({ etat, nue = false }: { etat: EtatPost; nue?: boolean }) {
  const icone =
    etat === "manque" ? (
      <X className="size-3.5" aria-hidden />
    ) : etat === "attente" ? (
      <Clock className="size-3.5" aria-hidden />
    ) : etat === "pas_encore" ? (
      <AlertCircle className="size-3.5" aria-hidden />
    ) : etat === "a_venir" ? (
      <span className="size-1 rounded-full bg-current" aria-hidden />
    ) : etat === "bon" ? (
      <TrendingUp className="size-3.5" aria-hidden />
    ) : etat === "mort" ? (
      <TrendingDown className="size-3.5" aria-hidden />
    ) : (
      <Check className="size-3.5" aria-hidden />
    );
  if (nue) return icone;
  return <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md border", CASE[etat])}>{icone}</span>;
}

function Legende() {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label={t("ckd.cohorte.legende")}>
      {ETATS_POST.map((e) => (
        <li key={e} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-3.5 w-6 rounded-[4px] border", CASE[e])} aria-hidden />
          {t(`ckd.cohorte.etats.${e}`)}
        </li>
      ))}
    </ul>
  );
}

export function Puce({
  actif,
  onClick,
  n,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        actif ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent",
      )}
    >
      {children}
      <span className={cn("tabular-nums", actif ? "text-background/70" : "text-muted-foreground")}>{n}</span>
    </button>
  );
}

/** Ce que Check, Kill or Double a proposé pour ce compte, et ce qui a été décidé. */
function Signal({ props }: { props?: PropositionsDuCompte }) {
  const { t } = useTranslation();
  if (!props?.samedi?.length && !props?.jeudi) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {(props.samedi ?? []).map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
          <span className={cn("size-1.5 rounded-full", POINT_ACTION[p.action])} aria-hidden />
          {t(`ckd.actions.${p.action}`)}
          {p.decision && (
            <span className="text-muted-foreground">→ {t(`ckd.boutons.${boutonDeLaDecision(p.decision)}`)}</span>
          )}
        </span>
      ))}
      {props.jeudi && (
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
          <span className={cn("size-1.5 rounded-full", POINT_ACTION.nudge)} aria-hidden />
          {t("ckd.cohorte.signalNudge", {
            motifs: props.jeudi.donnees.motifs.map((m) => t(`ckd.motifs.${m}`)).join(", "),
          })}
          {props.jeudi.decision && (
            <span className="text-muted-foreground">→ {t(`ckd.boutons.${boutonDeLaDecision(props.jeudi.decision)}`)}</span>
          )}
        </span>
      )}
    </div>
  );
}

