import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

import { relierSlack } from "./api";

/**
 * Dans la fiche d'un posteur (prompt 15, point 1) : son compte Slack relié
 * (0381) et « Délier », après confirmation. Rien de relié : rien d'affiché.
 * Mêmes droits que relier (`slack_relier` : admin, Head of Ops, sa HM).
 */
export function BoutonDelierSlack({ posterId, nom }: { posterId: string; nom: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const slack = useQuery({
    queryKey: ["slack-relier", "posteur", posterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("slack_user_id").eq("id", posterId).maybeSingle();
      if (error) throw error;
      return (data?.slack_user_id as string | null | undefined) ?? null;
    },
  });
  const delier = useMutation({
    mutationFn: () => relierSlack(posterId, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["slack-relier"] }),
  });
  if (!slack.data) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="slack-relie">
      <span>{t("slackRelier.relieA", { slack: slack.data })}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-[11px]"
        disabled={delier.isPending}
        onClick={() => {
          if (window.confirm(t("slackRelier.confirmDelier", { nom, slack: slack.data }))) delier.mutate();
        }}
      >
        <Unlink className="size-3" />
        {t("slackRelier.delier")}
      </Button>
      {delier.error && <span className="text-destructive">{(delier.error as Error).message}</span>}
    </div>
  );
}
