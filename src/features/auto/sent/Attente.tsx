import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";

import {
  approuverMessages,
  type CleMessage,
  envoyerFile,
  lireAApprouver,
  lireApercu,
  lireBudgetUpwork,
  lireDoublons,
  type MessageAApprouver,
  TYPES_MESSAGES,
} from "./attenteApi";

const libelleType = (t: (k: string, o?: Record<string, unknown>) => string, type: string) =>
  t(`autoOnglets.attente.types.${type}`, { defaultValue: type });

const cleDe = (m: Pick<MessageAApprouver, "poster_id" | "type" | "periode">) => `${m.poster_id}|${m.type}|${m.periode}`;

/** Les données utilisées par un message, en une ligne (« clé : valeur · … »). */
function Donnees({ donnees }: { donnees: Record<string, unknown> | null }) {
  const morceaux = Object.entries(donnees ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  if (morceaux.length === 0) return null;
  return <p className="break-words text-xs text-muted-foreground">{morceaux.join(" · ")}</p>;
}

/**
 * Prompt 25 : Messages sent → To approve. Ce que l'OS a préparé en mode
 * Approve (relances des recrues, lundi 20 h) et ce qui attend un Send (0432).
 * Tout est coché ; je décoche ce que je ne veux pas, je peux modifier un
 * texte, puis « Send selected » : les messages cochés partent peu à peu
 * (Slack d'abord, Upwork dans le budget du jour), les autres sont écartés.
 */
export function AApprouver() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["messages-a-approuver"], queryFn: lireAApprouver, refetchInterval: 60_000 });
  const [decoches, setDecoches] = React.useState<Set<string>>(new Set());
  const [textes, setTextes] = React.useState<Record<string, string>>({});
  const [bilan, setBilan] = React.useState<string | null>(null);
  const liste = lu.data ?? [];
  const coches = liste.filter((m) => !decoches.has(cleDe(m)));
  const envoyer = useMutation({
    mutationFn: async () => {
      const garder: CleMessage[] = coches.map((m) => ({
        poster_id: m.poster_id, type: m.type, periode: m.periode,
        ...(textes[cleDe(m)] !== undefined && textes[cleDe(m)] !== m.texte ? { texte: textes[cleDe(m)] } : {}),
      }));
      const ecarter: CleMessage[] = liste.filter((m) => decoches.has(cleDe(m))).map((m) => ({ poster_id: m.poster_id, type: m.type, periode: m.periode }));
      const n = await approuverMessages(garder, ecarter);
      const f = n > 0 ? await envoyerFile() : null;
      return { n, f };
    },
    onSuccess: ({ n, f }) => {
      setDecoches(new Set());
      setTextes({});
      setBilan(t("autoOnglets.approuver.bilan", { n, partis: f?.envoyes ?? 0, attente: f?.upwork_bloque ?? 0 }));
      void qc.invalidateQueries({ queryKey: ["messages-a-approuver"] });
      void qc.invalidateQueries({ queryKey: ["messages-attente"] });
    },
  });
  const parType = new Map<string, MessageAApprouver[]>();
  for (const m of liste) parType.set(m.type, [...(parType.get(m.type) ?? []), m]);
  const basculer = (cles: string[], cocher: boolean) =>
    setDecoches((d) => {
      const x = new Set(d);
      for (const k of cles) {
        if (cocher) x.delete(k);
        else x.add(k);
      }
      return x;
    });

  return (
    <Card data-testid="a-approuver">
      <CardHeader>
        <CardTitle className="text-base">{t("autoOnglets.approuver.titre", { n: liste.length })}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("autoOnglets.approuver.aide")}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {lu.data && liste.length === 0 && <p className="text-muted-foreground">{t("autoOnglets.approuver.vide")}</p>}
        {[...parType.entries()].map(([type, messages]) => {
          const cles = messages.map(cleDe);
          const nCoches = cles.filter((k) => !decoches.has(k)).length;
          return (
            <section key={type} className="space-y-2" data-approuver={type}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{libelleType(t, type)}</p>
                <Badge variant="info">{t("autoOnglets.approuver.coches", { n: nCoches, total: messages.length })}</Badge>
                <Button size="xs" variant="ghost" onClick={() => basculer(cles, nCoches < messages.length)}>
                  {nCoches < messages.length ? t("autoOnglets.approuver.toutCocher") : t("autoOnglets.approuver.toutDecocher")}
                </Button>
              </div>
              <ul className="divide-y rounded-md border">
                {messages.map((m) => {
                  const k = cleDe(m);
                  const coche = !decoches.has(k);
                  return (
                    <li key={k} className={coche ? "space-y-1.5 p-2" : "space-y-1.5 p-2 opacity-50"} data-message={k}>
                      <label className="flex flex-wrap items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={coche}
                          disabled={!admin}
                          aria-label={t("autoOnglets.approuver.cocher", { nom: m.poster_nom ?? "?" })}
                          onChange={(e) => basculer([k], e.target.checked)}
                        />
                        <span className="font-medium">{m.poster_nom ?? "—"}</span>
                        <span className="text-muted-foreground">{t("autoOnglets.approuver.hm", { hm: m.hm_nom ?? "—" })}</span>
                        <span className="text-muted-foreground" data-cohorte>{t("autoOnglets.approuver.cohorte", { cohorte: m.cohorte ?? "—" })}</span>
                        <Badge variant="secondary">{m.canal ?? t("autoOnglets.apercu.aucunCanal")}</Badge>
                        <span className="text-muted-foreground">{m.periode}</span>
                      </label>
                      <Textarea
                        className="min-h-16 text-xs"
                        value={textes[k] ?? m.texte ?? ""}
                        readOnly={!admin || !coche}
                        aria-label={t("autoOnglets.approuver.texte", { nom: m.poster_nom ?? "?" })}
                        onChange={(e) => setTextes((x) => ({ ...x, [k]: e.target.value }))}
                      />
                      <Donnees donnees={m.donnees} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {admin && liste.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              data-action="envoyer-selection"
              loading={envoyer.isPending}
              disabled={coches.length === 0 && decoches.size === 0}
              onClick={() => {
                if (window.confirm(t("autoOnglets.approuver.confirm", { n: coches.length, ecartes: liste.length - coches.length }))) envoyer.mutate();
              }}
            >
              {t("autoOnglets.approuver.envoyer", { n: coches.length })}
            </Button>
            <span className="text-xs text-muted-foreground">{t("autoOnglets.approuver.rythme")}</span>
          </div>
        )}
        {bilan && <p className="text-sm">{bilan}</p>}
        {envoyer.error && <p className="text-destructive">{(envoyer.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/** Overview : « X messages waiting », avec le lien vers Messages sent → To approve. */
export function BandeauAttente() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["messages-a-approuver"], queryFn: lireAApprouver, refetchInterval: 60_000 });
  const n = (lu.data ?? []).length;
  if (n === 0) return null;
  return (
    <Link to="/admin/auto/sent?onglet=approuver" data-testid="bandeau-attente" className="block">
      <Card className="border-warning/60">
        <CardContent className="py-3 text-sm font-medium">{t("autoOnglets.attente.bandeau", { n })}</CardContent>
      </Card>
    </Link>
  );
}

/** Overview → Health : les conversations Upwork du jour, le plafond, la limite d'Upwork. */
export function BudgetUpwork() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["upwork-budget"], queryFn: lireBudgetUpwork, refetchInterval: 5 * 60_000 });
  const b = lu.data;
  if (!b) return null;
  const plein = b.limite_atteinte || b.conversations >= b.max;
  return (
    <p className={plein ? "font-medium text-destructive" : "text-muted-foreground"} data-testid="budget-upwork">
      {t("auto.sante.budgetUpwork", { n: b.conversations, max: b.max, reserve: b.reserve })}
      {b.limite_atteinte && ` · ${t("auto.sante.limiteUpwork")}`}
    </p>
  );
}

/** Ce qui partirait, par type : 10 exemples réels (destinataire, HM, canal, texte, données). */
export function ApercuMessages() {
  const { t } = useTranslation();
  const [demain, setDemain] = React.useState(false);
  const lu = useQuery({ queryKey: ["messages-apercu", demain], queryFn: () => lireApercu(demain), enabled: false });
  const doublons = useQuery({ queryKey: ["messages-doublons"], queryFn: lireDoublons });
  return (
    <div className="space-y-4" data-testid="apercu-messages">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("autoOnglets.apercu.titre")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("autoOnglets.apercu.aide")}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={demain} onChange={(e) => setDemain(e.target.checked)} />
              {t("autoOnglets.apercu.demain")}
            </label>
            <Button size="sm" onClick={() => void lu.refetch()} disabled={lu.isFetching}>
              {lu.isFetching ? t("autoOnglets.apercu.calcul") : t("autoOnglets.apercu.calculer")}
            </Button>
          </div>
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
                        <span className="text-muted-foreground">{t("autoOnglets.approuver.hm", { hm: ex.hm ?? "—" })}</span>
                        <Badge variant="secondary">{ex.variante}</Badge>
                        {ex.doublon ? (
                          <Badge variant="warning">{t("autoOnglets.apercu.doublon")}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{ex.canaux.join(" + ") || t("autoOnglets.apercu.aucunCanal")}</span>
                        )}
                      </p>
                      <p className="whitespace-pre-line rounded bg-muted/40 p-2">{ex.texte}</p>
                      <Donnees donnees={ex.donnees} />
                    </div>
                  ))}
                </div>
              );
            })}
          {lu.data && lu.data.needs_you.length > 0 && (
            <div className="space-y-1" data-apercu="needs_you">
              <p className="font-medium">{t("autoOnglets.apercu.needsYou", { n: lu.data.needs_you.length })}</p>
              <p className="text-xs text-muted-foreground">
                {lu.data.needs_you.map((x) => `${x.nom ?? "?"} (@${x.handle ?? "?"})`).join(" · ")}
              </p>
            </div>
          )}
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
