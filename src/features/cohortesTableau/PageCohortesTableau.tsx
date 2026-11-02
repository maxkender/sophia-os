import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatGroup, StatTile } from "@/components/ui/stat";
import { CourbesCumul } from "@/features/ckd/cohorte/graphes";
import { minuitParis, resteAvant } from "@/features/ckd/cohorte/logique";
import { ajouterJours, partiesParis } from "@/features/onboarding/datesRuul";
import { localeDate } from "@/locales/localeDate";

import { type DonneesCohortes, lireCohortes, type PosteurCohorte } from "./api";
import { Barres } from "./Barres";
import {
  bilanMessages,
  etapeBloquante,
  bilanPassee,
  bloquesParEtape,
  comparaison,
  departs,
  entonnoir,
  entonnoirPar,
  ETAPES,
  listeCohortes,
  parHm,
  pourcent,
  statsSemaines,
} from "./logique";

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";
const TH = "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground";
const TD = "px-2 py-1.5 align-top";
/** Une cellule de nombre : à droite, sur une ligne (le tableau défile en largeur sur un petit écran). */
const TDN = `${TD} whitespace-nowrap text-right tabular-nums`;

function useFormats() {
  const { i18n } = useTranslation();
  const locale = localeDate(i18n.resolvedLanguage ?? "fr");
  return {
    jour: (j: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${j.slice(0, 10)}T12:00:00Z`)),
    instant: (i: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(i)),
    heure: (i: string) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(i)),
    nombre: (n: number) => new Intl.NumberFormat(locale).format(n),
  };
}

/**
 * Recruitment Automation → Cohorts : les tableaux de bord des cohortes, en
 * lecture seule (admin et Head of Ops). En haut, le choix de la cohorte (la
 * prochaine par défaut). La prochaine : sera-t-elle prête dimanche minuit ?
 * Une cohorte commencée : comment a-t-elle fait ? En bas, toutes les cohortes
 * côte à côte. Les recrues reportées comptent dans la cohorte où elles
 * commencent vraiment, marquées « reportée du ». Aucun message, aucun interrupteur.
 */
export function PageCohortesTableau({ maintenant = new Date() }: { maintenant?: Date }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [params, setParams] = useSearchParams();
  const lu = useQuery({ queryKey: ["cohortes-tableau"], queryFn: lireCohortes, staleTime: 5 * 60_000 });
  const aujourdhui = partiesParis(maintenant).date;
  const liste = lu.data ? listeCohortes(lu.data.postes, aujourdhui) : [];
  const choisie = liste.find((c) => c.lundi === params.get("cohorte")) ?? liste[0];
  const choisir = (lundi: string) => {
    setParams((p) => {
      const x = new URLSearchParams(p);
      x.set("cohorte", lundi);
      return x;
    });
    document.querySelector("[data-testid=cohortes-tableau]")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6" data-testid="cohortes-tableau">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className={selectClass}
          aria-label={t("cohortesTableau.choix")}
          value={choisie?.lundi ?? ""}
          onChange={(e) => choisir(e.target.value)}
        >
          {liste.map((c) => (
            <option key={c.lundi} value={c.lundi}>
              {t(c.statut === "prochaine" ? "cohortesTableau.optionProchaine" : "cohortesTableau.option", { date: f.jour(c.lundi), n: c.taille })}
            </option>
          ))}
        </select>
        {lu.data && <span className="text-xs text-muted-foreground">{t("cohortesTableau.majA", { heure: f.heure(lu.data.lu_at) })}</span>}
        {lu.isFetching && <span className="text-xs text-muted-foreground">{t("common.loading")}</span>}
      </div>
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      {lu.data && choisie && (
        choisie.statut === "prochaine"
          ? <VueProchaine donnees={lu.data} lundi={choisie.lundi} maintenant={maintenant} />
          : <VuePassee donnees={lu.data} lundi={choisie.lundi} aujourdhui={aujourdhui} />
      )}
      {lu.data && <TableauComparaison donnees={lu.data} aujourdhui={aujourdhui} choisie={choisie?.lundi ?? null} choisir={choisir} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La prochaine cohorte : sera-t-elle prête ?
// ---------------------------------------------------------------------------

function VueProchaine({ donnees, lundi, maintenant }: { donnees: DonneesCohortes; lundi: string; maintenant: Date }) {
  const { t } = useTranslation();
  const f = useFormats();
  const postes = donnees.postes.filter((p) => p.cohorte_lundi === lundi);
  const marches = entonnoir(postes);
  const reste = resteAvant(minuitParis(lundi), maintenant);
  const bloques = bloquesParEtape(postes);
  const messages = bilanMessages(postes);
  const reportes = postes.filter((p) => p.reporte_de === ajouterJours(lundi, -7));
  const pretes = marches.find((m) => m.etape === "pret")!;

  return (
    <div className="space-y-6" data-vue="prochaine">
      <Card>
        <CardHeader>
          <CardTitle>{t("cohortesTableau.prochaine.titre", { date: f.jour(lundi), n: postes.length })}</CardTitle>
          <CardDescription data-testid="compte-a-rebours">
            {reste
              ? t("cohortesTableau.prochaine.reste", { j: reste.jours, h: reste.heures, m: reste.minutes })
              : t("cohortesTableau.prochaine.passe")}
            {" · "}
            {t("cohortesTableau.prochaine.pretes", { n: pretes.n, pct: pretes.pct })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2" aria-label={t("cohortesTableau.prochaine.entonnoir")}>
            {marches.map((m) => (
              <li key={m.etape} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3 text-sm" data-etape={m.etape}>
                <span className="text-muted-foreground">{t(`cohortesTableau.etapes.${m.etape}`)}</span>
                <span className="h-4 rounded-r bg-muted/50" title={`${m.n} / ${postes.length}`}>
                  <span className="block h-4 rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${m.pct}%` }} />
                </span>
                <span className="w-24 text-right tabular-nums">
                  <span className="font-semibold">{m.n}</span> <span className="text-muted-foreground">· {m.pct} %</span>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <TableauGroupes titre={t("cohortesTableau.prochaine.parHm")} lignes={entonnoirPar(postes, "hm")} premier={t("cohortesTableau.colonnes.hm")} />
        <TableauGroupes titre={t("cohortesTableau.prochaine.parPays")} lignes={entonnoirPar(postes, "pays")} premier={t("cohortesTableau.colonnes.pays")} />
      </div>

      <StatGroup>
        <StatTile label={t("cohortesTableau.messages.bienvenues")} value={messages.bienvenues} unit={`/ ${postes.length}`} />
        <StatTile label={t("cohortesTableau.messages.relances")} value={messages.slack + messages.upwork} detail={t("cohortesTableau.messages.canaux", { slack: messages.slack, upwork: messages.upwork })} />
        <StatTile label={t("cohortesTableau.messages.main")} value={messages.main} />
        <StatTile label={t("cohortesTableau.messages.demain")} value={messages.enFile} />
      </StatGroup>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cohortesTableau.bloques.titre")}</CardTitle>
          <CardDescription>{t("cohortesTableau.bloques.aide")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ETAPES.map((e) => {
            const liste = bloques.get(e) ?? [];
            if (liste.length === 0) return null;
            return (
              <details key={e} className="rounded-md border" data-bloques={e}>
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                  {t("cohortesTableau.bloques.etape", { etape: t(`cohortesTableau.etapes.${e}`), n: liste.length })}
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className={TH}>{t("cohortesTableau.colonnes.recrue")}</th>
                        <th className={TH}>{t("cohortesTableau.colonnes.hm")}</th>
                        <th className={TH}>{t("cohortesTableau.colonnes.depuis")}</th>
                        <th className={TH}>{t("cohortesTableau.colonnes.relances")}</th>
                        <th className={TH}>{t("cohortesTableau.colonnes.reaction")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map(({ p, depuis }) => (
                        <tr key={p.poster_id} className="border-b border-border/40" data-bloque={p.poster_id}>
                          <td className={TD}>
                            <Link to={`/admin/auto/recruits#recrue-${p.poster_id}`} className="font-medium underline-offset-2 hover:underline">
                              {p.nom ?? "—"}
                            </Link>
                            <MarqueReporte p={p} />
                          </td>
                          <td className={TD}>{p.hm_nom ?? "—"}</td>
                          <td className={`${TD} tabular-nums`}>{depuis ? f.instant(depuis) : "—"}</td>
                          <td className={`${TD} tabular-nums`}>{t("cohortesTableau.bloques.relances", { slack: p.relances_slack, upwork: p.relances_upwork })}</td>
                          <td className={`${TD} tabular-nums`}>{p.derniere_reaction ? f.instant(p.derniere_reaction) : t("cohortesTableau.bloques.aucune")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cohortesTableau.reportes.titre", { n: reportes.length, date: f.jour(ajouterJours(lundi, -7)) })}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {reportes.length === 0 ? (
            <p className="text-muted-foreground">{t("cohortesTableau.reportes.vide")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {reportes.map((p) => (
                <li key={p.poster_id} className="flex flex-wrap items-center gap-2 p-2" data-reporte={p.poster_id}>
                  <Link to={`/admin/auto/recruits#recrue-${p.poster_id}`} className="font-medium underline-offset-2 hover:underline">
                    {p.nom ?? "—"}
                  </Link>
                  <span className="text-xs text-muted-foreground">{p.hm_nom ? `HM ${p.hm_nom}` : ""}</span>
                  <Badge variant="secondary">{t(`cohortesTableau.etapes.${etapeBloquante(p) ?? "pret"}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MarqueReporte({ p }: { p: PosteurCohorte }) {
  const { t } = useTranslation();
  const f = useFormats();
  if (!p.reporte_de) return null;
  return (
    <Badge variant="warning" className="ml-2" data-reporte-de={p.reporte_de}>
      {t("cohortesTableau.reporteDe", { date: f.jour(p.reporte_de) })}
    </Badge>
  );
}

function TableauGroupes({ titre, lignes, premier }: { titre: string; lignes: ReturnType<typeof entonnoirPar>; premier: string }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titre}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className={TH}>{premier}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.total")}</th>
              {ETAPES.slice(1).map((e) => (
                <th key={e} className={`${TH} text-right`}>{t(`cohortesTableau.etapesCourt.${e}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cle} className="border-b border-border/40">
                <td className={TD}>{l.libelle}</td>
                <td className={TDN}>{l.total}</td>
                {l.n.slice(1).map((n, i) => (
                  <td key={i} className={TDN} title={`${n} / ${l.total}`}>
                    {n} <span className="text-xs text-muted-foreground">{pourcent(n, l.total)} %</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Une cohorte commencée : comment a-t-elle fait ?
// ---------------------------------------------------------------------------

function VuePassee({ donnees, lundi, aujourdhui }: { donnees: DonneesCohortes; lundi: string; aujourdhui: string }) {
  const { t } = useTranslation();
  const f = useFormats();
  const postes = donnees.postes.filter((p) => p.cohorte_lundi === lundi);
  const bilan = bilanPassee(postes);
  const semaines = statsSemaines(postes, donnees.vues, lundi, aujourdhui);
  const liste = departs(postes, lundi);
  const hms = parHm(postes, donnees.vues, lundi, aujourdhui);
  const libS = (k: number) => t("cohortesTableau.semaine", { k });
  const raison = (r: string) => t(`cohortesTableau.raisons.${r}`, { defaultValue: r });
  const reportes = postes.filter((p) => p.reporte_de).length;
  const parSemaine = new Map<string, typeof liste>();
  for (const d of liste) {
    const cle = d.k === null ? "?" : d.k <= 0 ? "0" : String(d.k);
    parSemaine.set(cle, [...(parSemaine.get(cle) ?? []), d]);
  }
  const resume = (ds: typeof liste) => {
    const n = new Map<string, number>();
    for (const d of ds) n.set(raison(d.raison), (n.get(raison(d.raison)) ?? 0) + 1);
    return [...n.entries()].map(([r, c]) => (c > 1 ? `${r} ×${c}` : r)).join(", ");
  };

  return (
    <div className="space-y-6" data-vue="passee">
      <Card>
        <CardHeader>
          <CardTitle>{t("cohortesTableau.passee.titre", { date: f.jour(lundi), n: postes.length })}</CardTitle>
          {reportes > 0 && <CardDescription>{t("cohortesTableau.passee.reportes", { n: reportes })}</CardDescription>}
        </CardHeader>
      </Card>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border/70 sm:grid-cols-3 lg:grid-cols-5" data-testid="bilan-passee">
        <StatTile label={t("cohortesTableau.passee.demarres")} value={bilan.demarres} unit={`/ ${bilan.taille}`} />
        <StatTile label={t("cohortesTableau.passee.actifs")} value={bilan.actifs} unit={`/ ${bilan.taille}`} />
        <StatTile label={t("cohortesTableau.passee.kills")} value={bilan.kills} />
        <StatTile label={t("cohortesTableau.passee.arrets")} value={bilan.arrets} />
        <StatTile label={t("cohortesTableau.passee.doubles")} value={bilan.doubles} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("cohortesTableau.passee.retention")}</CardTitle>
            <CardDescription>{t("cohortesTableau.passee.retentionAide")}</CardDescription>
          </CardHeader>
          <CardContent>
            {semaines.length > 0 && (
              <CourbesCumul
                jours={semaines.map((s) => ({ cle: `S${String(s.k).padStart(2, "0")}`, libelle: libS(s.k), libelleLong: libS(s.k) + (s.enCours ? ` (${t("cohortesTableau.enCours")})` : "") }))}
                series={[{ cle: "r", libelle: t("cohortesTableau.passee.retentionCourt"), couleur: "#2a78d6", valeurs: semaines.map((s) => s.retention) }]}
                aujourdhui="S99"
                ariaLabel={t("cohortesTableau.passee.retention") + " : " + semaines.map((s) => `${libS(s.k)} ${s.retention} %`).join(", ")}
                libelleAVenir=""
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("cohortesTableau.passee.posts")}</CardTitle>
            <CardDescription>{t("cohortesTableau.passee.postsAide")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Barres
              points={semaines.map((s) => ({
                cle: String(s.k),
                libelle: libS(s.k),
                sous: s.part6 === null ? "" : `${s.part6} % ≥ 6`,
                valeur: s.moyenne,
                partiel: s.enCours,
                infobulle: {
                  titre: libS(s.k) + (s.enCours ? ` (${t("cohortesTableau.enCours")})` : ""),
                  lignes: [
                    t("cohortesTableau.passee.moyenne", { n: s.moyenne === null ? "—" : f.nombre(s.moyenne) }),
                    t("cohortesTableau.passee.part6", { pct: s.part6 ?? "—" }),
                  ],
                },
              }))}
              format={(v) => f.nombre(v)}
              ariaLabel={t("cohortesTableau.passee.posts") + " : " + semaines.map((s) => `${libS(s.k)} ${s.moyenne ?? "—"}`).join(", ")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("cohortesTableau.passee.vues")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Barres
              points={semaines.map((s) => ({
                cle: String(s.k),
                libelle: libS(s.k),
                valeur: s.mediane,
                partiel: s.enCours,
                infobulle: { titre: libS(s.k), lignes: [t("cohortesTableau.passee.mediane", { n: s.mediane === null ? "—" : f.nombre(s.mediane) })] },
              }))}
              format={(v) => f.nombre(v)}
              ariaLabel={t("cohortesTableau.passee.vues") + " : " + semaines.map((s) => `${libS(s.k)} ${s.mediane ?? "—"}`).join(", ")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("cohortesTableau.passee.departs")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {liste.length === 0 ? (
              <p className="text-muted-foreground">{t("cohortesTableau.passee.aucunDepart")}</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className={TH}>{t("cohortesTableau.colonnes.semaine")}</th>
                    <th className={TH}>{t("cohortesTableau.passee.kills")}</th>
                    <th className={TH}>{t("cohortesTableau.passee.arrets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...parSemaine.entries()].map(([cle, ds]) => {
                    const kills = ds.filter((d) => d.type === "kill");
                    const arrets = ds.filter((d) => d.type === "arret");
                    return (
                      <tr key={cle} className="border-b border-border/40" data-depart-semaine={cle}>
                        <td className={TD}>{cle === "?" ? t("cohortesTableau.dateInconnue") : cle === "0" ? t("cohortesTableau.avantDepart") : libS(Number(cle))}</td>
                        <td className={TD}>{kills.length ? `${kills.length} · ${resume(kills)}` : "—"}</td>
                        <td className={TD}>{arrets.length ? `${arrets.length} · ${resume(arrets)}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cohortesTableau.passee.parHm")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={TH}>{t("cohortesTableau.colonnes.hm")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.taille")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.passee.demarres")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.passee.actifs")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.passee.kills")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.passee.arrets")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.passee.doubles")}</th>
                {semaines.slice(0, 4).map((s) => (
                  <th key={s.k} className={`${TH} text-right`}>{libS(s.k)}</th>
                ))}
                <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.moyenneS1")}</th>
                <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.mediane")}</th>
              </tr>
            </thead>
            <tbody>
              {hms.map((h) => (
                <tr key={h.cle} className="border-b border-border/40" data-hm={h.cle}>
                  <td className={TD}>{h.libelle}</td>
                  <td className={TDN}>{h.bilan.taille}</td>
                  <td className={TDN}>{h.bilan.demarres}</td>
                  <td className={TDN}>{h.bilan.actifs}</td>
                  <td className={TDN}>{h.bilan.kills}</td>
                  <td className={TDN}>{h.bilan.arrets}</td>
                  <td className={TDN}>{h.bilan.doubles}</td>
                  {semaines.slice(0, 4).map((s) => (
                    <td key={s.k} className={TDN}>{h.semaines.find((x) => x.k === s.k)?.retention ?? "—"} %</td>
                  ))}
                  <td className={TDN}>{h.semaines[0]?.moyenne == null ? "—" : f.nombre(h.semaines[0].moyenne)}</td>
                  <td className={TDN}>{h.mediane === null ? "—" : f.nombre(h.mediane)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toutes les cohortes, côte à côte
// ---------------------------------------------------------------------------

function TableauComparaison({ donnees, aujourdhui, choisie, choisir }: {
  donnees: DonneesCohortes;
  aujourdhui: string;
  choisie: string | null;
  choisir: (lundi: string) => void;
}) {
  const { t } = useTranslation();
  const f = useFormats();
  const lignes = comparaison(donnees.postes, donnees.vues, aujourdhui);
  const pct = (v: number | null) => (v === null ? "—" : `${v} %`);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("cohortesTableau.comparaison.titre")}</CardTitle>
        <CardDescription>{t("cohortesTableau.comparaison.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="comparaison">
          <thead>
            <tr className="border-b">
              <th className={TH}>{t("cohortesTableau.colonnes.depart")}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.taille")}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.pret")}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.semaine", { k: 1 })}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.semaine", { k: 2 })}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.semaine", { k: 4 })}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.moyenneS1")}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.passee.kills")}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.passee.doubles")}</th>
              <th className={`${TH} text-right`}>{t("cohortesTableau.colonnes.mediane")}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr
                key={l.lundi}
                data-cohorte={l.lundi}
                tabIndex={0}
                aria-selected={l.lundi === choisie}
                className={`cursor-pointer border-b border-border/40 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring ${l.lundi === choisie ? "bg-muted/60" : ""}`}
                onClick={() => choisir(l.lundi)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choisir(l.lundi);
                  }
                }}
              >
                <td className={`${TD} whitespace-nowrap`}>
                  {f.jour(l.lundi)}
                  {l.statut === "prochaine" && <Badge variant="info" className="ml-2">{t("cohortesTableau.comparaison.prochaine")}</Badge>}
                </td>
                <td className={TDN}>{l.taille}</td>
                <td className={TDN}>{pct(l.pret)}</td>
                <td className={TDN}>{pct(l.r1)}</td>
                <td className={TDN}>{pct(l.r2)}</td>
                <td className={TDN}>{pct(l.r4)}</td>
                <td className={TDN}>{l.moyenneS1 === null ? "—" : f.nombre(l.moyenneS1)}</td>
                <td className={TDN}>{l.kills}</td>
                <td className={TDN}>{l.doubles}</td>
                <td className={TDN}>{l.mediane === null ? "—" : f.nombre(l.mediane)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
