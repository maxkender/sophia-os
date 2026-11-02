import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { fixerObjectifPays, lireDetailPays, lireMetaPays, lireTableauPays, type MetaPays } from "./api";
import { BarresDoubles, BarresEmpilees, BarresEtCourbe, Courbe, InfoBulle } from "./Graphiques";
import {
  aFaireSemaine,
  annoncesActives,
  ciblesParHm,
  drapeau,
  libelleMarche,
  type LignePays,
  lignesPays,
  marcheDe,
  nomPays,
  type Recommandation,
  serieHebdo,
  seriePays,
  statutCompte,
  type TableauPays,
  tableauHm,
  topFlopRoi,
  totauxPeriode,
  variation,
} from "./logique";

type Onglet = "apercu" | "pays" | "recrutement" | "detail";
const ONGLETS: Onglet[] = ["apercu", "pays", "recrutement", "detail"];

const COULEUR: Record<Recommandation, "success" | "warning" | "destructive" | "secondary"> = {
  recruter: "success",
  maintenir: "success",
  reduire: "warning",
  arreter: "destructive",
  exclu: "secondary",
};

function useFormats() {
  const { i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const loc = localeDate(langue);
  return {
    langue,
    eur: (n: number | null) => (n === null ? "—" : new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)),
    eur2: (n: number | null) => (n === null ? "—" : new Intl.NumberFormat(loc, { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)),
    nb: (n: number | null, d = 0) => (n === null ? "—" : new Intl.NumberFormat(loc, { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)),
    court: (n: number) => new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 }).format(n),
    jour: (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(loc, { day: "numeric", month: "short" }),
    quand: (iso: string | null) => (iso ? new Date(iso).toLocaleString(loc, { dateStyle: "short", timeStyle: "short" }) : "—"),
  };
}

function Pays({ code, zone }: { code: string; zone?: string | null }) {
  const { langue } = useFormats();
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden>{drapeau(code)}</span>
      <span className="truncate">{nomPays(code, langue)}</span>
      {zone && <span className="text-xs text-muted-foreground">{zone}</span>}
    </span>
  );
}

function Decision({ l }: { l: LignePays }) {
  const { t } = useTranslation();
  return (
    <Badge variant={COULEUR[l.recommandation]} title={l.raison}>
      {t(`decisionPays.reco.${l.recommandation}`, { n: Math.max(0, l.manque) })}
    </Badge>
  );
}

/** Une carte : un gros chiffre, sa variation, son (i). */
function Carte({ titre, aide, valeur, delta, inverse = false }: { titre: string; aide: string; valeur: string; delta?: number | null; inverse?: boolean }) {
  const { t } = useTranslation();
  const bon = delta !== null && delta !== undefined && (inverse ? delta < 0 : delta > 0);
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">{titre} <InfoBulle texte={aide} /></p>
        <p className="text-3xl font-semibold tabular-nums">{valeur}</p>
        {delta !== undefined && (
          <p className={cn("flex items-center gap-1 text-xs tabular-nums", delta === null ? "text-muted-foreground" : bon ? "text-emerald-600" : "text-red-600")}>
            {delta === null ? "—" : delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            {delta === null ? "" : `${delta > 0 ? "+" : ""}${delta} % ${t("decisionPays.vsAvant")}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Apercu({ tab, lignes, avant, ouvrir }: { tab: TableauPays; lignes: LignePays[]; avant: LignePays[]; ouvrir: (p: string) => void }) {
  const { t } = useTranslation();
  const f = useFormats();
  const tot = totauxPeriode(lignes);
  const prec = totauxPeriode(avant);
  const serie = serieHebdo(tab, 8);
  const faire = aFaireSemaine(lignes, avant);
  const { top, flop } = topFlopRoi(lignes);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Carte titre={t("decisionPays.kpi.proceeds")} aide={t("decisionPays.aide.proceeds")} valeur={f.eur(tot.proceeds)} delta={variation(tot.proceeds, prec.proceeds)} />
        <Carte titre={t("decisionPays.kpi.paie")} aide={t("decisionPays.aide.paie")} valeur={f.eur(tot.cout)} delta={variation(tot.cout, prec.cout)} inverse />
        <Carte
          titre={t("decisionPays.kpi.roi")}
          aide={t("decisionPays.aide.roiGlobal", { incr: f.eur(tot.incremental), paie: f.eur(tot.cout), roi: f.nb(tot.roi, 1), sans: f.eur(tot.sans_posteurs) })}
          valeur={tot.roi === null ? "—" : `${f.nb(tot.roi, 1)}×`}
          delta={variation(tot.roi, prec.roi)}
        />
        <Carte titre={t("decisionPays.kpi.rpm")} aide={t("decisionPays.aide.rpm")} valeur={f.nb(tot.rpm, 2)} delta={variation(tot.rpm, prec.rpm)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("decisionPays.sansPosteurs", { montant: f.eur(tot.sans_posteurs) })} <InfoBulle texte={t("decisionPays.aide.sansPosteurs")} />
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1 text-sm">{t("decisionPays.graph.proceedsPaie")} <InfoBulle texte={t("decisionPays.aide.graphProceedsPaie")} /></CardTitle></CardHeader>
          <CardContent>
            <BarresDoubles points={serie.map((s) => ({ label: f.jour(s.semaine), a: s.proceeds, b: s.cout }))} legendes={[t("decisionPays.graph.legProceeds"), t("decisionPays.graph.legPaie")]} format={f.eur} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1 text-sm">{t("decisionPays.graph.vues")} <InfoBulle texte={t("decisionPays.aide.vues")} /></CardTitle></CardHeader>
          <CardContent>
            <Courbe points={serie.map((s) => ({ label: f.jour(s.semaine), v: s.vues }))} format={(n) => f.court(n)} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card data-testid="a-faire">
          <CardHeader className="pb-1"><CardTitle className="text-sm">{t("decisionPays.aFaire.titre")}</CardTitle></CardHeader>
          <CardContent>
            {faire.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("decisionPays.aFaire.rien")}</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {faire.map((a) => (
                  <li key={`${a.type}-${a.pays}`} className="flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", a.type === "recruter" ? "bg-emerald-500" : a.type === "arreter" ? "bg-red-500" : "bg-amber-500")} />
                    <button type="button" className="text-left hover:underline" onClick={() => ouvrir(a.pays)}>
                      {t(`decisionPays.aFaire.${a.type}`, { n: a.nombre ?? 0, pays: `${drapeau(a.pays)} ${nomPays(a.pays, f.langue)}` })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {([["top", top], ["flop", flop]] as const).map(([cle, liste]) => (
          <Card key={cle}>
            <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1 text-sm">{t(`decisionPays.${cle}`)} <InfoBulle texte={t("decisionPays.aide.roi")} /></CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-1.5 text-sm">
                {liste.map((l) => (
                  <li key={l.pays} className="flex items-center justify-between gap-2">
                    <button type="button" className="min-w-0 text-left hover:underline" onClick={() => ouvrir(l.pays)}><Pays code={l.pays} /></button>
                    <span className={cn("font-semibold tabular-nums", cle === "top" ? "text-emerald-600" : "text-red-600")}>{f.nb(l.roi, 1)}×</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type Tri = "pays" | "proceeds" | "rpm" | "roi" | "posteurs";

function Classement({ lignes, ouvrir }: { lignes: LignePays[]; ouvrir: (p: string) => void }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [zone, setZone] = React.useState("tout");
  const [langue, setLangue] = React.useState("toutes");
  const [tri, setTri] = React.useState<{ c: Tri; desc: boolean }>({ c: "roi", desc: true });
  const langues = [...new Set(lignes.map((l) => marcheDe(l.pays)))].filter((m) => !/^[A-Z]{2}$/.test(m)).sort();
  const val = (l: LignePays, c: Tri): number | string =>
    c === "pays" ? nomPays(l.pays, f.langue) : c === "posteurs" ? l.actifs : (l[c] ?? -Infinity);
  const liste = lignes
    .filter((l) => (zone === "tout" || l.zone === zone) && (langue === "toutes" || marcheDe(l.pays) === langue))
    .sort((a, b) => {
      const x = val(a, tri.c);
      const y = val(b, tri.c);
      const o = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : Number(x) - Number(y);
      return tri.desc ? -o : o;
    });
  const entete = (c: Tri, aide?: string) => (
    <th className={cn("px-2 py-2 font-medium", c !== "pays" && "text-right")}>
      <button type="button" className="inline-flex items-center gap-1" onClick={() => setTri((x) => ({ c, desc: x.c === c ? !x.desc : c !== "pays" }))}>
        {t(`decisionPays.col.${c}`)}{tri.c === c ? (tri.desc ? " ↓" : " ↑") : ""}
      </button>
      {aide && <> <InfoBulle texte={aide} /></>}
    </th>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm">
          {["tout", "A", "B", "C"].map((z) => (
            <button key={z} type="button" onClick={() => setZone(z)} className={cn("rounded px-3 py-1", zone === z ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {z === "tout" ? t("decisionPays.zones") : t("decisionPays.zone", { zone: z })}
            </button>
          ))}
        </div>
        <select className="h-8 rounded-md border bg-background px-2 text-sm" value={langue} onChange={(e) => setLangue(e.target.value)} aria-label={t("decisionPays.langue")}>
          <option value="toutes">{t("decisionPays.langues")}</option>
          {langues.map((m) => <option key={m} value={m}>{libelleMarche(m, f.langue)}</option>)}
        </select>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full table-fixed text-sm" data-testid="tableau-pays">
            <colgroup><col className="w-[34%]" /><col className="w-[15%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[15%]" /><col className="w-[16%]" /></colgroup>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {entete("pays")}
                {entete("proceeds", t("decisionPays.aide.proceeds"))}
                {entete("rpm", t("decisionPays.aide.rpm"))}
                {entete("roi", t("decisionPays.aide.roi"))}
                {entete("posteurs", t("decisionPays.aide.posteurs"))}
                <th className="px-2 py-2 text-right font-medium">{t("decisionPays.col.decision")} <InfoBulle texte={t("decisionPays.aide.decision")} /></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => (
                <tr key={l.pays} onClick={() => ouvrir(l.pays)} className={cn("cursor-pointer border-t hover:bg-muted/30", l.revenu_sans_posteurs && "text-muted-foreground")}>
                  <td className="px-2 py-2"><Pays code={l.pays} zone={l.zone} /></td>
                  <td className="px-2 py-2 text-right tabular-nums">{f.eur(l.proceeds)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{f.nb(l.rpm, 2)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{l.roi === null ? "—" : `${f.nb(l.roi, 1)}×`}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.actifs} → {l.objectif}</td>
                  <td className="px-2 py-2 text-right"><Decision l={l} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Recrutement({ tab, lignes, meta, ouvrir }: { tab: TableauPays; lignes: LignePays[]; meta: MetaPays | undefined; ouvrir: (p: string) => void }) {
  const { t } = useTranslation();
  const f = useFormats();
  const [texte, setTexte] = React.useState<string | null>(null);
  const actives = annoncesActives(meta?.annonces ?? []);
  const visibles = lignes
    .filter((l) => !l.revenu_sans_posteurs && (l.pipeline > 0 || l.objectif > 0))
    .sort((a, b) => b.manque - a.manque || b.objectif - a.objectif);
  const hm = tableauHm(lignes, tab.hms, actives);
  const preparer = () => {
    const { cibles, sansHm } = ciblesParHm(lignes, tab.hms);
    setTexte(
      [
        ...cibles.map((c) => `${c.hm.nom ?? c.hm.id} : ${c.lignes.map((l) => `${nomPays(l.pays, f.langue)} +${l.nombre}`).join(", ")} (${c.total})`),
        ...(sansHm.length ? [`${t("decisionPays.cibles.sansHm")} : ${sansHm.map((l) => `${nomPays(l.pays, f.langue)} +${l.nombre}`).join(", ")}`] : []),
      ].join("\n") || t("decisionPays.cibles.rien"),
    );
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1 text-sm">{t("decisionPays.recrutement.titre")} <InfoBulle texte={t("decisionPays.aide.pipeline")} /></CardTitle></CardHeader>
        <CardContent>
          <BarresEmpilees
            libelleObjectif={t("decisionPays.recrutement.objectif")}
            legende={[
              { nom: t("decisionPays.recrutement.actifs"), classe: "bg-foreground/80" },
              { nom: t("decisionPays.recrutement.cohorte"), classe: "bg-sky-600" },
              { nom: t("decisionPays.recrutement.suivante"), classe: "bg-sky-300" },
              { nom: t("decisionPays.recrutement.offres"), classe: "bg-amber-400" },
            ]}
            lignes={visibles.map((l) => ({
              cle: l.pays,
              libelle: <button type="button" className="hover:underline" onClick={() => ouvrir(l.pays)}><Pays code={l.pays} /></button>,
              objectif: l.objectif,
              segments: [
                { nom: t("decisionPays.recrutement.actifs"), valeur: l.actifs, classe: "bg-foreground/80" },
                { nom: t("decisionPays.recrutement.cohorte"), valeur: l.info.cohorte_en_cours, classe: "bg-sky-600" },
                { nom: t("decisionPays.recrutement.suivante"), valeur: l.info.cohorte_suivante, classe: "bg-sky-300" },
                { nom: t("decisionPays.recrutement.offres"), valeur: l.offres, classe: "bg-amber-400" },
              ],
              fin: <span className={cn("font-semibold", l.manque > 0 ? "text-emerald-600" : l.manque < 0 ? "text-amber-600" : "text-muted-foreground")}>{l.manque > 0 ? `+${l.manque}` : l.manque}</span>,
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
          <CardTitle className="text-sm">{t("decisionPays.recrutement.parHm")}</CardTitle>
          <Button size="sm" onClick={preparer}>{t("decisionPays.cibles.bouton")}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {texte !== null && (
            <div className="space-y-2" data-testid="cibles-hm">
              <p className="text-xs text-muted-foreground">{t("decisionPays.cibles.aide")}</p>
              <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{texte}</pre>
              <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(texte)}>{t("decisionPays.cibles.copier")}</Button>
            </div>
          )}
          <table className="w-full table-fixed text-sm">
            <colgroup><col className="w-[22%]" /><col className="w-[30%]" /><col className="w-[14%]" /><col className="w-[17%]" /><col className="w-[17%]" /></colgroup>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">HM</th>
                <th className="px-2 py-2 font-medium">{t("decisionPays.col.pays")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("decisionPays.col.manque")} <InfoBulle texte={t("decisionPays.aide.manque")} /></th>
                <th className="px-2 py-2 text-right font-medium">{t("decisionPays.col.offres")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("decisionPays.col.annonce")} <InfoBulle texte={t("decisionPays.aide.annonce")} /></th>
              </tr>
            </thead>
            <tbody>
              {hm.map((h) => (
                <tr key={`${h.hm}-${h.pays}`} className="border-t">
                  <td className="truncate px-2 py-1.5">{h.hm}</td>
                  <td className="px-2 py-1.5"><Pays code={h.pays} /></td>
                  <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", h.manque > 0 && "text-emerald-600")}>{h.manque > 0 ? `+${h.manque}` : "0"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{h.offres}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Badge variant={h.annonce ? "success" : h.manque > 0 ? "destructive" : "secondary"}>{t(h.annonce ? "decisionPays.oui" : "decisionPays.non")}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ tab, lignes, pays, setPays }: { tab: TableauPays; lignes: LignePays[]; pays: string; setPays: (p: string) => void }) {
  const { t } = useTranslation();
  const f = useFormats();
  const qc = useQueryClient();
  const l = lignes.find((x) => x.pays === pays) ?? null;
  const detail = useQuery({ queryKey: ["decision-pays", "detail", pays], queryFn: () => lireDetailPays(pays), enabled: Boolean(pays) });
  const [objectif, setObjectif] = React.useState("");
  React.useEffect(() => setObjectif(l?.objectif_manuel ? String(l.objectif) : ""), [l?.pays, l?.objectif, l?.objectif_manuel]);
  const enregistrer = useMutation({
    mutationFn: () => fixerObjectifPays(pays, objectif.trim() === "" ? null : Math.max(0, Math.round(Number(objectif))), l?.info.note ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decision-pays"] }),
  });
  const serie = seriePays(tab, pays, 8);
  const seuil = Number(tab.reglages.seuil_vues_semaine ?? 1000);
  const tries = [...lignes].sort((a, b) => nomPays(a.pays, f.langue).localeCompare(nomPays(b.pays, f.langue)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={pays} onChange={(e) => setPays(e.target.value)} aria-label={t("decisionPays.col.pays")}>
          {tries.map((x) => <option key={x.pays} value={x.pays}>{drapeau(x.pays)} {nomPays(x.pays, f.langue)}</option>)}
        </select>
        {l && <Decision l={l} />}
        {l && <span className="text-xs text-muted-foreground">{l.raison}</span>}
      </div>
      {l && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Carte titre={t("decisionPays.kpi.proceeds")} aide={t("decisionPays.aide.proceeds")} valeur={f.eur(l.proceeds)} />
          <Carte titre={t("decisionPays.kpi.rpm")} aide={t("decisionPays.aide.rpm")} valeur={f.nb(l.rpm, 2)} />
          <Carte titre={t("decisionPays.kpi.roi")} aide={t("decisionPays.aide.roiPays", { sans: f.eur(l.sans_posteurs) })} valeur={l.roi === null ? "—" : `${f.nb(l.roi, 1)}×`} />
          <Carte titre={t("decisionPays.kpi.posteurs")} aide={t("decisionPays.aide.posteurs")} valeur={`${l.actifs} → ${l.objectif}`} />
          <Carte titre={t("decisionPays.kpi.cout1000")} aide={t("decisionPays.aide.cout1000")} valeur={f.eur2(l.cout_1000_vues)} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">{t("decisionPays.graph.proceedsVues")}</CardTitle></CardHeader>
          <CardContent>
            <BarresEtCourbe
              points={serie.map((s) => ({ label: f.jour(s.semaine), barre: s.proceeds, courbe: s.vues }))}
              legendes={[t("decisionPays.graph.legProceeds"), t("decisionPays.kpi.vues")]}
              formatBarres={f.eur}
              formatCourbe={(n) => f.court(n)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1 text-sm">{t("decisionPays.graph.rpm")} <InfoBulle texte={t("decisionPays.aide.rpm")} /></CardTitle></CardHeader>
          <CardContent>
            <Courbe points={serie.map((s) => ({ label: f.jour(s.semaine), v: s.rpm }))} format={(n) => f.nb(n, 2)} classe="stroke-emerald-600" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="flex items-center gap-1 text-sm">{t("decisionPays.detail.comptes", { n: detail.data?.comptes.length ?? 0 })} <InfoBulle texte={t("decisionPays.aide.statut", { seuil: f.nb(seuil) })} /></CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full table-fixed text-sm" data-testid="comptes-pays">
              <colgroup><col className="w-[38%]" /><col className="w-[22%]" /><col className="w-[20%]" /><col className="w-[20%]" /></colgroup>
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">{t("decisionPays.detail.compte")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("decisionPays.detail.vues7j")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("decisionPays.detail.mediane")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("decisionPays.detail.statut")}</th>
                </tr>
              </thead>
              <tbody>
                {(detail.data?.comptes ?? []).map((c) => {
                  const s = statutCompte(c.vues_7j, seuil);
                  return (
                    <tr key={c.compte_id} className={cn("border-t", !c.actif && "text-muted-foreground")}>
                      <td className="truncate px-2 py-1.5" title={c.poster ?? ""}>@{c.handle ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{f.nb(c.vues_7j)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{f.nb(c.mediane_post)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Badge variant={s === "bon" ? "success" : s === "moyen" ? "warning" : "destructive"}>{t(`decisionPays.statut.${s}`)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">{t("decisionPays.detail.topPosts")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full table-fixed text-sm" data-testid="top-posts">
              <colgroup><col className="w-[34%]" /><col className="w-[20%]" /><col className="w-[26%]" /><col className="w-[20%]" /></colgroup>
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">{t("decisionPays.detail.post")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("decisionPays.kpi.vues")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("decisionPays.detail.jalons")} <InfoBulle texte={t("decisionPays.aide.jalons")} /></th>
                  <th className="px-2 py-2 text-right font-medium">{t("decisionPays.detail.app")}</th>
                </tr>
              </thead>
              <tbody>
                {(detail.data?.top_posts ?? []).map((p) => (
                  <tr key={p.passage_id} className="border-t">
                    <td className="px-2 py-1.5">
                      <a href={p.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">@{p.handle ?? "—"}</a>
                      <span className="block text-xs text-muted-foreground">{f.jour(p.date)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{f.court(p.vues)}</td>
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{[p.j1, p.j3, p.j7].map((v) => (v === null ? "—" : f.court(v))).join(" / ")}</td>
                    <td className="px-2 py-1.5 text-right">{p.app}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
      {l && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">{t("decisionPays.detail.objectif", { suggere: l.objectif_suggere })}</span>
            <input type="number" min={0} className="h-9 w-28 rounded-md border bg-background px-2" value={objectif} placeholder={String(l.objectif_suggere)} onChange={(e) => setObjectif(e.target.value)} />
          </label>
          <Button type="submit" size="sm" disabled={enregistrer.isPending}>{t("decisionPays.detail.enregistrer")}</Button>
          {enregistrer.isError && <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span>}
        </form>
      )}
    </div>
  );
}

/**
 * Page « Pays » (refonte du 2/11) : 4 onglets (vue d'ensemble, classement,
 * recrutement, détail), un pays par ligne, tout en EUR, 6 colonnes au plus.
 * Lecture seule, sauf l'objectif réglé à la main ; « Préparer les objectifs
 * pour les HMs » prépare un texte, n'envoie rien.
 */
export function PageDecisionPays() {
  const { t } = useTranslation();
  const f = useFormats();
  const lu = useQuery({ queryKey: ["decision-pays", "tableau"], queryFn: lireTableauPays });
  const meta = useQuery({ queryKey: ["decision-pays", "meta"], queryFn: lireMetaPays });
  const [onglet, setOnglet] = React.useState<Onglet>("apercu");
  const [pays, setPays] = React.useState<string | null>(null);

  if (lu.isLoading) return <p className="text-sm text-muted-foreground">{t("decisionPays.chargement")}</p>;
  if (lu.error || !lu.data) return <p className="text-sm text-destructive">{(lu.error as Error | undefined)?.message ?? "—"}</p>;

  const tab = lu.data;
  const lignes = lignesPays(tab, "28j");
  const avant = lignesPays(tab, "28j", 4);
  const choisi = pays ?? [...lignes].sort((a, b) => b.proceeds - a.proceeds)[0]?.pays ?? "";
  const ouvrir = (p: string) => {
    setPays(p);
    setOnglet("detail");
  };

  return (
    <div className="min-w-0 space-y-4" data-testid="page-decision-pays">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("decisionPays.titre")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("decisionPays.releve", { vues: f.quand(meta.data?.releve_posts ?? null), rc: f.quand(tab.lecture?.at ?? null) })}
          </p>
        </div>
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="tablist">
          {ONGLETS.map((o) => (
            <button key={o} type="button" role="tab" aria-selected={onglet === o} onClick={() => setOnglet(o)}
              className={cn("rounded px-3 py-1.5", onglet === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t(`decisionPays.onglet.${o}`)}
            </button>
          ))}
        </div>
      </div>
      {onglet === "apercu" && <Apercu tab={tab} lignes={lignes} avant={avant} ouvrir={ouvrir} />}
      {onglet === "pays" && <Classement lignes={lignes} ouvrir={ouvrir} />}
      {onglet === "recrutement" && <Recrutement tab={tab} lignes={lignes} meta={meta.data} ouvrir={ouvrir} />}
      {onglet === "detail" && choisi && <Detail tab={tab} lignes={lignes} pays={choisi} setPays={setPays} />}
    </div>
  );
}
