import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { aujourdhuiParis, semaineIso } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { genererPaie } from "./api";
import { ListePaie } from "./liste/ListePaie";
import { semaineAPayer } from "./logique";
import { ListeAFinancer } from "./api-upwork/ListeAFinancer";
import { ReglagesPaiementApi } from "./api-upwork/ReglagesPaiementApi";
import { ReglagesPaie } from "./ReglagesPaie";
import { ZonesPaie } from "@/features/reglagesOs/ZonesPaie";
import { cn } from "@/lib/utils";

const ONGLETS_PAIE = ["liste", "reglages", "zones"] as const;

/**
 * La paie du lundi (0361, v3 0380), pour l'admin et le Head of Ops (Lucia) :
 * la liste pour la semaine qui vient de finir, par équipe, le bloc Comment
 * Masters le lundi bonus, et les réglages. Recalculer : admin seulement.
 * Montée dans Admin → Paie et dans Paiements (vue HM du Head of Ops).
 */
export function PagePaie({ apres }: { apres?: React.ReactNode }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [semaine, setSemaine] = React.useState(() => semaineAPayer(aujourdhuiParis()));
  const recalculer = useMutation({
    mutationFn: () => genererPaie(semaine),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paie"] }),
  });
  const fin = ajouterJours(semaine, 6);
  const [simulation, setSimulation] = React.useState(false);
  // Partie E : un onglet « Zones » (tarif par zone, pays → zone). Prompt 22,
  // partie 8 : un onglet « Réglages » (paie et bonus, paie par l'API : mode,
  // contrats de test, plafonds). La liste reste le premier onglet.
  const [onglet, setOnglet] = React.useState<(typeof ONGLETS_PAIE)[number]>("liste");

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-md border p-0.5 text-sm" role="tablist">
        {ONGLETS_PAIE.map((o) => (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={onglet === o}
            className={cn("rounded px-3 py-1", onglet === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            onClick={() => setOnglet(o)}
          >
            {t(`paie.onglets.${o}`)}
          </button>
        ))}
      </div>
      {onglet === "zones" ? (
        <ZonesPaie />
      ) : onglet === "reglages" ? (
        <div className="space-y-4">
          <ReglagesPaiementApi ouvert />
          <ReglagesPaie ouvert />
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {t("paie.liste.titre", { numero: semaineIso(semaine), debut: semaine, fin })}
            </h1>
            <p className="text-sm text-muted-foreground">{t("paie.liste.sous")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="ghost" aria-label={t("paie.semainePrecedente")} onClick={() => setSemaine((s) => ajouterJours(s, -7))}>
              <ChevronLeft />
            </Button>
            <span className="text-sm font-medium">{t("paie.semaine", { numero: semaineIso(semaine), debut: semaine, fin })}</span>
            <Button size="icon" variant="ghost" aria-label={t("paie.semaineSuivante")} onClick={() => setSemaine((s) => ajouterJours(s, 7))}>
              <ChevronRight />
            </Button>
            {role === "admin" && (
              <Button variant="outline" size="sm" disabled={recalculer.isPending} onClick={() => recalculer.mutate()}>
                <RefreshCw />
                {t("paie.recalculer")}
              </Button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={simulation}
                onChange={(e) => setSimulation(e.target.checked)}
              />
              {t("paie.liste.simuler")}
            </label>
            {recalculer.data !== undefined && (
              <span className="text-xs text-muted-foreground">{t("paie.recalcule", { n: recalculer.data })}</span>
            )}
            {recalculer.error && <span className="text-xs text-destructive">{(recalculer.error as Error).message}</span>}
          </div>

          {!simulation && <ListeAFinancer />}

          <ListePaie semaine={semaine} simulation={simulation} />

          {apres}
        </>
      )}
    </div>
  );
}
