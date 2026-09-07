import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CarteHmPhase0, CarteHmPhase1, CarteHmPhase2 } from "@/features/recrutements/CarteHm";
import { InboxSuggestions } from "@/features/recrutements/InboxSuggestions";
import {
  createursAvecPremierPost,
  createursDuHmPays,
  createursSansPremierPost,
  hmConcernePays,
  phasesHmPourPays,
} from "@/features/recrutements/phases";
import { useRecrutements } from "@/features/recrutements/useRecrutements";
import { drapeauLangue, estPaysOs, nomPays } from "@/features/moteur/langues";
import { cn } from "@/lib/utils";
import type { RecrutementHm } from "@/features/recrutements/types";

function EnTeteSection({
  n,
  titre,
  accent,
}: {
  n: number;
  titre: string;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("size-2 rounded-full", accent)} />
      <h2 className="text-sm font-medium">{titre}</h2>
      <Badge variant="secondary" className="tabular-nums">
        {n}
      </Badge>
    </div>
  );
}

function VidePhase({ texte }: { texte: string }) {
  return (
    <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
      {texte}
    </p>
  );
}

export function AdminRecrutementsPaysPage() {
  const { pays: brut } = useParams();
  const pays = (brut ?? "").toLowerCase();
  const { t } = useTranslation();
  const { hms, createurs, suggestions, stats, fiches, statsPending, isPending, error } =
    useRecrutements();

  if (!estPaysOs(pays)) return <Navigate to="/admin/recrutements" replace />;

  const hmsPays = hms.filter((h) => hmConcernePays(h, pays));
  const phase0 = hmsPays.filter((h) =>
    phasesHmPourPays(h, createursDuHmPays(createurs, h.id, pays), pays).includes(0),
  );
  const phase1 = hmsPays.filter((h) =>
    phasesHmPourPays(h, createursDuHmPays(createurs, h.id, pays), pays).includes(1),
  );
  const phase2 = hmsPays.filter((h) =>
    phasesHmPourPays(h, createursDuHmPays(createurs, h.id, pays), pays).includes(2),
  );
  const nCreateurs = createurs.filter((c) => c.pays === pays).length;

  const sugDuHm = (hm: RecrutementHm) => suggestions.filter((s) => s.hm_id === hm.id);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ms-2 text-muted-foreground" asChild>
          <Link to="/admin/recrutements">
            <ArrowLeft className="size-3.5" />
            {t("recrutements.retour")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl leading-none">{drapeauLangue(pays)}</span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{nomPays(pays)}</h1>
              <p className="text-sm tabular-nums text-muted-foreground">
                {t("recrutements.resumePays", { hms: hmsPays.length, createurs: nCreateurs })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="error">
          <AlertTitle>{t("recrutements.erreurCharge")}</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <InboxSuggestions suggestions={suggestions} hms={hms} paysFiltre={pays} />

      {isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t("common.loading")}
        </p>
      ) : (
        <>
          <section className="space-y-4">
            <EnTeteSection n={phase0.length} titre={t("recrutements.phaseTitre0")} accent="bg-rose-400" />
            {phase0.length === 0 ? (
              <VidePhase texte={t("recrutements.videPhase")} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {phase0.map((hm) => (
                  <CarteHmPhase0 key={hm.id} hm={hm} suggestions={sugDuHm(hm)} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <EnTeteSection n={phase1.length} titre={t("recrutements.phaseTitre1")} accent="bg-sky-400" />
            {phase1.length === 0 ? (
              <VidePhase texte={t("recrutements.videPhase")} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {phase1.map((hm) => {
                  const tous = createursDuHmPays(createurs, hm.id, pays);
                  return (
                    <CarteHmPhase1
                      key={hm.id}
                      hm={hm}
                      createurs={createursSansPremierPost(tous)}
                      nTotal={tous.length}
                      fiches={fiches}
                      suggestions={sugDuHm(hm)}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <EnTeteSection n={phase2.length} titre={t("recrutements.phaseTitre2")} accent="bg-emerald-400" />
            {phase2.length === 0 ? (
              <VidePhase texte={t("recrutements.videPhase")} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {phase2.map((hm) => {
                  const tous = createursDuHmPays(createurs, hm.id, pays);
                  return (
                    <CarteHmPhase2
                      key={hm.id}
                      hm={hm}
                      pays={pays}
                      createurs={createursAvecPremierPost(tous)}
                      nTotal={tous.length}
                      fiches={fiches}
                      stats={stats}
                      statsPending={statsPending}
                      suggestions={sugDuHm(hm)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
