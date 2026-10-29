import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

interface Evenement {
  at: string;
  type: string;
  detail: string | null;
  poster_id: string;
}

async function lireDerniersEvenements(): Promise<Evenement[]> {
  const { data, error } = await supabase
    .from("recrue_evenements")
    .select("at, type, detail, poster_id")
    .order("at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Evenement[];
}

/**
 * Logs (prompt 22) : les 100 derniers événements des recrues
 * (recrue_evenements, 0407). To do et Issues sont dans « Needs you » (U).
 */
export function PageLogs() {
  const { t, i18n } = useTranslation();
  const lu = useQuery({ queryKey: ["auto", "logs", "evenements"], queryFn: lireDerniersEvenements, refetchInterval: 60_000 });
  const quand = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 pt-6 text-sm" data-testid="logs-evenements">
          {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
          {(lu.data ?? []).map((e, i) => (
            <div key={`${e.at}-${i}`} className="flex flex-wrap gap-x-3 border-b py-1 last:border-0">
              <span className="w-32 shrink-0 text-muted-foreground">{quand(e.at)}</span>
              <span className="font-medium">{t(`pipeline.evenements.${e.type}`, { defaultValue: e.type })}</span>
              {e.detail && <span className="min-w-0 truncate text-muted-foreground">{e.detail}</span>}
            </div>
          ))}
          {lu.data && lu.data.length === 0 && <p className="text-muted-foreground">{t("auto.logs.vide")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
