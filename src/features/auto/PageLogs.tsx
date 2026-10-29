import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";

interface Evenement {
  at: string;
  type: string;
  detail: string | null;
  poster_id: string;
}

interface AFaire {
  id: string;
  gravite: "todo" | "issue";
  titre: string;
  detail: string | null;
  semaine: string | null;
  lien: string | null;
  type: string;
  created_at: string;
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

/** Prompt 21 (0416) : ce que l'OS ne peut pas faire seul (To do) et les urgences (Issues), pas encore faites. */
async function lireAFaire(): Promise<AFaire[]> {
  const { data, error } = await supabase
    .from("a_faire")
    .select("id, gravite, type, titre, detail, semaine, lien, created_at")
    .is("fait_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as AFaire[];
}

function ListeAFaire({ gravite, lignes }: { gravite: "todo" | "issue"; lignes: AFaire[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fait = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("a_faire_fait", { p_id: id, p_fait: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auto", "logs", "a-faire"] }),
  });
  const ici = lignes.filter((l) => l.gravite === gravite);
  return (
    <Card className={gravite === "issue" && ici.length > 0 ? "border-destructive/50" : undefined} data-testid={`logs-${gravite}`}>
      <CardHeader>
        <CardTitle className="text-base">{t(`auto.logs.${gravite}`, { n: ici.length })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {ici.length === 0 && <p className="text-muted-foreground">{t("auto.logs.rien")}</p>}
        {ici.map((l) => (
          <div key={l.id} className="flex flex-wrap items-start justify-between gap-2 border-b py-1.5 last:border-0">
            <div className="min-w-0">
              <p className="font-medium">{l.titre}</p>
              {l.detail && <p className="text-muted-foreground">{l.detail}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {l.lien && (
                <Button size="sm" variant="outline" asChild>
                  <a href={l.lien} target="_blank" rel="noreferrer">
                    {l.type === "slack" ? t("auto.logs.ouvrirSlack") : t("auto.logs.ouvrir")}
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={fait.isPending} onClick={() => fait.mutate(l.id)}>
                {t("auto.logs.fait")}
              </Button>
            </div>
          </div>
        ))}
        {fait.error && <p className="text-destructive">{(fait.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Logs & to do (prompt 22). Issues (urgent : carte refusée, contrat en pause,
 * canari arrêté), To do (ce que l'OS n'a pas pu faire seul), puis les 100
 * derniers événements des recrues (recrue_evenements, 0407).
 */
export function PageLogs() {
  const { t, i18n } = useTranslation();
  const lu = useQuery({ queryKey: ["auto", "logs", "evenements"], queryFn: lireDerniersEvenements, refetchInterval: 60_000 });
  const aFaire = useQuery({ queryKey: ["auto", "logs", "a-faire"], queryFn: lireAFaire, refetchInterval: 60_000 });
  const quand = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
  return (
    <div className="space-y-4">
      {aFaire.error && <p className="text-sm text-destructive">{(aFaire.error as Error).message}</p>}
      <ListeAFaire gravite="issue" lignes={aFaire.data ?? []} />
      <ListeAFaire gravite="todo" lignes={aFaire.data ?? []} />
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
