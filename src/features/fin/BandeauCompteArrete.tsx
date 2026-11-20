/**
 * 18/11 (Max) : posteur à 2 comptes dont un a été killé : en haut du dashboard, dans sa langue, quel compte, quand,
 * pourquoi, qu'il continue sur l'autre, et sa paie (tarif 1 compte) à partir de la semaine suivante.
 * 19/11 : même bandeau, en vert, quand Max valide un 2e compte le jeudi (quel compte, quel label, quand il démarre,
 * ce qu'il gagne en plus). Reste jusqu'à « Got it ». Réservé au vrai posteur (l'admin qui traverse l'espace ne voit rien).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";

import { type BandeauCompte, lireMesBandeaux, marquerBandeauVu } from "./api";

export function BandeauCompteArrete() {
  const { roleReel } = useAuth();
  if (roleReel !== "poster") return null;
  return <Bandeaux />;
}

function Bandeaux() {
  const q = useQuery({ queryKey: ["mes-bandeaux-compte"], queryFn: lireMesBandeaux, staleTime: 5 * 60_000 });
  // 21/11 (Max) : la relance Ruul ne se ferme plus sur « Got it » : le bloc « Get paid » (impossible à fermer) la remplace.
  const bandeaux = (q.data ?? []).filter((b) => !b.cle.startsWith("relance_ruul:"));
  if (!bandeaux.length) return null;
  return <div className="space-y-2">{bandeaux.map((b) => <Bandeau key={b.cle} b={b} />)}</div>;
}

export function Bandeau({ b }: { b: BandeauCompte }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const vu = useMutation({
    mutationFn: () => marquerBandeauVu(b.cle),
    onSuccess: () => qc.setQueryData<BandeauCompte[]>(["mes-bandeaux-compte"], (l) => (l ?? []).filter((x) => x.cle !== b.cle)),
  });
  const double = b.cle.startsWith("compte_double:");
  // 19/11 : le nudge du jeudi d'un posteur Ruul (orange), et la relance Ruul quand l'email n'arrive pas (orange aussi).
  const relance = b.cle.startsWith("relance_ruul:");
  const nudge = b.cle.startsWith("nudge_jeudi:") || relance;
  const Icone = double ? Sparkles : Info;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
        double
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
          : nudge
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            : "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
      )}
      data-testid={double ? "bandeau-compte-double" : relance ? "bandeau-relance-ruul" : nudge ? "bandeau-nudge" : "bandeau-compte-arrete"}
    >
      <Icone className={cn("hidden size-5 shrink-0 sm:block", double ? "text-emerald-600 dark:text-emerald-300" : nudge ? "text-amber-600 dark:text-amber-300" : "text-sky-600 dark:text-sky-300")} aria-hidden />
      <p className="flex-1 text-sm leading-relaxed">{b.texte}</p>
      <Button size="sm" className="shrink-0 self-end sm:self-center" onClick={() => vu.mutate()} disabled={vu.isPending}>
        {t("auth.bandeauCompris")}
      </Button>
    </div>
  );
}
