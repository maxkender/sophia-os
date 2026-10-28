import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";

import { lireRegles } from "./api";
import { CLES_REGLES, type Regle } from "./textes";

const REGLES: readonly Regle[] = ["lien", "warmup", "bienvenue"];

async function enregistrer(textes: Record<Regle, string>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from("reglages")
    .upsert(REGLES.map((r) => ({ cle: CLES_REGLES[r], valeur: textes[r].trim(), ...par })));
  if (error) throw error;
}

/** Les règles dites aux posteurs (28 oct.), modifiables : le lien et le warm-up. */
export function ReglagesRegles() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["regles-posteur"], queryFn: lireRegles });
  const [textes, setTextes] = React.useState<Record<Regle, string> | null>(null);
  React.useEffect(() => {
    if (lu.data) setTextes(lu.data.textes);
  }, [lu.data]);
  const maj = useMutation({
    mutationFn: enregistrer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["regles-posteur"] }),
  });
  if (!textes) return null;
  return (
    <Card data-testid="reglages-regles">
      <CardHeader>
        <CardTitle>{t("regles.titre")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("regles.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {REGLES.map((r) => (
          <label key={r} className="block space-y-1 text-sm">
            <span className="font-medium">{t(`regles.${r}`)}</span>
            <Textarea
              value={textes[r]}
              rows={r === "bienvenue" ? 12 : 3}
              onChange={(e) => setTextes({ ...textes, [r]: e.target.value })}
            />
            {r === "bienvenue" && <span className="block text-xs text-muted-foreground">{t("regles.bienvenueAide")}</span>}
          </label>
        ))}
        <div className="flex items-center gap-2">
          <Button disabled={maj.isPending || REGLES.some((r) => !textes[r].trim())} onClick={() => maj.mutate(textes)}>
            {t("regles.enregistrer")}
          </Button>
          {maj.isSuccess && <span className="text-sm text-muted-foreground">{t("regles.ok")}</span>}
          {maj.error && <span className="text-sm text-destructive">{(maj.error as Error).message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
