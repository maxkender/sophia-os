import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import { CarteUnique } from "./CarteUnique";
import { StatsBots } from "./FeedbackBot";
import { BlocBots } from "./BlocBots";
import { RituelsSemaine } from "./RituelsSemaine";
import { lireModeProblemes, lireProblemes, passerMaintenant, type OngletCarte, type Probleme } from "./api";
import { aDiagnosticOuAction } from "./logique";

const P = "problemes";
const ONGLETS: readonly OngletCarte[] = ["bots", "urgent", "samedi"];
const ICONE: Record<OngletCarte, string> = { bots: "🤖", urgent: "⚡", samedi: "📅" };

const quand = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(localeDate(), { dateStyle: "short", timeStyle: "short" }) : "—";

/** L'ordre dans un onglet : ceux qui attendent une réponse d'abord, puis les plus anciens. */
function trierCartes(liste: readonly Probleme[]): Probleme[] {
  return [...liste].sort((a, b) =>
    Number(Boolean(b.sans_reponse?.question)) - Number(Boolean(a.sans_reponse?.question))
    || Number(b.niveau === "urgent") - Number(a.niveau === "urgent")
    || a.created_at.localeCompare(b.created_at));
}

/**
 * 4/11 : la page Problèmes simplifiée, le SEUL endroit où Max décide. Une carte
 * par posteur (ou HM, ou offre), trois onglets : 🤖 Fait par les bots, ⚡
 * Urgent pour Max (argent, offres HM à refaire, bot pas sûr), 📅 Samedi
 * (Kill / Doubler / Garder / Recréer). Même format pour toutes les cartes.
 */
export function PageProblemesPosteurs() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [onglet, setOnglet] = React.useState<OngletCarte>("urgent");
  const [fermes, setFermes] = React.useState(false);
  const [params] = useSearchParams();
  const carte = params.get("carte");
  const [carteVue, setCarteVue] = React.useState<string | null>(null);
  const lu = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const listeFermes = useQuery({ queryKey: ["problemes", "fermes"], queryFn: () => lireProblemes("fermes"), enabled: fermes });
  const mode = useQuery({ queryKey: ["problemes", "mode"], queryFn: lireModeProblemes });
  const passer = useMutation({ mutationFn: passerMaintenant, onSuccess: () => qc.invalidateQueries({ queryKey: ["problemes"] }) });
  // À chaque ouverture : relire Upwork et recalculer avant d'afficher (au plus une fois toutes les 5 min).
  const resync = useQuery({
    queryKey: ["resync-problemes"],
    queryFn: async () => {
      const r = await passerMaintenant();
      await qc.invalidateQueries({ queryKey: ["problemes"] });
      return r;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const tous = React.useMemo(() => (lu.data ?? []).filter(aDiagnosticOuAction), [lu.data]);
  const ongletDe = (p: Probleme): OngletCarte => p.onglet ?? "bots";
  const compte = (o: OngletCarte) => tous.filter((p) => ongletDe(p) === o).length;
  const visibles = trierCartes(tous.filter((p) => ongletDe(p) === onglet));
  const modeActuel = mode.data ?? "test";

  // « ?carte=<id> » : le bon onglet, la carte surlignée.
  React.useEffect(() => {
    if (!carte || carteVue === carte) return;
    const c = tous.find((x) => x.id === carte);
    if (!c) return;
    setCarteVue(carte);
    setOnglet(ongletDe(c));
    window.setTimeout(() => document.getElementById(`probleme-${carte}`)?.scrollIntoView({ block: "center" }), 50);
  }, [carte, carteVue, tous]);

  return (
    <div className="space-y-4" data-testid="page-problemes">
      {modeActuel === "test" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="mode-test">
          {t(`${P}.modeTest`)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StatsBots />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant={fermes ? "default" : "outline"} onClick={() => setFermes(!fermes)}>{t(`${P}.fermes`)}</Button>
          <Button size="sm" variant="outline" onClick={() => passer.mutate()} disabled={passer.isPending}>{t(`${P}.relire`)}</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t(`${P}.onglets.aria`)}>
        {ONGLETS.map((o) => (
          <button key={o} type="button" role="tab" aria-selected={!fermes && onglet === o} data-testid={`onglet-${o}`}
            onClick={() => { setFermes(false); setOnglet(o); }}
            className={cn("rounded-md border px-3 py-1.5 text-sm font-medium",
              !fermes && onglet === o ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {ICONE[o]} {t(`${P}.onglets.${o}`)} <span className="tabular-nums">({compte(o)})</span>
          </button>
        ))}
      </div>
      {resync.isFetching && <p className="text-xs text-muted-foreground" data-testid="resync">{t(`${P}.resync`)}</p>}
      {lu.isLoading && <p className="text-sm text-muted-foreground">{t(`${P}.chargement`)}</p>}
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}

      {!fermes && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t(`${P}.onglets.aide.${onglet}`)}</p>
          {onglet === "bots" && <BlocBots />}
          {visibles.length === 0 && !lu.isLoading && <p className="text-sm text-muted-foreground">{t(`${P}.rien`)}</p>}
          {visibles.map((p) => <CarteUnique key={p.id} p={p} mode={modeActuel} surlignee={p.id === carte} />)}
          {onglet === "samedi" && <RituelsSemaine />}
        </div>
      )}

      {fermes && (
        <ul className="space-y-1 text-sm" data-testid="liste-fermes">
          {(listeFermes.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap gap-2 border-b py-1">
              <span className="font-medium">{p.nom ?? p.hm_nom ?? p.contrat_id ?? "—"}</span>
              <span className="text-muted-foreground">{t(`${P}.categories.${p.categorie}`, { defaultValue: p.categorie })}</span>
              <span>{p.resume}</span>
              <span className="text-muted-foreground">→ {p.ferme_raison ?? p.statut} · {quand(p.ferme_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
