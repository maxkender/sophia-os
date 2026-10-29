import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";

import { lireApercu, lireDoublons, lireMessagesAttente, TYPES_MESSAGES, validerMessagesAttente, type MessageAttente } from "./attenteApi";

const libelleType = (t: (k: string, o?: Record<string, unknown>) => string, type: string) =>
  t(`autoOnglets.attente.types.${type}`, { defaultValue: type });

/**
 * 0432 : les messages qui attendent un « Send » : dus avant le passage d'un
 * interrupteur sur « on » (jamais de rattrapage d'un coup), ou la liste du
 * jeudi (toujours validée). Une fois validés, ils partent peu à peu.
 */
export function MessagesEnAttente({ types }: { types?: readonly string[] }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["messages-attente"], queryFn: lireMessagesAttente, refetchInterval: 60_000 });
  const [ouvert, setOuvert] = React.useState<string | null>(null);
  const valider = useMutation({
    mutationFn: (type: string) => validerMessagesAttente([type]),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["messages-attente"] }),
  });
  const tous = (lu.data ?? []).filter((m) => !types || types.includes(m.type));
  const parType = new Map<string, MessageAttente[]>();
  for (const m of tous) parType.set(m.type, [...(parType.get(m.type) ?? []), m]);
  if (!lu.data) return null;
  return (
    <Card data-testid="messages-attente">
      <CardHeader>
        <CardTitle className="text-base">{t("autoOnglets.attente.titre", { n: tous.length })}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("autoOnglets.attente.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {tous.length === 0 && <p className="text-muted-foreground">{t("autoOnglets.attente.vide")}</p>}
        {[...parType.entries()].map(([type, liste]) => {
          const aValider = liste.filter((m) => !m.valide_at).length;
          return (
            <div key={type} className="space-y-2 rounded-md border p-3" data-attente={type}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{libelleType(t, type)}</span>
                <Badge variant="warning">{t("autoOnglets.attente.enAttente", { n: aValider })}</Badge>
                {liste.length - aValider > 0 && <Badge variant="info">{t("autoOnglets.attente.valides", { n: liste.length - aValider })}</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setOuvert(ouvert === type ? null : type)}>
                  {ouvert === type ? t("autoOnglets.attente.masquer") : t("autoOnglets.attente.voir")}
                </Button>
                {role === "admin" && aValider > 0 && (
                  <Button
                    size="sm"
                    data-action={`envoyer-${type}`}
                    disabled={valider.isPending}
                    onClick={() => {
                      if (window.confirm(t("autoOnglets.attente.confirm", { n: aValider, type: libelleType(t, type) }))) valider.mutate(type);
                    }}
                  >
                    {t("autoOnglets.attente.envoyer", { n: aValider })}
                  </Button>
                )}
              </div>
              {ouvert === type && (
                <ul className="divide-y rounded-md border">
                  {liste.map((m) => (
                    <li key={`${m.poster_id}-${m.periode}`} className="space-y-1 p-2">
                      <p className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">{m.poster_nom ?? "—"}</span>
                        {m.canal && <span className="text-muted-foreground">{m.canal}</span>}
                        {m.valide_at && <Badge variant="info">{t("autoOnglets.attente.valide")}</Badge>}
                      </p>
                      {m.texte && <p className="whitespace-pre-line rounded bg-muted/40 p-2 text-xs">{m.texte}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {valider.error && <p className="text-destructive">{(valider.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/** Overview : « X messages waiting », avec le lien vers Messages sent → Planned. */
export function BandeauAttente() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["messages-attente"], queryFn: lireMessagesAttente, refetchInterval: 60_000 });
  const n = (lu.data ?? []).filter((m) => !m.valide_at).length;
  if (n === 0) return null;
  return (
    <Link to="/admin/auto/sent?onglet=prevus" data-testid="bandeau-attente" className="block">
      <Card className="border-warning/60">
        <CardContent className="py-3 text-sm font-medium">{t("autoOnglets.attente.bandeau", { n })}</CardContent>
      </Card>
    </Link>
  );
}

/** Ce qui partirait maintenant, par type : 10 exemples réels (destinataire, canaux, texte, données). */
export function ApercuMessages() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["messages-apercu"], queryFn: lireApercu, enabled: false });
  const doublons = useQuery({ queryKey: ["messages-doublons"], queryFn: lireDoublons });
  return (
    <div className="space-y-4" data-testid="apercu-messages">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("autoOnglets.apercu.titre")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("autoOnglets.apercu.aide")}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Button size="sm" onClick={() => void lu.refetch()} disabled={lu.isFetching}>
            {lu.isFetching ? t("autoOnglets.apercu.calcul") : t("autoOnglets.apercu.calculer")}
          </Button>
          {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
          {lu.data &&
            TYPES_MESSAGES.map((type) => {
              const bloc = lu.data.types[type];
              return (
                <div key={type} className="space-y-2" data-apercu={type}>
                  <p className="font-medium">
                    {libelleType(t, type)} · {t("autoOnglets.apercu.total", { n: bloc?.total ?? 0 })}
                  </p>
                  {(bloc?.exemples ?? []).map((ex) => (
                    <div key={`${type}-${ex.poster_id}`} className="space-y-1 rounded-md border p-2 text-xs">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{ex.nom ?? "—"}</span>
                        <Badge variant="secondary">{ex.variante}</Badge>
                        {ex.doublon ? (
                          <Badge variant="warning">{t("autoOnglets.apercu.doublon")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{ex.canaux.join(" + ") || t("autoOnglets.apercu.aucunCanal")}</span>
                        )}
                      </p>
                      <p className="whitespace-pre-line rounded bg-muted/40 p-2">{ex.texte}</p>
                      <p className="break-words text-muted-foreground">
                        {Object.entries(ex.donnees)
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              );
            })}
        </CardContent>
      </Card>
      <Card data-testid="doublons">
        <CardHeader>
          <CardTitle className="text-base">{t("autoOnglets.apercu.doublonsTitre", { n: doublons.data?.length ?? 0 })}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("autoOnglets.apercu.doublonsAide")}</p>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(doublons.data ?? []).map((d) => (
            <p key={`${d.par}-${d.cle}`}>
              <span className="text-muted-foreground">{d.par === "contrat" ? t("autoOnglets.apercu.contrat", { id: d.cle }) : t("autoOnglets.apercu.slack", { id: d.cle })} : </span>
              {d.profils.map((p) => `${p.nom ?? "—"} (${p.email ?? "?"}, ${p.cohorte ?? "?"})`).join(" / ")}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
