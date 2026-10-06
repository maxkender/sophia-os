import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { CarteCreerRecruteur } from "@/features/hiring/CarteCreerRecruteur";
import { CompteursPhases, ListeCreateursSuivi } from "@/features/hiring/SuiviCreateurs";
import {
  additionnerCompteurs,
  createursDuManager,
  hmsDuDm,
  resumeHm,
} from "@/features/hiring/suiviEquipe";
import { nomLangue } from "@/features/moteur/langues";
import {
  listerLanguesReference,
  listerPosters,
  majLanguesRecruteur,
} from "@/features/moteur/api";
import type { PosterProfil } from "@/features/moteur/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function nomAffiche(p: PosterProfil): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || p.id.slice(0, 8);
}

function LanguesHm({ recruteur }: { recruteur: PosterProfil }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const langues = useQuery({ queryKey: ["langues-reference"], queryFn: listerLanguesReference });
  const maj = useMutation({
    mutationFn: (l: string[]) => majLanguesRecruteur(recruteur.id, l),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posters"] }),
  });
  const actives = recruteur.langues ?? [];
  const resume = actives.length > 0 ? actives.map(nomLangue).join(", ") : t("posters.aucuneLangue");

  return (
    <select
      className={selectClass}
      value=""
      disabled={maj.isPending}
      title={resume}
      onChange={(e) => {
        const l = e.target.value;
        if (!l) return;
        const s = new Set(actives);
        if (s.has(l)) s.delete(l);
        else s.add(l);
        maj.mutate([...s]);
      }}
    >
      <option value="">{resume}</option>
      {(langues.data ?? []).map((l) => (
        <option key={l} value={l}>
          {actives.includes(l) ? `✓ ${nomLangue(l)}` : nomLangue(l)}
        </option>
      ))}
    </select>
  );
}

/** Directing manager : créer et paramétrer des hiring managers. */
export function HiringRecruteursPage() {
  const { t } = useTranslation();
  const { role, user } = useAuth();

  const posters = useQuery({ queryKey: ["posters"], queryFn: listerPosters });

  if (role !== "directing_manager") {
    return <Navigate to="/embauche" replace />;
  }

  const tous = posters.data ?? [];
  const hms = user?.id ? hmsDuDm(tous, user.id) : [];
  const resumes = hms.map((hm) => resumeHm(hm, tous));
  const totaux = additionnerCompteurs(resumes.map((r) => r.compteurs));

  return (
    <div className="space-y-6">
      <CarteCreerRecruteur prefixeId="dmHm" />

      <Card>
        <CardHeader>
          <CardTitle>{t("hiring.mesHm")}</CardTitle>
          <CardDescription>{t("hiring.mesHmDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {posters.isPending && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!posters.isPending && hms.length === 0 && <EmptyState title={t("hiring.aucunHm")} />}
          {!posters.isPending && hms.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("hiring.equipeTotaux", { hms: hms.length })} · <CompteursPhases compteurs={totaux} />
            </p>
          )}
          {resumes.map(({ hm, compteurs }) => (
            <div key={hm.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{nomAffiche(hm)}</span>
                <Badge variant="outline">HM</Badge>
                <span className="text-xs text-muted-foreground">{hm.email}</span>
              </div>
              <LanguesHm recruteur={hm} />
              <CompteursPhases compteurs={compteurs} />
              <ListeCreateursSuivi createurs={createursDuManager(tous, hm.id)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
