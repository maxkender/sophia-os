/**
 * 21/11 (Max) : la page Pay sépare les deux circuits : « Ruul : X prêts / Y pas prêts » et « Upwork : X à payer / Y bloqués ».
 */
import { useQuery } from "@tanstack/react-query";

import { BadgePlateforme } from "@/features/ruul/BadgePlateforme";
import { supabase } from "@/lib/supabase/client";

interface Resume {
  semaine: string;
  ruul: { prets: number; pas_prets: number };
  upwork: { a_payer: number; bloques: number; payes: number };
}

export function ResumePlateformes({ semaine }: { semaine: string }) {
  const q = useQuery({
    queryKey: ["paie", "resume-plateformes", semaine],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("paie_resume_plateformes", { p_semaine: semaine });
      if (error) throw new Error(error.message);
      return data as Resume | null;
    },
  });
  if (!q.data) return null;
  const r = q.data;
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border bg-border/70 text-sm shadow-sm sm:grid-cols-2" data-testid="resume-plateformes">
      <p className="flex items-center gap-2 bg-background px-4 py-3">
        <BadgePlateforme ruul /> <b className="tabular-nums">{r.ruul.prets}</b> prêts · <b className="tabular-nums">{r.ruul.pas_prets}</b> pas prêts
      </p>
      <p className="flex items-center gap-2 bg-background px-4 py-3">
        <BadgePlateforme ruul={false} /> <b className="tabular-nums">{r.upwork.a_payer}</b> à payer · <b className="tabular-nums">{r.upwork.bloques}</b> bloqués
        <span className="text-xs text-muted-foreground">({r.upwork.payes} payés)</span>
      </p>
    </div>
  );
}
