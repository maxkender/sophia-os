import { supabase } from "@/lib/supabase/client";

/** Ce que les 5 étapes lisent du profil du posteur : son lundi de cohorte (0391), Slack relié. */
export interface MaPremiereSemaine {
  cohorteLundi: string | null;
  slackLie: boolean;
}

export async function lireMaPremiereSemaine(): Promise<MaPremiereSemaine> {
  const { data: auth } = await supabase.auth.getUser();
  const id = auth.user?.id;
  if (!id) return { cohorteLundi: null, slackLie: false };
  const { data, error } = await supabase.from("profiles").select("cohorte_lundi, slack_user_id").eq("id", id).maybeSingle();
  if (error) throw error;
  return {
    cohorteLundi: (data?.cohorte_lundi as string | null) ?? null,
    slackLie: Boolean(data?.slack_user_id),
  };
}
