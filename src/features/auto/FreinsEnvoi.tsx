import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { OctagonPause } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { localeDate } from "@/locales/localeDate";

import { leverFrein, lireFreins } from "./freinsApi";

/**
 * Prompt 25, mises à jour : les freins. Un type de message passe en pause
 * quand il dépasse son plafond par heure, ou quand le contrôle après coup
 * montre que plus de 20 % des destinataires d'un envoi avaient déjà fait
 * l'étape. Max et Lucia sont prévenus sur Slack ; ici, la raison et « Resume »
 * (admin). Rien de ce qui était dû pendant la pause ne part en rafale.
 */
export function FreinsEnvoi() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["freins-envoi"], queryFn: lireFreins, refetchInterval: 60_000 });
  const lever = useMutation({
    mutationFn: leverFrein,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["freins-envoi"] }),
  });
  const freins = lu.data ?? [];
  if (freins.length === 0) return null;
  const fmt = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "fr"), {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
  return (
    <Card className="border-destructive/60" data-testid="freins-envoi">
      <CardContent className="space-y-2 py-3 text-sm">
        {freins.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-3" data-frein={f.type}>
            <OctagonPause className="size-4 shrink-0 text-destructive" aria-hidden />
            <span className="font-medium">
              {t("auto.freins.titre", { type: t(`autoOnglets.attente.types.${f.type}`, { defaultValue: f.type }) })}
            </span>
            <span className="text-muted-foreground">
              {t(`auto.freins.motifs.${f.motif}`)} · {f.detail ?? ""} · {fmt.format(new Date(f.cree_at))}
            </span>
            {role === "admin" && (
              <Button
                size="xs"
                variant="outline"
                className="ml-auto"
                loading={lever.isPending && lever.variables === f.id}
                onClick={() => {
                  if (window.confirm(t("auto.freins.confirm"))) lever.mutate(f.id);
                }}
              >
                {t("auto.freins.reprendre")}
              </Button>
            )}
          </div>
        ))}
        {lever.error && <p className="text-destructive">{(lever.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
