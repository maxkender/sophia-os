import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { telechargerCsv, versCsv } from "@/lib/csv";

import {
  changerStatutRuul,
  lireLotRuul,
  lirePosteursRuul,
  lireTableauRuul,
  payerLotRuul,
  preparerLotRuul,
  rapprocherLotRuul,
  saisirLotRuul,
  type PosteurRuul,
} from "./api";
import { dollars, jourMois, LIBELLE_STATUT, lignesCsvLot, lireExportRuul } from "./logique";

const CLES = [["ruul-tableau"], ["ruul-posteurs"], ["ruul-lot"]];

/**
 * Page Paie → Ruul (0574) : les posteurs du site payés par Ruul. Le tableau
 * de bord, la carte « À ajouter sur Ruul » et le lot de la semaine
 * (préparé → saisi → payé → rapproché). L'OS ne paie jamais : Max paie sur Ruul.
 */
export function PaieRuul() {
  return (
    <div className="space-y-4" data-testid="paie-ruul">
      <TableauRuulBloc />
      <AjouterSurRuul />
      <LotRuulCarte />
    </div>
  );
}

function useRafraichir() {
  const qc = useQueryClient();
  return () => Promise.all(CLES.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

function TableauRuulBloc() {
  const q = useQuery({ queryKey: ["ruul-tableau"], queryFn: lireTableauRuul });
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const t = q.data;
  return (
    <Card data-testid="tableau-ruul">
      <CardHeader>
        <CardTitle>Ruul</CardTitle>
        <CardDescription>
          Posteurs du site, payés chaque semaine sur Ruul (mode {t.mode}). Lot de la semaine du {jourMois(t.semaine)} :{" "}
          {t.lot ? `${t.lot.statut}, ${t.lot.nb} ligne(s), ${dollars(t.lot.total)}` : "pas encore préparé"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4 text-sm">
        {(["a_ajouter", "invite", "pret", "paye_1x"] as const).map((s) => (
          <div key={s}>
            <div className="text-2xl font-semibold">{t.statuts[s] ?? 0}</div>
            <div className="text-xs text-muted-foreground">{LIBELLE_STATUT[s]}</div>
          </div>
        ))}
        <div>
          <div className="text-2xl font-semibold">{dollars(t.rattrapages.total)}</div>
          <div className="text-xs text-muted-foreground">Rattrapages en cours ({t.rattrapages.nb} semaine(s))</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AjouterSurRuul() {
  const q = useQuery({ queryKey: ["ruul-posteurs"], queryFn: lirePosteursRuul });
  const rafraichir = useRafraichir();
  const [message, setMessage] = React.useState<string | null>(null);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const actifs = q.data.filter((p) => p.actif);
  const aAjouter = actifs.filter((p) => p.ruul_statut === "a_ajouter");
  const invites = actifs.filter((p) => p.ruul_statut === "invite");

  const agir = async (p: PosteurRuul, statut: "invite" | "pret" | null, email?: string) => {
    setMessage(null);
    try {
      const r = await changerStatutRuul(p.poster_id, statut, email);
      if (!r.ok) setMessage(`${p.nom} : ${r.erreur}`);
      await rafraichir();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <Card data-testid="ajouter-ruul">
      <CardHeader>
        <CardTitle>À ajouter sur Ruul ({aAjouter.length})</CardTitle>
        <CardDescription>
          Ajoute chaque posteur sur Ruul (Contractors → New Contractor) avec son nom légal et cet email, puis clique « Ajouté sur Ruul » :
          il reçoit le message pour créer son compte et valider son identité.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p className="text-sm text-destructive" role="status">{message}</p> : null}
        {aAjouter.length === 0 ? <p className="text-sm text-muted-foreground">Personne à ajouter.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Nom", "Nom légal", "Email Ruul", "Pays", "Cohorte", ""].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {aAjouter.map((p) => <LigneAjouter key={p.poster_id} p={p} onAgir={agir} />)}
              </tbody>
            </table>
          </div>
        )}
        {invites.length > 0 ? (
          <div className="space-y-1 text-sm" data-testid="invites-ruul">
            <p className="font-medium">Invités, compte pas encore prêt ({invites.length})</p>
            {invites.map((p) => (
              <div key={p.poster_id} className="flex flex-wrap items-center gap-2">
                <span>{p.nom}</span>
                <span className="text-xs text-muted-foreground">
                  {p.ruul_email} · ajouté le {p.ajoute_at ? new Date(p.ajoute_at).toLocaleDateString("fr-FR") : "?"} · {p.relances} message(s)
                  {p.stop_at ? " · a demandé STOP" : ""}
                </span>
                <Button size="sm" variant="outline" onClick={() => void agir(p, "pret")}>Marquer prêt</Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LigneAjouter({ p, onAgir }: { p: PosteurRuul; onAgir: (p: PosteurRuul, s: "invite" | null, email?: string) => Promise<void> }) {
  const [email, setEmail] = React.useState(p.ruul_email ?? "");
  const change = email.trim() !== (p.ruul_email ?? "");
  return (
    <tr className="border-b border-border/40 align-top">
      <td className="py-1.5 pr-3 font-medium">{p.nom}</td>
      <td className="py-1.5 pr-3">{[p.prenom_legal, p.nom_legal].filter(Boolean).join(" ") || "—"}</td>
      <td className="py-1.5 pr-3">
        <Input className="h-8 min-w-[14rem]" value={email} onChange={(e) => setEmail(e.target.value)} aria-label={`Email Ruul de ${p.nom}`} />
      </td>
      <td className="py-1.5 pr-3">{p.pays ?? "?"}</td>
      <td className="py-1.5 pr-3">{p.cohorte ? jourMois(p.cohorte) : "—"}</td>
      <td className="py-1.5 pr-3">
        <Button size="sm" disabled={!email.trim()} onClick={() => void onAgir(p, "invite", change ? email.trim() : undefined)}>
          Ajouté sur Ruul
        </Button>
      </td>
    </tr>
  );
}

function LotRuulCarte() {
  const q = useQuery({ queryKey: ["ruul-lot"], queryFn: () => lireLotRuul() });
  const rafraichir = useRafraichir();
  const [facture, setFacture] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  if (!q.data) return null;
  const d = q.data;
  const statut = d.lot?.statut ?? null;
  const total = d.lignes.reduce((s, l) => s + Number(l.total), 0);
  const alertes = d.lignes.flatMap((l) => l.alertes.map((a) => `${l.nom} : ${a}`));

  const agir = async (f: () => Promise<{ ok: boolean; erreur?: string } & Record<string, unknown>>, ok: string) => {
    setOccupe(true);
    setMessage(null);
    try {
      const r = await f();
      setMessage(r.ok ? ok : `Impossible : ${r.erreur}`);
      await rafraichir();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const importer = async (fichier: File) => {
    const lu = lireExportRuul(await fichier.text());
    if ("erreur" in lu) {
      setMessage(`Export Ruul : ${lu.erreur}`);
      return;
    }
    await agir(() => rapprocherLotRuul(d.semaine, lu), "Rapprochement fait (les écarts sont dans Problems).");
  };

  return (
    <Card data-testid="lot-ruul">
      <CardHeader>
        <CardTitle>À payer sur Ruul · semaine du {jourMois(d.semaine)}</CardTitle>
        <CardDescription>
          {statut ? `Lot ${statut}${d.lot?.facture ? ` · facture ${d.lot.facture}` : ""} · ` : "Lot pas encore préparé · "}
          {d.lignes.length} posteur(s) · <b>{dollars(total)}</b>. Seuls les posteurs prêts sur Ruul y entrent ; les autres sont reportés au lot suivant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alertes.length > 0 ? (
          <ul className="space-y-0.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm" data-testid="alertes-ruul">
            {alertes.map((a) => <li key={a}>⚠ {a}</li>)}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {!statut || statut === "prepare" ? (
            <Button size="sm" variant="outline" disabled={occupe} onClick={() => void agir(() => preparerLotRuul(d.semaine), "Lot préparé.")}>
              {statut ? "Recalculer le lot" : "Préparer le lot"}
            </Button>
          ) : null}
          {d.lignes.length > 0 ? (
            <Button size="sm" variant="outline" onClick={() => telechargerCsv(`ruul-${d.semaine}.csv`, versCsv(["Nom", "Email Ruul", "Semaine(s)", "Montant ($)"], lignesCsvLot(d.lignes)))}>
              Export CSV
            </Button>
          ) : null}
          {statut === "prepare" && d.lignes.length > 0 ? (
            <>
              <Input className="h-8 w-48" placeholder="N° de facture Ruul" value={facture} onChange={(e) => setFacture(e.target.value)} aria-label="Numéro de facture Ruul" />
              <Button size="sm" disabled={occupe || !facture.trim()} onClick={() => void agir(() => saisirLotRuul(d.semaine, facture.trim()), "Lot saisi.")}>Saisi</Button>
            </>
          ) : null}
          {statut === "saisi" ? (
            <Button
              size="sm"
              disabled={occupe}
              onClick={() => {
                if (!window.confirm(`Tu as payé ${dollars(total)} sur Ruul pour ${d.lignes.length} posteur(s) ?`)) return;
                void agir(() => payerLotRuul(d.semaine), "Lot payé : les posteurs sont prévenus.");
              }}
            >
              Payé sur Ruul
            </Button>
          ) : null}
          {statut === "paye" || statut === "rapproche" ? (
            <label className="text-sm">
              <span className="mr-2">Importer l'export Ruul (CSV) :</span>
              <input type="file" accept=".csv,text/csv" aria-label="Export Ruul" onChange={(e) => e.target.files?.[0] && void importer(e.target.files[0])} />
            </label>
          ) : null}
        </div>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        {d.lignes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Nom", "Email Ruul", "Semaine(s)", "Montant", "Alertes"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.lignes.map((l) => (
                  <tr key={l.poster_id} className="border-b border-border/40 align-top">
                    <td className="py-1.5 pr-3 font-medium">{l.nom}</td>
                    <td className="py-1.5 pr-3">{l.ruul_email ?? <span className="text-destructive">manquant</span>}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      {l.semaines.map((s) => (
                        <div key={s.id}>
                          {jourMois(s.semaine)} : {dollars(s.montant)}{s.rattrapage ? " · rattrapage" : ""}{s.paye_at ? " · payé" : ""}
                          {s.ecart ? <span className="text-destructive"> · {s.ecart}</span> : null}
                        </div>
                      ))}
                    </td>
                    <td className="py-1.5 pr-3">{dollars(l.total)}</td>
                    <td className="py-1.5 pr-3 text-xs">{l.alertes.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {d.reportes.length > 0 ? (
          <div className="text-sm" data-testid="reportes-ruul">
            <p className="font-medium">Reportés (compte Ruul pas prêt) : {dollars(d.reportes.reduce((s, r) => s + Number(r.montant), 0))}</p>
            <p className="text-xs text-muted-foreground">
              {d.reportes.map((r) => `${r.nom} ${jourMois(r.semaine)} (${dollars(r.montant)}, ${LIBELLE_STATUT[r.ruul_statut ?? "aucun"]})`).join(" · ")}
            </p>
          </div>
        ) : null}
        {d.rapprochement ? (
          <div className="text-sm" data-testid="rapprochement-ruul">
            <p className="font-medium">Rapprochement avec l'export Ruul</p>
            {d.rapprochement.map((r) => (
              <div key={r.email} className={r.resultat === "ok" ? "" : "text-destructive"}>
                {r.nom ?? r.email} : {r.resultat} (attendu {r.attendu ?? 0} $, Ruul {r.ruul ?? 0} $)
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
