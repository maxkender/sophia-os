import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";
import { etapeOk, financerJalonTest, payerSemaineTest } from "@/features/paie/api-upwork/api";

import {
  ajouterContratTest,
  type ContratTest,
  creerPosteurTest,
  lancerTest,
  LANCEMENTS_TEST,
  type LancementTest,
  lireContratsTest,
  retirerContratTest,
  testerFermeture,
} from "./api";

/**
 * Prompt 25 v4 : « Run now » sur le posteur de test. Chaque bouton demande
 * une confirmation, puis le message part tout de suite, pour de vrai (Slack
 * s'il y est, et Upwork), quel que soit l'interrupteur. Noté dans les Logs
 * (type « test_… »).
 */
export function BoutonsTest({ posterId }: { posterId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [bilan, setBilan] = React.useState<string | null>(null);
  const lancer = useMutation({
    mutationFn: (quoi: LancementTest) => lancerTest(posterId, quoi),
    onSuccess: (r, quoi) => {
      setBilan(
        r.ok
          ? t("autoTest.lance", { quoi: t(`autoTest.boutons.${quoi}`), canaux: (r.partis ?? []).join(" + ") || "—" })
          : t("autoTest.echec", { erreur: r.error ?? (r.erreurs ?? []).join(" · ") }),
      );
      void qc.invalidateQueries({ queryKey: ["contrats-test"] });
    },
  });
  return (
    <div className="space-y-1.5" data-testid="boutons-test">
      <div className="flex flex-wrap gap-1.5">
        {LANCEMENTS_TEST.map((quoi) => (
          <Button
            key={quoi}
            size="xs"
            variant={quoi === "reset" ? "outline" : "secondary"}
            disabled={lancer.isPending}
            data-lancer={quoi}
            onClick={() => {
              if (window.confirm(t(quoi === "reset" ? "autoTest.confirmReset" : "autoTest.confirm", { quoi: t(`autoTest.boutons.${quoi}`) }))) {
                lancer.mutate(quoi);
              }
            }}
          >
            {t(`autoTest.boutons.${quoi}`)}
          </Button>
        ))}
      </div>
      {bilan && <p className="text-xs">{bilan}</p>}
      {lancer.error && <p className="text-xs text-destructive">{(lancer.error as Error).message}</p>}
    </div>
  );
}

/**
 * Prompt 26 : « Pay this week » : la milestone financée du contrat de test est
 * approuvée et la semaine suivante financée, pour de vrai, dans les plafonds.
 */
function PayerSemaineTest({ contratId }: { contratId: string }) {
  const { t } = useTranslation();
  const payer = useMutation({ mutationFn: () => payerSemaineTest(contratId) });
  const r = payer.data;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="payer-semaine-test">
      <Button
        size="xs"
        loading={payer.isPending}
        onClick={() => {
          if (window.confirm(t("autoTest.payerConfirm", { contrat: contratId }))) payer.mutate();
        }}
      >
        {t("autoTest.payer")}
      </Button>
      {r && (
        <span className={r.ok ? "text-xs text-success-foreground" : "text-xs text-destructive"} role="status">
          {r.ok
            ? t(r.a_financer ? "autoTest.payeAFinancer" : "autoTest.paye", { semaine: r.semaine })
            : t("autoTest.pasPaye", { raison: r.raison ?? r.error ?? r.resultat ?? "?" })}
        </span>
      )}
      {payer.error && <span className="text-xs text-destructive">{(payer.error as Error).message}</span>}
      {/* Chaque clic : la milestone financée payée, la suivante financée (créée si elle n'existe pas). */}
      {r?.etapes && r.etapes.length > 0 && (
        <table className="w-full text-xs" data-testid="etapes-paie-test">
          <tbody>
            {r.etapes.map((e, i) => (
              <tr key={i} className="border-t align-top">
                <td className="py-0.5 pr-2 font-medium">{t(`autoTest.etapes.${e.etape}`, { defaultValue: e.etape })}</td>
                {/* 0467 : « OK » seulement si la relecture d'Upwork le confirme (financer : Active). */}
                <td className={cn("py-0.5 pr-2", etapeOk(e) ? "text-success-foreground" : "text-destructive")}>{etapeOk(e) ? "OK" : t("autoTest.echecEtape")}</td>
                <td className="py-0.5 pr-2">{[e.nom, e.montant !== undefined ? `${e.montant} $` : null].filter(Boolean).join(" · ")}</td>
                <td className="py-0.5 break-all text-muted-foreground">
                  {[e.etat ? `state: ${e.etat}` : null, e.erreur ?? null, e.reponse ? JSON.stringify(e.reponse).slice(0, 200) : null].filter(Boolean).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r?.droit_manquant && <p className="w-full text-xs text-destructive">{t("autoTest.droitManquant", { erreur: r.droit_manquant })}</p>}
      {r?.jalons && (
        <p className="w-full text-xs text-muted-foreground" data-testid="jalons-apres">
          {r.jalons.map((j) => `${j.nom} · ${j.etat} · ${j.depot ?? "?"} $${j.echeance ? ` · due ${j.echeance.slice(0, 10)}` : ""}`).join(" | ")}
        </p>
      )}
    </div>
  );
}

/**
 * 0467 : « Fund this milestone (test) » : seulement le financement de la
 * milestone NotFunded, puis Upwork relu. OK seulement si l'état relu est
 * financé (Active) ; sinon ÉCHEC avec la requête et la réponse d'Upwork.
 */
function FinancerJalonTest({ contratId }: { contratId: string }) {
  const { t } = useTranslation();
  const financer = useMutation({ mutationFn: () => financerJalonTest(contratId) });
  const r = financer.data;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="financer-jalon-test">
      <Button
        size="xs"
        variant="outline"
        loading={financer.isPending}
        onClick={() => {
          if (window.confirm(t("autoTest.financerConfirm", { contrat: contratId }))) financer.mutate();
        }}
      >
        {t("autoTest.financer")}
      </Button>
      {r && (
        <span className={r.ok ? "text-xs text-success-foreground" : "text-xs text-destructive"} role="status">
          {r.ok
            ? t("autoTest.finance", { nom: r.jalon?.nom ?? "?", etat: r.etat_relu ?? "?" })
            : t("autoTest.pasFinance", { raison: r.erreur ?? r.error ?? "?", etat: r.etat_relu ?? "?" })}
        </span>
      )}
      {financer.error && <span className="text-xs text-destructive">{(financer.error as Error).message}</span>}
      {r?.requete !== undefined && (
        <pre className="w-full overflow-x-auto rounded-md bg-muted/40 p-2 text-[11px]" data-testid="financer-reponse">
          {`request: ${JSON.stringify(r.requete)}\nresponse: ${JSON.stringify(r.reponse)}`}
        </pre>
      )}
    </div>
  );
}

/**
 * Prompt 13 : tester la fermeture d'un contrat de test, pour de vrai, chacun
 * avec sa confirmation : Kill & pay (milestone approuvée, puis contrat fermé)
 * ou Kill & don't pay (contrat fermé, milestone toujours financée). Le bilan est
 * relu chez Upwork ; les réponses complètes sont dans les Logs.
 */
function FermerContratTest({ contratId }: { contratId: string }) {
  const { t } = useTranslation();
  const fermer = useMutation({ mutationFn: (mode: "payer" | "sans_payer") => testerFermeture(contratId, mode) });
  const r = fermer.data;
  const b = r?.bilan;
  return (
    <div className="space-y-1" data-testid="fermer-contrat-test">
      <div className="flex flex-wrap gap-1.5">
        {(["payer", "sans_payer"] as const).map((mode) => (
          <Button
            key={mode}
            size="xs"
            variant="outline"
            disabled={fermer.isPending}
            data-fermer={mode}
            onClick={() => {
              if (window.confirm(t(`autoTest.fermer.confirm_${mode}`, { contrat: contratId }))) fermer.mutate(mode);
            }}
          >
            {t(`autoTest.fermer.${mode}`)}
          </Button>
        ))}
      </div>
      {r && !r.ok && <p className="text-xs text-destructive">{t("autoTest.fermer.echec", { erreur: r.error ?? "?" })}</p>}
      {b && (
        <p className="text-xs" role="status">
          {t("autoTest.fermer.bilan", {
            statut: b.contrat_statut,
            paye: b.paye_par_ce_test,
            remboursement: b.remboursement,
            requis: b.champs_obligatoires_fermeture.join(", ") || "—",
            feedback: t(`autoTest.fermer.${b.feedback_obligatoire ? "oui" : "non"}`),
            raison: t(`autoTest.fermer.${b.raison_obligatoire ? "oui" : "non"}`),
          })}
        </p>
      )}
      {fermer.error && <p className="text-xs text-destructive">{(fermer.error as Error).message}</p>}
    </div>
  );
}

function LigneContrat({ c }: { c: ContratTest }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [prenom, setPrenom] = React.useState("");
  const recharger = () => void qc.invalidateQueries({ queryKey: ["contrats-test"] });
  const creer = useMutation({ mutationFn: () => creerPosteurTest(c.contrat_id, prenom), onSuccess: recharger });
  const retirer = useMutation({ mutationFn: () => retirerContratTest(c.contrat_id), onSuccess: recharger });
  const actif = c.poster_id && c.poster_actif;
  return (
    <li className="space-y-2 p-3" data-contrat-test={c.contrat_id}>
      <div className="flex flex-wrap items-center gap-2">
        <a
          className="font-mono text-xs underline"
          href={`https://www.upwork.com/nx/wm/workroom/${c.contrat_id}/overview`}
          target="_blank"
          rel="noreferrer"
        >
          {c.contrat_id}
        </a>
        {actif ? (
          <>
            <Badge variant="info">{c.poster_nom ?? "TEST"}</Badge>
            <span className="text-xs text-muted-foreground">
              {t("autoTest.detail", { cohorte: c.cohorte_lundi ?? "—", email: c.email ?? "—", slack: t(c.slack ? "autoTest.surSlack" : "autoTest.pasSlack") })}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t("autoTest.sansPosteur")}</span>
        )}
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          disabled={retirer.isPending}
          onClick={() => {
            if (window.confirm(t("autoTest.confirmRetirer", { contrat: c.contrat_id }))) retirer.mutate();
          }}
        >
          {t("autoTest.retirer")}
        </Button>
      </div>
      {actif ? (
        <>
          <BoutonsTest posterId={c.poster_id!} />
          <FinancerJalonTest contratId={c.contrat_id} />
          <PayerSemaineTest contratId={c.contrat_id} />
          <FermerContratTest contratId={c.contrat_id} />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-40"
            value={prenom}
            placeholder={t("autoTest.prenom")}
            aria-label={t("autoTest.prenom")}
            onChange={(e) => setPrenom(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!prenom.trim() || creer.isPending}
            onClick={() => {
              if (window.confirm(t("autoTest.confirmCreer", { nom: `TEST ${prenom.trim()}`, contrat: c.contrat_id }))) creer.mutate();
            }}
          >
            {t("autoTest.creer")}
          </Button>
        </div>
      )}
      {(creer.error || retirer.error) && <p className="text-xs text-destructive">{((creer.error ?? retirer.error) as Error).message}</p>}
    </li>
  );
}

/**
 * Prompt 25 v4 : Overview → « Test contracts » (admin). Sur ces contrats, la
 * bienvenue et les relances partent pour de vrai même si l'interrupteur est
 * sur Test ou Approve. Un contrat relié à un vrai posteur actif est refusé.
 */
export function ContratsTest() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [saisie, setSaisie] = React.useState("");
  const lu = useQuery({ queryKey: ["contrats-test"], queryFn: lireContratsTest, enabled: role === "admin" });
  const ajouter = useMutation({
    mutationFn: () => ajouterContratTest(saisie),
    onSuccess: () => {
      setSaisie("");
      void qc.invalidateQueries({ queryKey: ["contrats-test"] });
    },
  });
  if (role !== "admin") return null;
  const liste = lu.data ?? [];
  return (
    <Card data-testid="contrats-test">
      <CardHeader>
        <CardTitle className="text-base">{t("autoTest.titre")}</CardTitle>
        <CardDescription>{t("autoTest.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {liste.length > 0 && (
          <ul className="divide-y rounded-md border">
            {liste.map((c) => (
              <LigneContrat key={c.contrat_id} c={c} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 max-w-sm"
            value={saisie}
            placeholder={t("autoTest.ajouterAide")}
            aria-label={t("autoTest.ajouterAide")}
            onChange={(e) => setSaisie(e.target.value)}
          />
          <Button size="sm" disabled={!saisie.trim() || ajouter.isPending} onClick={() => ajouter.mutate()}>
            {t("autoTest.ajouter")}
          </Button>
        </div>
        {ajouter.error && <p className="text-destructive">{(ajouter.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}
