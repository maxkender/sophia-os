import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { lireReposts, marquerReposts } from "./exigences";

/** Page de warm-up du posteur : « J'ai fait 2 reposts » (0365). */
export function CaseReposts({ compteId }: { compteId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cle = ["ckd", "reposts", compteId];
  const lu = useQuery({ queryKey: cle, queryFn: () => lireReposts([compteId]) });
  const coche = Boolean(lu.data?.get(compteId));
  const basculer = useMutation({
    mutationFn: (fait: boolean) => marquerReposts(compteId, fait),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ckd", "reposts"] }),
  });
  if (lu.error) return null;
  return (
    <label className="flex items-start gap-2 text-sm" data-testid="case-reposts">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-primary"
        checked={coche}
        disabled={lu.isLoading || basculer.isPending}
        onChange={(e) => basculer.mutate(e.target.checked)}
      />
      <span>
        <span className="font-medium">{t("ckd.exigences.caseReposts")}</span>
        <span className="block text-xs text-muted-foreground">{t("ckd.exigences.caseRepostsAide")}</span>
        {basculer.error && <span className="block text-xs text-destructive">{(basculer.error as Error).message}</span>}
      </span>
    </label>
  );
}
