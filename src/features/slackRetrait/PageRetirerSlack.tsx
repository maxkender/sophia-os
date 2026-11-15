import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { desactiver, lireEtat, lireListe, retirer, verifier, type EtatSlack, type PersonneSlack } from "./api";
import { dateArret, etatCanaux, resume } from "./logique";

/**
 * 8/11 : « À retirer de Slack ». Les personnes désactivées dans l'OS (Kill,
 * STOP, Portugal, contrat fermé) encore membres actifs de Slack. Chaque Kill
 * les ajoute ; un compte désactivé dans Slack disparaît (vérifié chaque heure).
 */
export function PageRetirerSlack() {
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["slack-retraits"], queryFn: lireListe });
  const etat = useQuery({ queryKey: ["slack-retraits-etat"], queryFn: lireEtat, staleTime: 300_000 });
  const [occupe, setOccupe] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const rafraichir = () => qc.invalidateQueries({ queryKey: ["slack-retraits"] });
  const agir = async (cle: string, f: () => Promise<string | null>) => {
    setOccupe(cle);
    setMessage(null);
    try {
      setMessage(await f());
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(null);
      await rafraichir();
    }
  };

  const retirerTous = () =>
    agir("tous", async () => {
      let faits = 0;
      for (let tour = 0; tour < 20; tour++) {
        const r = await retirer();
        if (!r.ok) return r.error ?? "Retrait impossible";
        faits += r.faits ?? 0;
        await rafraichir();
        if (!r.restants) break;
      }
      return `${faits} personne(s) traitée(s).`;
    });

  if (liste.error) return <p className="text-sm text-destructive">{(liste.error as Error).message}</p>;
  if (!liste.data) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const personnes = liste.data;
  const peutRetirer = etat.data?.retrait.possible ?? false;
  const peutDesactiver = etat.data?.desactivation.possible ?? false;
  const derniere = personnes.map((p) => p.verifie_at ?? "").sort().pop() || null;

  return (
    <div className="space-y-4" data-testid="retirer-slack">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium" data-testid="retirer-slack-resume">{resume(personnes.length)}</p>
        {derniere ? <span className="text-xs text-muted-foreground">Vérifié avec Slack le {new Date(derniere).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</span> : null}
        <Button size="sm" variant="outline" disabled={occupe !== null} onClick={() => agir("verifier", async () => {
          const r = await verifier();
          return r.ok ? `${r.encore_actifs ?? 0} encore actif(s), ${r.desactives ?? 0} sorti(s) de Slack.` : r.error ?? "Vérification impossible";
        })}>
          {occupe === "verifier" ? "Vérification…" : "Vérifier maintenant"}
        </Button>
        {personnes.length > 0 ? (
          <Button size="sm" disabled={occupe !== null || !peutRetirer} onClick={retirerTous}>
            {occupe === "tous" ? "Retrait en cours…" : "Retirer tout le monde des canaux"}
          </Button>
        ) : null}
      </div>
      <Droits etat={etat.data} />
      {message ? <p className="text-sm" role="status">{message}</p> : null}
      {personnes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Encore membres de Slack</CardTitle>
            <CardDescription>Une personne disparaît de la liste dès que son compte Slack est désactivé.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Nom", "Raison", "Arrêt", "Canaux", "Profil Slack", ""].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {personnes.map((p) => (
                  <Ligne key={p.poster_id} p={p} occupe={occupe} peutRetirer={peutRetirer} peutDesactiver={peutDesactiver} agir={agir} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Droits({ etat }: { etat: EtatSlack | undefined }) {
  if (!etat) return null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground" data-testid="retirer-slack-droits">
      {!etat.retrait.possible ? (
        <p className="text-warning-foreground">
          Le bot Slack ne peut pas retirer des canaux : il lui manque {etat.retrait.manquent.join(", ")} (app « Sophia OS » → OAuth &amp; Permissions → Bot Token Scopes, puis réinstaller l'app).
        </p>
      ) : null}
      {!etat.desactivation.possible ? (
        <p>Désactivation automatique impossible (plan Slack sans SCIM ou pas de jeton d'admin) : chaque compte est à désactiver à la main avec le lien du profil.</p>
      ) : null}
    </div>
  );
}

function Ligne({ p, occupe, peutRetirer, peutDesactiver, agir }: {
  p: PersonneSlack;
  occupe: string | null;
  peutRetirer: boolean;
  peutDesactiver: boolean;
  agir: (cle: string, f: () => Promise<string | null>) => Promise<void>;
}) {
  const canaux = etatCanaux(p);
  const libre = occupe === null;
  return (
    <tr className="border-b border-border/40 align-top" data-testid="retirer-slack-ligne">
      <td className="py-2 pr-3 font-medium">{p.nom}</td>
      <td className="py-2 pr-3">{p.raison ?? "—"}</td>
      <td className="py-2 pr-3">{dateArret(p)}</td>
      <td className={`py-2 pr-3 text-xs ${canaux.ton === "erreur" ? "text-destructive" : canaux.ton === "ok" ? "text-success-foreground" : "text-muted-foreground"}`}>{canaux.texte}</td>
      <td className="py-2 pr-3"><a href={p.lien_slack} target="_blank" rel="noreferrer" className="text-xs underline">Ouvrir le profil</a></td>
      <td className="py-2 pr-0">
        <div className="flex flex-wrap justify-end gap-1.5">
          {!p.canaux_retires_at ? (
            <Button size="xs" variant="outline" disabled={!libre || !peutRetirer} onClick={() => agir(`r:${p.poster_id}`, async () => {
              const r = await retirer(p.poster_id);
              return r.ok ? `${p.nom} : retrait des canaux fait.` : r.error ?? "Retrait impossible";
            })}>
              Retirer de tous les canaux
            </Button>
          ) : null}
          {peutDesactiver ? (
            <Button size="xs" variant="destructive-outline" disabled={!libre} onClick={() => agir(`d:${p.poster_id}`, async () => {
              const r = await desactiver(p.poster_id);
              return r.ok ? `${p.nom} : compte Slack désactivé.` : r.error ?? "Désactivation impossible : à faire à la main.";
            })}>
              Désactiver le compte
            </Button>
          ) : (
            <>
              <span className="self-center text-xs text-muted-foreground">À désactiver à la main</span>
              <Button size="xs" variant="ghost" disabled={!libre} onClick={() => agir(`v:${p.poster_id}`, async () => {
                const r = await verifier(p.poster_id);
                return r.ok && r.desactives ? `${p.nom} : désactivé dans Slack, retiré de la liste.` : `${p.nom} : encore actif dans Slack.`;
              })}>
                C'est fait
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
