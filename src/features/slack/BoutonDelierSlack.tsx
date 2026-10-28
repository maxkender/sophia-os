import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link2, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";

import { lireMembresLibres, relierSlack } from "./api";
import { filtrerMembres, libelleMembre, suggestions } from "./logique";

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
  if (slack.isPending) return null;
  if (!slack.data) return <RelierSlack posterId={posterId} nom={nom} />;
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

/**
 * Pas encore relié : le relier ici, dans la fiche (28 oct., partie E : « Slack
 * à relier » sort du menu). Les membres libres du workspace, ceux qui
 * ressemblent au nom d'abord ; confirmation avant d'écrire.
 */
function RelierSlack({ posterId, nom }: { posterId: string; nom: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [recherche, setRecherche] = React.useState("");
  const membres = useQuery({ queryKey: ["slack-relier", "membres"], queryFn: lireMembresLibres, enabled: ouvert });
  const relier = useMutation({
    mutationFn: (id: string) => relierSlack(posterId, id),
    onSuccess: () => {
      setOuvert(false);
      void qc.invalidateQueries({ queryKey: ["slack-relier"] });
    },
  });
  if (!ouvert) {
    return (
      <Button size="sm" variant="ghost" className="h-6 w-fit gap-1 px-1.5 text-[11px]" onClick={() => setOuvert(true)}>
        <Link2 className="size-3" />
        {t("slackRelier.relierIci")}
      </Button>
    );
  }
  const liste = recherche.trim() ? filtrerMembres(membres.data ?? [], recherche, 6) : suggestions(membres.data ?? [], nom, 6);
  return (
    <div className="space-y-1.5 text-xs" data-testid="relier-slack">
      <Input
        className="h-7 text-xs"
        placeholder={t("slackRelier.chercher")}
        aria-label={t("slackRelier.chercher")}
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
      />
      <ul className="space-y-0.5">
        {liste.map((m) => (
          <li key={m.slack_user_id}>
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              disabled={relier.isPending}
              onClick={() => {
                if (window.confirm(t("slackRelier.confirmRelier", { nom, slack: libelleMembre(m) }))) relier.mutate(m.slack_user_id);
              }}
            >
              {libelleMembre(m)}
            </button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={() => setOuvert(false)}>
        {t("common.cancel")}
      </Button>
      {relier.error && <p className="text-destructive">{(relier.error as Error).message}</p>}
    </div>
  );
}
