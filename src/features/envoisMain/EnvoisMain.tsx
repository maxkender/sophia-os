import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { localeDate } from "@/locales/localeDate";

import { aFaire, type EnvoiMain, lireEnvoisMain, marquerEnvoye } from "./api";

const cle = (m: EnvoiMain) => `${m.poster_id}|${m.type}|${m.periode}`;

const STATUT_VARIANTE: Record<EnvoiMain["statut_tache"], "warning" | "error" | "info" | "success"> = {
  a_envoyer: "warning",
  en_retard: "error",
  sent: "info",
  verifie: "success",
  sent_introuvable: "error",
};

function Ligne({ m, avecHm }: { m: EnvoiMain; avecHm: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [copie, setCopie] = React.useState(false);
  const fait = useMutation({
    mutationFn: () => marquerEnvoye(m),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["envois-main"] }),
  });
  const heure = new Intl.DateTimeFormat(localeDate(i18n.resolvedLanguage ?? "en"), {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
  return (
    <li className="space-y-1.5 p-3" data-envoi-main={cle(m)}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{m.nom ?? "—"}</span>
        <Badge variant="secondary">{t(`envoisMain.types.${m.type}`, { defaultValue: m.type })}</Badge>
        {avecHm && <span className="text-xs text-muted-foreground">{t("envoisMain.hm", { hm: m.hm_nom ?? "—" })}</span>}
        <span className="text-xs tabular-nums text-muted-foreground">{heure.format(new Date(m.main_at))}</span>
        <Badge variant={STATUT_VARIANTE[m.statut_tache]} data-statut-tache={m.statut_tache}>{t(`envoisMain.statuts.${m.statut_tache}`)}</Badge>
        {m.salon_url && (
          <a className="text-xs underline" href={m.salon_url} target="_blank" rel="noreferrer">
            {t("envoisMain.salon")}
          </a>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words rounded-md bg-muted/50 p-2 text-xs">{m.texte}</p>
      {aFaire(m) && (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(m.texte ?? "").then(() => setCopie(true)).catch(() => undefined);
          }}
        >
          <Copy className="size-3.5" />
          {copie ? t("envoisMain.copie") : t("envoisMain.copier")}
        </Button>
        <Button size="xs" disabled={fait.isPending} onClick={() => fait.mutate()}>
          {t("envoisMain.envoye")}
        </Button>
        {fait.error && <span className="text-xs text-destructive">{(fait.error as Error).message}</span>}
      </div>
      )}
    </li>
  );
}

/**
 * Prompt 25 v4 : « To send by hand ». Upwork est plein aujourd'hui (Max et
 * Adrien) : chaque message qui reste attend la HM de la recrue (bienvenue >
 * relances > lundi > nudge du jeudi). Le lien de la conversation du contrat,
 * le texte exact, Copy et Sent (noté parti sur Upwork, par la HM). Pas marqué
 * Sent 6 h après : Needs you. Rien quand la liste est vide (sauf `toujours`).
 */
export function EnvoisMain({ avecHm = false, toujours = false }: { avecHm?: boolean; toujours?: boolean }) {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["envois-main"], queryFn: lireEnvoisMain, refetchInterval: 60_000 });
  const liste = lu.data ?? [];
  const n = liste.filter(aFaire).length;
  if (!toujours && liste.length === 0 && !lu.error) return null;
  return (
    <Card id="a-envoyer-main" className={n ? "border-warning/60" : undefined} data-testid="envois-main">
      <CardHeader>
        <CardTitle className="text-base">{t("envoisMain.titre", { n })}</CardTitle>
        <CardDescription>{t("envoisMain.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {lu.data && liste.length === 0 && <p className="text-muted-foreground">{t("envoisMain.vide")}</p>}
        {liste.length > 0 && (
          <ul className="divide-y rounded-md border">
            {liste.map((m) => (
              <Ligne key={cle(m)} m={m} avecHm={avecHm} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
