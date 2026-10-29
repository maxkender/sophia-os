import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

const CLE = ["faq", "questions-epingle"] as const;

async function lire(): Promise<{ texte: string; epingle: { at?: string; epingle?: boolean } | null }> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur").in("cle", ["slack_questions_texte", "slack_questions_epingle"]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  return {
    texte: typeof v.slack_questions_texte === "string" ? v.slack_questions_texte : "",
    epingle: (v.slack_questions_epingle as { at?: string; epingle?: boolean } | undefined) ?? null,
  };
}

async function enregistrer(texte: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("reglages").upsert(
    { cle: "slack_questions_texte", valeur: texte, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() },
    { onConflict: "cle" },
  );
  if (error) throw error;
}

/**
 * Prompt 13 : le message épinglé de #questions (« Questions: post them in
 * #questions. Please don't DM the team. »), en anglais, modifiable. Il ne part
 * que sur le bouton, avec une confirmation.
 */
export function EpinglerQuestions() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: CLE, queryFn: lire });
  const [texte, setTexte] = React.useState("");
  React.useEffect(() => {
    if (lu.data) setTexte(lu.data.texte);
  }, [lu.data]);
  const sauver = useMutation({ mutationFn: () => enregistrer(texte.trim()), onSettled: () => qc.invalidateQueries({ queryKey: CLE }) });
  const epingler = useMutation({
    mutationFn: () => invoke<{ ok: boolean; error?: string }>("ckd", { action: "questions_epingler" }),
    onSettled: () => qc.invalidateQueries({ queryKey: CLE }),
  });
  const quand = lu.data?.epingle?.at ? new Date(lu.data.epingle.at).toLocaleString() : null;
  return (
    <div className="space-y-1.5 border-t pt-3" data-testid="epingler-questions">
      <p className="text-sm font-medium">{t("chatbot.questions.titre")}</p>
      <p className="text-xs text-muted-foreground">{t("chatbot.questions.aide")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-9 max-w-xl" value={texte} aria-label={t("chatbot.questions.titre")} onChange={(e) => setTexte(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!texte.trim() || texte.trim() === lu.data?.texte || sauver.isPending} onClick={() => sauver.mutate()}>
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          disabled={!lu.data?.texte || epingler.isPending}
          onClick={() => {
            if (window.confirm(t("chatbot.questions.confirm", { texte: lu.data?.texte ?? "" }))) epingler.mutate();
          }}
        >
          {t("chatbot.questions.epingler")}
        </Button>
      </div>
      {quand && <p className="text-xs text-muted-foreground">{t(lu.data?.epingle?.epingle ? "chatbot.questions.epingle" : "chatbot.questions.posteSeulement", { quand })}</p>}
      {epingler.data && !epingler.data.ok && <p className="text-xs text-destructive">{epingler.data.error}</p>}
      {(lu.error || sauver.error || epingler.error) && (
        <p className="text-xs text-destructive">{((lu.error ?? sauver.error ?? epingler.error) as Error).message}</p>
      )}
    </div>
  );
}
