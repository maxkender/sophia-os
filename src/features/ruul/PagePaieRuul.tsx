/**
 * 18/11 (Max) : la page « Paie Ruul ». Le lot d'une semaine (statut chez Ruul, total, posteurs, virement à faire),
 * chaque posteur rangé en dans le lot / payé / pas prêt / exclu avec la raison, et l'historique des lots.
 * Lecture seule : le lot se prépare, se valide et se crée dans Paie (rien ne part d'ici).
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, CircleDollarSign, Clock3, Landmark, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { MICRO_LABEL } from "@/components/ui/micro-label";
import { Segments } from "@/components/ui/segments";
import { drapeauPays } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";

import {
  AIDE_CATEGORIE, CATEGORIES, type CategoriePaie, compter, dollars, etapesLot, grouperParRaison, LIBELLE_CATEGORIE,
  libelleOnboarding, libelleSemaine, libelleStatutRuul, type LignePaieRuul, lirePagePaieRuul, type LotHistorique, montantLigne,
} from "./paieRuulPage";
import { RappelsReportes } from "./RappelsReportes";

const TON_CATEGORIE: Record<CategoriePaie, { pastille: string; texte: string; fond: string }> = {
  dans_lot: { pastille: "bg-sky-500", texte: "text-sky-700 dark:text-sky-300", fond: "bg-sky-50 dark:bg-sky-950/30" },
  paye: { pastille: "bg-emerald-500", texte: "text-emerald-700 dark:text-emerald-300", fond: "bg-emerald-50 dark:bg-emerald-950/30" },
  pas_pret: { pastille: "bg-amber-500", texte: "text-amber-700 dark:text-amber-300", fond: "bg-amber-50 dark:bg-amber-950/30" },
  exclu: { pastille: "bg-zinc-400", texte: "text-zinc-600 dark:text-zinc-300", fond: "bg-zinc-50 dark:bg-zinc-900/40" },
};

const TON_STATUT = {
  attente: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  alerte: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  neutre: "border-border bg-muted/50 text-muted-foreground",
} as const;

const dateHeure = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : null;

export function PagePaieRuul() {
  const [semaine, setSemaine] = React.useState<string | null>(null);
  const q = useQuery({ queryKey: ["ruul", "paie-page", semaine], queryFn: () => lirePagePaieRuul(semaine) });
  const d = q.data;
  const comptes = React.useMemo(() => compter(d?.lignes ?? []), [d]);
  const [categorie, setCategorie] = React.useState<CategoriePaie | null>(null);
  // Par défaut : la première catégorie non vide (dans le lot, puis payés, pas prêts, exclus).
  const active = categorie ?? CATEGORIES.find((c) => comptes[c].nb > 0) ?? "dans_lot";

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!d?.semaine) return <p className="text-sm text-muted-foreground">Aucun lot Ruul pour l'instant.</p>;

  const lignes = d.lignes.filter((l) => l.categorie === active);
  return (
    <div className="space-y-6" data-testid="page-paie-ruul">
      <ChoixSemaine historique={d.historique} semaine={d.semaine} onChange={(s) => { setSemaine(s); setCategorie(null); }} />
      <CarteLot data={d} comptes={comptes} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Segments
            libelle="Posteurs affichés"
            actif={active}
            onChange={setCategorie}
            options={CATEGORIES.map((c) => ({
              cle: c,
              contenu: (
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", TON_CATEGORIE[c].pastille)} aria-hidden />
                  {LIBELLE_CATEGORIE[c]} · {comptes[c].nb}
                </span>
              ),
            }))}
          />
          <p className="text-xs text-muted-foreground">{AIDE_CATEGORIE[active]}</p>
        </div>
        {lignes.length === 0 ? (
          <Card className="px-5 py-8 text-center text-sm text-muted-foreground">Personne dans « {LIBELLE_CATEGORIE[active]} » pour cette semaine.</Card>
        ) : active === "exclu" || active === "pas_pret" ? (
          <ParRaison lignes={lignes} categorie={active} semaine={d.semaine} />
        ) : (
          <TableLignes lignes={lignes} semaine={d.semaine} />
        )}
      </section>

      <RappelsReportes semaine={d.semaine} />

      <Historique historique={d.historique} semaine={d.semaine} onChoisir={(s) => { setSemaine(s); setCategorie(null); }} />
    </div>
  );
}

function ChoixSemaine({ historique, semaine, onChange }: { historique: LotHistorique[]; semaine: string; onChange: (s: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Semaine">
      <span className={MICRO_LABEL}>Semaine</span>
      {historique.slice(0, 8).map((h) => (
        <button
          key={h.semaine}
          type="button"
          aria-pressed={h.semaine === semaine}
          onClick={() => onChange(h.semaine)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            h.semaine === semaine ? "border-foreground bg-foreground font-medium text-background" : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {libelleSemaine(h.semaine)}
        </button>
      ))}
    </div>
  );
}

function CarteLot({ data, comptes }: { data: NonNullable<Awaited<ReturnType<typeof lirePagePaieRuul>>>; comptes: ReturnType<typeof compter> }) {
  const lot = data.lot;
  const statut = libelleStatutRuul(lot?.ruul_statut);
  const etapes = etapesLot(lot);
  return (
    <Card className="overflow-hidden" data-testid="carte-lot">
      <div className="flex flex-col gap-4 border-b bg-gradient-to-br from-muted/60 to-card px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <p className={MICRO_LABEL}>Lot de la semaine</p>
          <h2 className="text-xl font-semibold tracking-tight">{libelleSemaine(data.semaine!)}</h2>
          <p className="text-xs text-muted-foreground">
            {lot?.ruul_batch_id ? <>Paiement Ruul n° {lot.ruul_batch_id}{lot.ruul_env && lot.ruul_env !== "prod" ? ` (${lot.ruul_env})` : ""}</> : "Pas encore de paiement créé chez Ruul"}
            {lot?.lu_at ? <> · relu chez Ruul le {dateHeure(lot.lu_at)}</> : null}
          </p>
        </div>
        <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium", TON_STATUT[statut.ton])} data-testid="statut-ruul">
          {statut.ton === "ok" ? <Check className="size-4" /> : <Clock3 className="size-4" />}
          {statut.texte}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/70 lg:grid-cols-4">
        <Case icone={CircleDollarSign} label="Total du lot" valeur={dollars(lot?.total ?? comptes.dans_lot.total + comptes.paye.total)} detail="net versé aux posteurs" />
        <Case icone={Users} label="Posteurs dans le lot" valeur={String(lot?.nb ?? comptes.dans_lot.nb + comptes.paye.nb)} detail={`${comptes.paye.nb} confirmé${comptes.paye.nb > 1 ? "s" : ""} par Ruul`} />
        <Case
          icone={Landmark}
          label="Virement à faire"
          valeur={lot?.a_virer != null ? `${Number(lot.a_virer).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${lot.devise ?? ""}`.trim() : "—"}
          detail={lot?.reference ? `référence ${lot.reference}` : "frais Ruul compris"}
        />
        <Case
          icone={Clock3}
          label="En attente"
          valeur={String(comptes.pas_pret.nb)}
          detail={comptes.pas_pret.nb ? `${dollars(comptes.pas_pret.total)} gardés pour plus tard` : "personne"}
        />
      </div>

      <ol className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-0" aria-label="Étapes du lot">
        {etapes.map((e, i) => (
          <li key={e.cle} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                e.fait ? "border-emerald-500 bg-emerald-500 text-white" : "border-dashed text-muted-foreground",
              )}
            >
              {e.fait ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm", e.fait ? "font-medium" : "text-muted-foreground")}>{e.libelle}</p>
              <p className="text-[11px] text-muted-foreground">{dateHeure(e.le) ?? (e.fait ? "fait" : "à venir")}</p>
            </div>
            {i < etapes.length - 1 && <span className={cn("mx-3 hidden h-px flex-1 sm:block", e.fait ? "bg-emerald-400" : "bg-border")} aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
        <span>Lecture seule : rien ne part d'ici. Ruul ne paie que les posteurs prêts (READY).</span>
        <Link to="/admin/auto/payroll" className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground hover:underline">
          Préparer / créer le lot dans Paie <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  );
}

function Case({ icone: Icone, label, valeur, detail }: { icone: typeof Users; label: string; valeur: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-5 py-4">
      <p className={cn(MICRO_LABEL, "flex items-center gap-1.5")}><Icone className="size-3.5" aria-hidden /> {label}</p>
      <p className="text-2xl font-semibold leading-tight tabular-nums">{valeur}</p>
      <p className="truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Posteur({ l, semaine }: { l: LignePaieRuul; semaine: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        <span className="mr-1.5" aria-hidden>{drapeauPays(l.pays)}</span>
        {l.nom}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {l.ruul_onboarding === "READY" ? "Prêt chez Ruul" : libelleOnboarding(l.ruul_onboarding)}
        {l.semaine !== semaine ? ` · semaine du ${libelleSemaine(l.semaine)}` : ""}
        {l.rattrapage ? " · rattrapage" : ""}
      </p>
    </div>
  );
}

function Montant({ l }: { l: LignePaieRuul }) {
  return (
    <div className="text-right">
      <p className="text-sm font-semibold tabular-nums">{dollars(montantLigne(l))}</p>
      {Number(l.bonus ?? 0) > 0 && <p className="text-[11px] text-muted-foreground">dont bonus {dollars(l.bonus)}</p>}
    </div>
  );
}

function TableLignes({ lignes, semaine }: { lignes: LignePaieRuul[]; semaine: string }) {
  return (
    <Card className="divide-y overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_110px_160px_100px] gap-4 bg-muted/40 px-5 py-2 sm:grid">
        <span className={MICRO_LABEL}>Posteur</span>
        <span className={MICRO_LABEL}>Posts</span>
        <span className={MICRO_LABEL}>Chez Ruul</span>
        <span className={cn(MICRO_LABEL, "text-right")}>Montant</span>
      </div>
      {lignes.map((l) => {
        const s = libelleStatutRuul(l.ruul_statut);
        return (
          <div key={`${l.poster_id}-${l.semaine}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_110px_160px_100px]">
            <Posteur l={l} semaine={semaine} />
            <p className="order-3 text-xs text-muted-foreground sm:order-none tabular-nums">
              {l.faits ?? 0}/{l.prevus ?? 0} posts{l.nb_comptes && l.nb_comptes > 1 ? ` · ${l.nb_comptes} comptes` : ""}
            </p>
            <p className="order-4 sm:order-none">
              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", TON_STATUT[s.ton])}>{s.texte}</span>
              {l.ruul_echec && <span className="mt-0.5 block text-[11px] text-destructive">{l.ruul_echec}</span>}
            </p>
            <Montant l={l} />
          </div>
        );
      })}
    </Card>
  );
}

function ParRaison({ lignes, categorie, semaine }: { lignes: LignePaieRuul[]; categorie: CategoriePaie; semaine: string }) {
  const groupes = grouperParRaison(lignes);
  const [ouverts, setOuverts] = React.useState<Set<string>>(() => new Set(groupes.length === 1 ? [groupes[0]!.raison] : []));
  const ton = TON_CATEGORIE[categorie];
  return (
    <div className="space-y-2">
      {groupes.map((g) => {
        const ouvert = ouverts.has(g.raison);
        return (
          <Card key={g.raison} className="overflow-hidden">
            <button
              type="button"
              aria-expanded={ouvert}
              onClick={() => setOuverts((o) => { const n = new Set(o); if (n.has(g.raison)) n.delete(g.raison); else n.add(g.raison); return n; })}
              className={cn("flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40", ouvert && ton.fond)}
            >
              <span className={cn("flex min-w-9 items-center justify-center rounded-md px-2 py-1 text-sm font-semibold tabular-nums", ton.fond, ton.texte)}>{g.lignes.length}</span>
              <span className="min-w-0 flex-1 text-sm">{g.raison}</span>
              {categorie === "pas_pret" && <span className="text-sm font-medium tabular-nums">{dollars(g.total)}</span>}
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouvert && "rotate-180")} aria-hidden />
            </button>
            {ouvert && (
              <div className="grid gap-x-6 gap-y-2 border-t px-5 py-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.lignes.map((l) => (
                  <div key={`${l.poster_id}-${l.semaine}`} className="flex items-center justify-between gap-3">
                    <Posteur l={l} semaine={semaine} />
                    {categorie === "pas_pret" && <Montant l={l} />}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Historique({ historique, semaine, onChoisir }: { historique: LotHistorique[]; semaine: string; onChoisir: (s: string) => void }) {
  return (
    <section className="space-y-3" data-testid="historique-lots">
      <h2 className="text-base font-semibold">Historique des lots</h2>
      <Card className="divide-y overflow-hidden">
        <div className="hidden grid-cols-[150px_minmax(0,1fr)_90px_90px_90px_90px] gap-4 bg-muted/40 px-5 py-2 md:grid">
          <span className={MICRO_LABEL}>Semaine</span>
          <span className={MICRO_LABEL}>Statut chez Ruul</span>
          <span className={cn(MICRO_LABEL, "text-right")}>Total</span>
          <span className={cn(MICRO_LABEL, "text-right")}>Dans le lot</span>
          <span className={cn(MICRO_LABEL, "text-right")}>Payés</span>
          <span className={cn(MICRO_LABEL, "text-right")}>Exclus</span>
        </div>
        {historique.map((h) => {
          const s = libelleStatutRuul(h.ruul_statut);
          return (
            <button
              key={h.semaine}
              type="button"
              onClick={() => onChoisir(h.semaine)}
              aria-current={h.semaine === semaine}
              className={cn(
                "grid w-full grid-cols-2 items-center gap-x-4 gap-y-1 px-5 py-3 text-left text-sm transition-colors hover:bg-muted/40 md:grid-cols-[150px_minmax(0,1fr)_90px_90px_90px_90px]",
                h.semaine === semaine && "bg-muted/50",
              )}
            >
              <span className="font-medium">{libelleSemaine(h.semaine)}</span>
              <span>
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", TON_STATUT[h.statut ? s.ton : "neutre"])}>
                  {h.statut ? s.texte : "Pas de lot"}
                </span>
              </span>
              <span className="tabular-nums md:text-right">{h.total != null ? dollars(h.total) : "—"}</span>
              <span className="tabular-nums text-muted-foreground md:text-right">{h.nb ?? 0} posteur{(h.nb ?? 0) > 1 ? "s" : ""}</span>
              <span className="tabular-nums text-muted-foreground md:text-right">{h.payes}</span>
              <span className="tabular-nums text-muted-foreground md:text-right">{h.exclus}</span>
            </button>
          );
        })}
      </Card>
    </section>
  );
}
