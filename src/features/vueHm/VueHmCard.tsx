import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { listerHmsVue, ouvrirVueHm } from "./api";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Admin → Tests : voir l'OS exactement comme une HM, en lecture seule. */
export function VueHmCard() {
  const { t } = useTranslation();
  const hms = useQuery({ queryKey: ["vue-hm-liste"], queryFn: listerHmsVue });
  const [hmId, setHmId] = React.useState("");
  const ouvrir = useMutation({ mutationFn: () => ouvrirVueHm(hmId) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="size-4 text-primary" />
          {t("vueHm.titre")}
        </CardTitle>
        <CardDescription>{t("vueHm.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          aria-label={t("vueHm.choisir")}
          className={selectClass}
          value={hmId}
          onChange={(e) => setHmId(e.target.value)}
          disabled={hms.isLoading}
        >
          <option value="">{t("vueHm.choisir")}</option>
          {(hms.data ?? []).map((hm) => (
            <option key={hm.id} value={hm.id}>
              {hm.nom}
            </option>
          ))}
        </select>
        <Button disabled={!hmId || ouvrir.isPending} onClick={() => ouvrir.mutate()}>
          <Eye />
          {t("vueHm.ouvrir")}
        </Button>
        {(hms.error || ouvrir.error) && (
          <p className="text-sm text-destructive">{String((hms.error ?? ouvrir.error)?.message ?? "")}</p>
        )}
      </CardContent>
    </Card>
  );
}
