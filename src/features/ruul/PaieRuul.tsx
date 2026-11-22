import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { telechargerCsv, versCsv } from "@/lib/csv";

import {
  changerStatutRuul,
  creerPaiementRuul,
  deciderVerifRuul,
  importerHistoriqueRuul,
  lireVerifRuul,
  devisLotRuul,
  libelleArret,
  lireLotRuul,
  lirePosteursRuul,
  lireTableauRuul,
  payerLotRuul,
  preparerLotRuul,
  rapprocherLotRuul,
  relirePaiementRuul,
  saisirLotRuul,
  validerLigneRuul,
  type FundingRuul,
  type LigneLot,
  type PosteurRuul,
} from "./api";
import { dollars, jourMois, LIBELLE_STATUT, lignesCsvRuul, lireExportRuul } from "./logique";

const CLES = [["ruul-tableau"], ["ruul-posteurs"], ["ruul-lot"], ["ruul-verif"]];

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
      <VerifRuulCarte />
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
  // 0694 : les posteurs arrêtés (Kill du samedi, arrêt par le posteur, 14 jours inactif), le plus récent d'abord.
  const arretes = q.data.filter((p) => !p.actif && p.arret).sort((a, b) => (b.arret!.at > a.arret!.at ? 1 : -1));

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
        {arretes.length > 0 ? (
          <div className="space-y-1 text-sm" data-testid="arretes-ruul">
            <p className="font-medium">Arrêtés ({arretes.length})</p>
            {arretes.map((p) => (
              <div key={p.poster_id} className="flex flex-wrap items-center gap-2">
                <span>{p.nom}</span>
                <span className="text-xs text-muted-foreground">
                  {libelleArret(p.arret!)}
                  {p.arret!.motif ? ` · ${p.arret!.motif}` : ""}
                  {` · dernière semaine due : ${Number(p.du) > 0 ? `${p.du} $` : "0 (pas posté)"}`}
                </span>
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

const LIBELLE_ONBOARDING_COURT: Record<string, string> = {
  READY: "READY",
  PENDING_AGREEMENTS: "contrats à signer",
  PENDING_COLLECTION_ACCOUNT: "banque à ajouter",
  PENDING_KYC: "identité à faire",
  NOT_REGISTERED: "compte pas activé",
};

const somme = (l: LigneLot, f: (s: LigneLot["semaines"][number]) => number) => l.semaines.reduce((t, s) => t + f(s), 0);

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
  // 0705 : la liste « en attente » = les reportés avec un montant dû (les 0 $ de la semaine n'y sont pas).
  const enAttente = d.reportes.filter((r) => Number(r.montant) > 0);
  const attente = enAttente.reduce((s, r) => s + Number(r.montant), 0);
  const aValider = d.lignes.filter((l) => l.valide === false);
  const devis = d.devis ?? null;

  const agir = async (f: () => Promise<{ ok: boolean; erreur?: string; error?: string } & Record<string, unknown>>, ok: string) => {
    setOccupe(true);
    setMessage(null);
    try {
      const r = await f();
      setMessage(r.ok ? ok : `Impossible : ${r.erreur ?? r.error}`);
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
          {d.lignes.length} posteur(s) · <b>{dollars(total)}</b>. Même calcul que la paie Upwork. Seuls les posteurs READY chez Ruul
          y entrent ; les autres attendent et passent au lundi suivant dès qu'ils sont READY. Les lignes inhabituelles attendent ton OK.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3" data-testid="totaux-ruul">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
            <div className="text-2xl font-semibold" data-testid="total-payable">{dollars(d.totaux?.payable ?? total)}</div>
            <div className="text-xs text-muted-foreground">
              Payable (READY) · {d.totaux?.nb_payable ?? d.lignes.length} posteur(s)
              {d.totaux?.pret !== undefined ? ` · prêt à envoyer ${dollars(d.totaux.pret)} (${d.totaux.nb_pret ?? 0})` : ""}
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
            <div className="text-2xl font-semibold" data-testid="total-attente">{dollars(d.totaux?.en_attente ?? attente)}</div>
            <div className="text-xs text-muted-foreground">
              En attente (pas encore READY) · {d.totaux?.nb_en_attente ?? new Set(enAttente.map((r) => r.poster_id)).size} posteur(s)
            </div>
          </div>
          <div className="rounded-lg border px-3 py-2" data-testid="total-frais">
            <div className="text-2xl font-semibold">
              {devis?.payment.total != null ? `${Number(devis.payment.total).toFixed(2)} ${devis.currency}` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {devis
                ? `Total à virer, frais Ruul compris (${devis.lignes} ligne(s), ${dollars(devis.net_usd)} nets)${devis.env === "sandbox" ? " · SANDBOX" : ""}`
                : "Total avec les frais : clique « Calculer les frais »"}
            </div>
          </div>
        </div>
        {d.lot?.ruul_batch_id ? (
          <div className="space-y-2 text-sm" data-testid="paiement-ruul">
            <p>
              Paiement Ruul n° <b>{d.lot.ruul_batch_id}</b>{d.lot.ruul_env === "sandbox" ? " (SANDBOX)" : ""} · statut <b>{d.lot.ruul_statut ?? "?"}</b>
              {d.lot.ruul_resume?.byStatus
                ? ` · ${Object.entries(d.lot.ruul_resume.byStatus).map(([k, n]) => `${n} ${k}`).join(", ")}`
                : ""}
            </p>
            {d.lot.ruul_funding ? <VirementRuul funding={d.lot.ruul_funding} /> : null}
          </div>
        ) : d.lot?.ruul_envoi?.resultat === "inconnu" ? (
          <p className="text-sm text-amber-700" data-testid="envoi-inconnu">
            Le dernier envoi à Ruul n'a pas eu de réponse claire. Reclique « Créer le paiement Ruul » : le même envoi repart, sans doublon.
          </p>
        ) : null}
        {aValider.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm" data-testid="a-valider-ruul">
            <p className="font-medium">À valider avant l'envoi ({aValider.length})</p>
            {aValider.map((l) => (
              <div key={l.poster_id} className="flex flex-wrap items-center gap-2">
                <span>{l.nom} · {dollars(l.total)} · {(l.a_verifier ?? []).join(" · ")}</span>
                {statut === "prepare" ? (
                  <Button size="sm" variant="outline" disabled={occupe}
                    onClick={() => void agir(() => validerLigneRuul(l.poster_id, d.semaine, true), `${l.nom} : validé.`)}>
                    OK
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
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
          {statut === "prepare" && (d.totaux?.nb_pret ?? 0) > 0 ? (
            <Button size="sm" variant="outline" disabled={occupe}
              onClick={() => void agir(() => devisLotRuul(d.semaine), "Frais calculés par Ruul (rien n'est créé chez Ruul).")}>
              Calculer les frais
            </Button>
          ) : null}
          {statut === "prepare" && !d.lot?.ruul_batch_id && ((devis && (d.totaux?.nb_pret ?? 0) > 0) || d.lot?.ruul_envoi?.resultat === "inconnu") ? (
            <Button
              size="sm"
              disabled={occupe}
              data-testid="creer-paiement-ruul"
              onClick={() => {
                const dus = devis?.payment.total != null ? Number(devis.payment.total).toFixed(2) : "?";
                if (!window.confirm(`Créer le paiement Ruul : ${d.totaux?.nb_pret} posteur(s), ${dollars(d.totaux?.pret ?? 0)} nets, ${dus}${devis ? ` ${devis.currency}` : ""} à virer frais compris. Ruul crée les factures ; l'argent part seulement quand tu fais le virement. Continuer ?`)) return;
                void agir(() => creerPaiementRuul(d.semaine), "Paiement créé chez Ruul : fais le virement ci-dessous depuis Qonto.");
              }}
            >
              Créer le paiement Ruul
            </Button>
          ) : null}
          {d.lot?.ruul_batch_id ? (
            <Button size="sm" variant="outline" disabled={occupe}
              onClick={() => void agir(() => relirePaiementRuul(d.semaine), "Statuts relus chez Ruul.")}>
              Relire chez Ruul
            </Button>
          ) : null}
          {d.lignes.length > 0 ? (
            <Button size="sm" variant="outline"
              onClick={() => telechargerCsv(`ruul-${d.semaine}.csv`, versCsv(["email", "description", "amount", "currency"], lignesCsvRuul(d.semaine, d.lignes)))}>
              Export CSV (format Ruul)
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
            <table className="w-full text-sm" data-testid="lignes-ruul">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {["Nom", "Email Ruul", "Statut Ruul", "Comptes", "Posts faits / prévus", "Tarif", "Retenue", "Bonus", "Semaine(s)", "Pourquoi ce montant", "TOTAL net", "OK"].map((h) => (
                    <th key={h} className="py-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.lignes.map((l) => {
                  const bonus = l.semaines.flatMap((s) => s.bonus_detail ?? []);
                  const tarifs = [...new Set(l.semaines.map((s) => s.tarif).filter((t) => t != null))];
                  return (
                    <tr key={l.poster_id} className="border-b border-border/40 align-top">
                      <td className="py-1.5 pr-3 font-medium">{l.nom}</td>
                      <td className="py-1.5 pr-3">{l.ruul_email ?? <span className="text-destructive">manquant</span>}</td>
                      <td className="py-1.5 pr-3">{l.ruul_onboarding ? LIBELLE_ONBOARDING_COURT[l.ruul_onboarding] ?? l.ruul_onboarding : "—"}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{Math.max(0, ...l.semaines.map((s) => Number(s.nb_comptes ?? 0)))}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{somme(l, (s) => Number(s.faits ?? 0))} / {somme(l, (s) => Number(s.prevus ?? 0))}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{tarifs.length ? tarifs.map((t) => `${t} $`).join(", ") : "—"}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{somme(l, (s) => Number(s.retenue ?? 0)) ? dollars(somme(l, (s) => Number(s.retenue ?? 0))) : "—"}</td>
                      <td className="py-1.5 pr-3 text-xs">
                        {bonus.length ? bonus.map((b, i) => <div key={i}>{b.type} : {dollars(b.montant)}{b.detail ? ` (${b.detail})` : ""}</div>) : "—"}
                      </td>
                      <td className="py-1.5 pr-3 text-xs">
                        {l.semaines.map((s) => (
                          <div key={s.id}>
                            {jourMois(s.semaine)} : {dollars(s.montant)}{s.rattrapage ? " · rattrapage" : ""}{s.paye_at ? " · payé" : ""}
                            {s.ecart ? <span className="text-destructive"> · {s.ecart}</span> : null}
                          </div>
                        ))}
                      </td>
                      <td className="max-w-72 py-1.5 pr-3 text-xs text-muted-foreground" data-testid="pourquoi-montant">
                        {l.semaines.map((s) => s.pourquoi ? <div key={s.id}>{l.semaines.length > 1 ? `${jourMois(s.semaine)} : ` : ""}{s.pourquoi}</div> : null)}
                      </td>
                      <td className="py-1.5 pr-3 font-semibold tabular-nums">{dollars(l.total)}</td>
                      <td className="py-1.5 pr-3 text-xs">{l.valide === false ? <span className="text-amber-600">à valider</span> : "✓"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {enAttente.length > 0 ? (
          <div className="text-sm" data-testid="reportes-ruul">
            <p className="font-medium">En attente : pas encore READY ({dollars(attente)})</p>
            <p className="text-xs text-muted-foreground">Ajoutés au paiement du lundi suivant dès qu'ils sont READY chez Ruul.</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {enAttente.map((r) => (
                <li key={`${r.poster_id}:${r.semaine}`}>
                  {r.nom} · semaine du {jourMois(r.semaine)} · <b>{dollars(r.montant)}</b> · {r.raison ?? LIBELLE_STATUT[r.ruul_statut ?? "aucun"]}
                </li>
              ))}
            </ul>
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

const LIBELLE_CHAMP: Record<string, string> = {
  beneficiaryName: "Bénéficiaire",
  bankName: "Banque",
  iban: "IBAN",
  ibanAccountNumber: "IBAN",
  bic: "BIC",
  swift: "SWIFT",
  swiftBicCode: "BIC / SWIFT",
  accountNumber: "N° de compte",
  routingNumber: "Routing",
  sortCode: "Sort code",
  bankAddress: "Adresse de la banque",
  beneficiaryAddress: "Adresse du bénéficiaire",
};

/** 0738 : le virement à faire depuis Qonto pour financer le paiement Ruul (montant, compte, référence). */
export function VirementRuul({ funding }: { funding: FundingRuul }) {
  const comptes = funding.accounts ?? [];
  return (
    <div className="space-y-2 rounded-lg border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-sm" data-testid="virement-ruul">
      <p className="font-medium">
        À virer depuis Qonto : <b>{funding.dueAmount != null ? `${Number(funding.dueAmount).toFixed(2)} ${funding.currency ?? ""}` : "?"}</b>
        {funding.reference ? <> · référence à mettre sur le virement : <b className="font-mono">{funding.reference}</b></> : null}
      </p>
      {comptes.filter((c) => !funding.currency || !c.currency || c.currency === funding.currency).map((c, i) => (
        <dl key={i} className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
          {Object.entries(c.accountDetails ?? {}).filter(([, v]) => v).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-muted-foreground">{LIBELLE_CHAMP[k] ?? k}</dt>
              <dd className="font-mono">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      ))}
      <p className="text-xs text-muted-foreground">Ruul paie chaque posteur dès que le virement arrive (et qu'il est READY).</p>
    </div>
  );
}

/** 0740 : les semaines « à vérifier » (pas payées d'office) face à l'historique des paiements Ruul. */
function VerifRuulCarte() {
  const q = useQuery({ queryKey: ["ruul-verif"], queryFn: lireVerifRuul });
  const rafraichir = useRafraichir();
  const [message, setMessage] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const lignes = (q.data ?? []).filter((p) => (p.du ?? []).some((d) => d.verif));
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const agir = async (f: () => Promise<{ ok: boolean; erreur?: string; error?: string } & Record<string, unknown>>, ok: string) => {
    setOccupe(true);
    setMessage(null);
    try {
      const r = await f();
      setMessage(r.ok ? ok : `Impossible : ${r.erreur ?? r.error}`);
      await rafraichir();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  return (
    <Card data-testid="verif-ruul">
      <CardHeader>
        <CardTitle>À vérifier avant de payer ({lignes.length})</CardTitle>
        <CardDescription>
          Semaines sorties du paiement en attendant ta décision, avec ce que Ruul a déjà versé à chacun (historique Ruul).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Button size="sm" variant="outline" disabled={occupe}
          onClick={() => void agir(() => importerHistoriqueRuul(), "Historique Ruul importé.")}>
          Importer l'historique Ruul
        </Button>
        {message ? <p role="status">{message}</p> : null}
        {lignes.length === 0 ? <p className="text-muted-foreground">Rien à vérifier.</p> : lignes.map((p) => (
          <div key={p.poster_id} className="space-y-1 rounded-lg border px-3 py-2" data-testid="verif-posteur">
            <p className="font-medium">{p.nom} <span className="text-xs text-muted-foreground">{p.ruul_email}</span></p>
            {(p.du ?? []).filter((d) => d.verif).map((d) => (
              <div key={d.semaine} className="flex flex-wrap items-center gap-2">
                <span>Semaine du {jourMois(d.semaine)} : <b>{dollars(d.montant)}</b> ({d.faits ?? 0} posts)</span>
                <Button size="sm" variant="outline" disabled={occupe}
                  onClick={() => void agir(() => deciderVerifRuul(p.poster_id, d.semaine, "payer"), `${p.nom} : semaine du ${jourMois(d.semaine)} au prochain lot.`)}>
                  À payer
                </Button>
                <Button size="sm" variant="outline" disabled={occupe}
                  onClick={() => void agir(() => deciderVerifRuul(p.poster_id, d.semaine, "deja_paye"), `${p.nom} : semaine du ${jourMois(d.semaine)} déjà payée.`)}>
                  Déjà payé
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Ruul a déjà versé : {(p.ruul ?? []).length === 0 ? "rien (ou historique pas importé)" : (p.ruul ?? []).map((t) =>
                `${t.date ? new Date(t.date).toLocaleDateString("fr-FR") : "?"} ${t.montant ?? "?"} ${t.devise ?? ""} ${t.statut ?? ""}${t.tno ? ` (#${t.tno})` : ""}`).join(" · ")}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
