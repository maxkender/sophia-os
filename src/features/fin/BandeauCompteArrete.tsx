/**
 * 18/11 (Max) : posteur à 2 comptes dont un a été killé : en haut du dashboard, dans sa langue, quel compte, quand,
 * pourquoi, qu'il continue sur l'autre, et sa paie à partir de la semaine suivante. Reste jusqu'à « Got it ».
 * Réservé au vrai posteur (l'admin qui traverse l'espace ne voit rien).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";

import { type BandeauCompte, lireMesBandeaux, marquerBandeauVu } from "./api";

export function BandeauCompteArrete() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Bandeaux />;
}

function Bandeaux() {
  const q = useQuery({ queryKey: ["mes-bandeaux-compte"], queryFn: lireMesBandeaux, staleTime: 5 * 60_000 });
  if (!q.data?.length) return null;
  return <div className="space-y-2">{q.data.map((b) => <Bandeau key={b.cle} b={b} />)}</div>;
}

export function Bandeau({ b }: { b: BandeauCompte }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const vu = useMutation({
    mutationFn: () => marquerBandeauVu(b.cle),
    onSuccess: () => qc.setQueryData<BandeauCompte[]>(["mes-bandeaux-compte"], (l) => (l ?? []).filter((x) => x.cle !== b.cle)),
  });
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950 sm:flex-row sm:items-center dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100"
      data-testid="bandeau-compte-arrete"
    >
      <Info className="hidden size-5 shrink-0 text-sky-600 sm:block dark:text-sky-300" aria-hidden />
      <p className="flex-1 text-sm leading-relaxed">{b.texte}</p>
      <Button size="sm" className="shrink-0 self-end sm:self-center" onClick={() => vu.mutate()} disabled={vu.isPending}>
        {t("auth.bandeauCompris")}
      </Button>
    </div>
  );
}
