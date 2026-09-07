import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { CarteHmPhase0, CarteHmPhase1, CarteHmPhase2 } from "@/features/recrutements/CarteHm";
import { InboxSuggestions } from "@/features/recrutements/InboxSuggestions";
import { CIBLE_CREATEURS_PAYS } from "@/features/recrutements/constantes";
import { createursDuHmPays, hmConcernePays, phasesHmPourPays } from "@/features/recrutements/phases";
import { useRecrutements } from "@/features/recrutements/useRecrutements";
import { drapeauLangue, estPaysOs, nomPays } from "@/features/moteur/langues";

export function AdminRecrutementsPaysPage() {
  const { pays: brut } = useParams();
  const pays = (brut ?? "").toLowerCase();
  const { t } = useTranslation();
  const { hms, createurs, suggestions, stats, isPending, error } = useRecrutements();

  if (!estPaysOs(pays)) return <Navigate to="/admin/recrutements" replace />;

  const hmsPays = hms.filter((h) => hmConcernePays(h, pays));
  const phase0 = hmsPays.filter(
    (h) => phasesHmPourPays(h, createursDuHmPays(createurs, h.id, pays)).includes(0),
  );
  const phase1 = hmsPays.filter(
    (h) => phasesHmPourPays(h, createursDuHmPays(createurs, h.id, pays)).includes(1),
  );
  const phase2 = hmsPays.filter(
    (h) => phasesHmPourPays(h, createursDuHmPays(createurs, h.id, pays)).includes(2),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/admin/recrutements"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("recrutements.retour")}
        </Link>
        <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="text-4xl leading-none">{drapeauLangue(pays)}</span>
          {nomPays(pays)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("recrutements.ciblePays", { n: CIBLE_CREATEURS_PAYS })}
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {t("recrutements.erreurCharge")} {(error as Error).message}
        </p>
      )}

      <InboxSuggestions suggestions={suggestions} hms={hms} paysFiltre={pays} />

      {isPending ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-800/80">
              {t("recrutements.phase0")} · {phase0.length}
            </h2>
            {phase0.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("recrutements.videPhase")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {phase0.map((hm) => (
                  <CarteHmPhase0
                    key={hm.id}
                    hm={hm}
                    suggestions={suggestions.filter((s) => s.hm_id === hm.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-800/80">
              {t("recrutements.phase1")} · {phase1.length}
            </h2>
            {phase1.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("recrutements.videPhase")}</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {phase1.map((hm) => (
                  <CarteHmPhase1
                    key={hm.id}
                    hm={hm}
                    createurs={createursDuHmPays(createurs, hm.id, pays)}
                    suggestions={suggestions.filter((s) => s.hm_id === hm.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800/80">
              {t("recrutements.phase2")} · {phase2.length}
            </h2>
            {phase2.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("recrutements.videPhase")}</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {phase2.map((hm) => (
                  <CarteHmPhase2
                    key={hm.id}
                    hm={hm}
                    pays={pays}
                    createurs={createursDuHmPays(createurs, hm.id, pays)}
                    stats={stats}
                    suggestions={suggestions.filter((s) => s.hm_id === hm.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
