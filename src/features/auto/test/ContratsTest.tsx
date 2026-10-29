import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";

import {
  ajouterContratTest,
  type ContratTest,
  creerPosteurTest,
  lancerTest,
  LANCEMENTS_TEST,
  type LancementTest,
  lireContratsTest,
  retirerContratTest,
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
        <BoutonsTest posterId={c.poster_id!} />
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
