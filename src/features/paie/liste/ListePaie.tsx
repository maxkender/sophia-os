import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, Download, ExternalLink, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { BarreChargement } from "@/components/ui/progress";
import { lireBonus, lireReglagesBonus, marquerBonusPaye } from "@/features/bonus/api";
import { prochainLundiBonus } from "@/features/bonus/logique";
import { semaineIso } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { marquerPayee, marquerSemaineSuivante } from "@/features/paie/api";
import { dollars } from "@/features/paie/logique";
import { Case, CelluleContrat } from "@/features/paie/TableauPaie";
import { supabase } from "@/lib/supabase/client";
import { telechargerCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

import { corrigerPaie, exclurePaie, lireListePaie, type ActionPaie, type LigneListePaie } from "./api";
import { csvListe, parEquipe, postsParCompte, totauxPaie } from "./logique";

const TH = "px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const TD = "px-2 py-2 align-top";

const VARIANTE_ACTION: Record<ActionPaie, "success" | "warning" | "error" | "info" | "secondary" | "outline"> = {
  payer: "success",
  payer_moins: "warning",
  kill: "error",
  modifier: "info",
  annuler: "error",
  rien: "secondary",
};

/** « Modifier le montant » (raison obligatoire) et « Retirer de la liste », journalisés (0380). */
function MenuLigne({ l }: { l: LigneListePaie }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [montant, setMontant] = React.useState(String(l.montant));
  const [raison, setRaison] = React.useState("");
  const action = useMutation({
    mutationFn: (quoi: "montant" | "calcul" | "retirer" | "remettre") =>
      quoi === "montant"
        ? corrigerPaie(l.id, Number(montant), raison)
        : quoi === "calcul"
          ? corrigerPaie(l.id, null, raison)
          : exclurePaie(l.id, quoi === "retirer", raison),
    onSuccess: () => {
      setOuvert(false);
      setRaison("");
      void queryClient.invalidateQueries({ queryKey: ["paie"] });
    },
  });
  const raisonOk = raison.trim().length > 0;
  const montantOk = montant.trim() !== "" && Number(montant) >= 0;
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={Boolean(l.paye_at)}
        aria-label={t("paie.liste.menu", { nom: l.poster_nom ?? "" })}
        onClick={() => setOuvert(true)}
      >
        <MoreHorizontal className="size-4" />
      </Button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{l.poster_nom}</DialogTitle>
            <DialogDescription>
              {t("paie.liste.cols.montant")} : {dollars(l.montant, i18n.resolvedLanguage ?? "fr")}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3 pb-5">
            <label className="block space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">{t("paie.liste.raison")}</span>
              <Input value={raison} onChange={(e) => setRaison(e.target.value)} aria-label={t("paie.liste.raison")} />
            </label>
            {!l.exclu && (
              <div className="flex items-end gap-2">
                <label className="flex-1 space-y-1 text-sm">
                  <span className="text-xs text-muted-foreground">{t("paie.liste.nouveauMontant")}</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    aria-label={t("paie.liste.nouveauMontant")}
                  />
                </label>
                <Button
                  size="sm"
                  disabled={!raisonOk || !montantOk || action.isPending}
                  onClick={() => action.mutate("montant")}
                >
                  {t("paie.liste.modifierMontant")}
                </Button>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {l.montant_corrige !== null && (
                <Button size="sm" variant="ghost" disabled={action.isPending} onClick={() => action.mutate("calcul")}>
                  {t("paie.liste.revenirCalcul")}
                </Button>
              )}
              {l.exclu ? (
                <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate("remettre")}>
                  {t("paie.liste.remettre")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!raisonOk || action.isPending}
                  onClick={() => action.mutate("retirer")}
                >
                  {t("paie.liste.retirer")}
                </Button>
              )}
            </div>
            {action.isError && <p className="text-sm text-destructive">{(action.error as Error).message}</p>}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function LignePaie({ l, semaine }: { l: LigneListePaie; semaine: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const texteAction =
    l.action === "payer_moins" ? t("paie.liste.actions.payer_moins", { retenue: dollars(l.retenue, langue) }) : t(`paie.liste.actions.${l.action}`);
  return (
    <tr data-paie={l.poster_nom ?? l.id} className={cn(l.exclu && "opacity-60", l.paye_at && "bg-success/5")}>
      <td className={cn(TD, "font-medium")}>
        {l.poster_nom}
        {l.exclu && (
          <p className="text-xs font-normal text-destructive-foreground">{t("paie.liste.retire", { raison: l.exclu_raison })}</p>
        )}
        {l.statut === "a_voir" && l.raison && <p className="text-xs font-normal text-warning-foreground">{l.raison}</p>}
      </td>
      <td className={TD}>
        <CelluleContrat posterId={l.poster_id} lien={l.contrat_url} />
      </td>
      <td className={cn(TD, "tabular-nums")}>{l.nb_comptes}</td>
      <td className={cn(TD, "text-xs tabular-nums")}>{postsParCompte(l) || "—"}</td>
      <td className={cn(TD, "tabular-nums")}>{l.tarif === null ? "—" : dollars(l.tarif, langue)}</td>
      <td className={cn(TD, "tabular-nums")}>{l.retenue > 0 ? `−${dollars(l.retenue, langue)}` : "—"}</td>
      <td className={cn(TD, "tabular-nums")}>
        <span className="font-semibold">{dollars(l.montant, langue)}</span>
        {l.montant_corrige !== null && (
          <p className="text-xs text-muted-foreground">
            {t("paie.liste.corrige", { raison: l.raison_correction, calcule: dollars(l.montant_calcule, langue) })}
          </p>
        )}
      </td>
      <td className={TD} title={t(`paie.liste.aides.${l.action}`, { semaine: semaineIso(ajouterJours(semaine, 7)) })}>
        <Badge variant={VARIANTE_ACTION[l.action]}>{texteAction}</Badge>
        <p className="mt-0.5 max-w-52 text-[11px] text-muted-foreground">
          {t(`paie.liste.aides.${l.action}`, { semaine: semaineIso(ajouterJours(semaine, 7)) })}
        </p>
      </td>
      <td className={TD}>
        {!l.exclu && (
          <Case
            coche={Boolean(l.paye_at)}
            libelle={t("paie.liste.cols.paye")}
            aideAnnuler={t("paie.liste.cols.paye")}
            basculer={(c) => marquerPayee(l.id, c)}
          />
        )}
      </td>
      <td className={TD}>
        {!l.exclu && (
          <Case
            coche={Boolean(l.semaine_suivante_faite_at)}
            libelle={t("paie.liste.cols.suivante")}
            aideAnnuler={t("paie.liste.cols.suivante")}
            basculer={(c) => marquerSemaineSuivante(l.id, c)}
          />
        )}
      </td>
      <td className={cn(TD, "w-8")}>
        <MenuLigne l={l} />
      </td>
    </tr>
  );
}

function Tableau({ lignes, semaine }: { lignes: LigneListePaie[]; semaine: string }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="bg-muted/40">
          <tr className="border-b">
            {(["posteur", "contrat", "comptes", "posts", "tarif", "retenue", "montant", "action", "paye", "suivante"] as const).map(
              (c) => (
                <th key={c} className={TH}>
                  {t(`paie.liste.cols.${c}`)}
                </th>
              ),
            )}
            <th className={TH} />
          </tr>
        </thead>
        <tbody className="divide-y">
          {lignes.map((l) => (
            <LignePaie key={l.id} l={l} semaine={semaine} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Le bloc Comment Masters, seulement le lundi bonus (0374, compteur de 0373). */
function BlocCommentMasters({ lundi }: { lundi: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const donnees = useQuery({
    queryKey: ["paie", "bonus-cm", lundi],
    queryFn: async () => {
      const lignes = (await lireBonus(lundi)).filter((b) => b.type === "comment_master");
      const ids = lignes.map((l) => l.poster_id);
      const [noms, mandats] = await Promise.all([
        ids.length
          ? supabase.from("profiles").select("id, prenom, nom").in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? supabase.from("comment_master_mandats").select("profile_id, langue").in("profile_id", ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const langues = new Map<string, string[]>();
      for (const m of mandats.data ?? []) {
        const id = m.profile_id as string;
        if (!langues.get(id)?.includes(m.langue as string)) langues.set(id, [...(langues.get(id) ?? []), m.langue as string]);
      }
      return {
        lignes,
        noms: new Map((noms.data ?? []).map((p) => [p.id as string, [p.prenom, p.nom].filter(Boolean).join(" ")])),
        langues: new Map([...langues].map(([id, ls]) => [id, ls.join(", ")])),
      };
    },
  });
  const fmt = new Intl.DateTimeFormat(langue, { day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <Card data-testid="paie-bloc-cm">
      <CardHeader>
        <CardTitle>{t("paie.liste.cm.titre", { date: fmt.format(new Date(`${lundi}T12:00:00Z`)) })}</CardTitle>
        <CardDescription>{t("paie.liste.cm.desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {donnees.data && donnees.data.lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("paie.liste.cm.aucun")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  {(["nom", "pays", "contrat", "done", "montant", "action", "paye"] as const).map((c) => (
                    <th key={c} className={TH}>
                      {t(`paie.liste.cm.cols.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(donnees.data?.lignes ?? []).map((b) => (
                  <tr key={b.id} data-cm={b.poster_id}>
                    <td className={cn(TD, "font-medium")}>{donnees.data!.noms.get(b.poster_id) ?? "—"}</td>
                    <td className={TD}>{donnees.data!.langues.get(b.poster_id) ?? "—"}</td>
                    <td className={TD}>
                      {b.contrat_url ? (
                        <a
                          href={b.contrat_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                        >
                          {t("paie.contrat")}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-xs font-medium text-destructive">{t("paie.lienManquant")}</span>
                      )}
                    </td>
                    <td className={cn(TD, "tabular-nums")}>
                      {b.quantite}
                      {b.verifies !== null && (
                        <p className="text-xs text-muted-foreground">{t("paie.liste.cm.verifies", { n: b.verifies })}</p>
                      )}
                    </td>
                    <td className={cn(TD, "font-semibold tabular-nums")}>{dollars(b.montant, langue)}</td>
                    <td className={TD}>
                      <Badge variant="info">{t("paie.liste.cm.action")}</Badge>
                    </td>
                    <td className={TD}>
                      <Case
                        coche={b.statut === "paye"}
                        libelle={t("paie.liste.cols.paye")}
                        aideAnnuler={t("paie.liste.cols.paye")}
                        basculer={(c) => marquerBonusPaye(b.id, c)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * La liste de paie du lundi (0380), pour l'admin et le Head of Ops : une
 * seule liste pour la semaine `semaine` (son lundi), un bloc repliable par
 * équipe avec son total, le total général en haut, et le bloc Comment Masters
 * le lundi bonus.
 */
export function ListePaie({ semaine }: { semaine: string }) {
  const { t, i18n } = useTranslation();
  const langue = i18n.resolvedLanguage ?? "fr";
  const liste = useQuery({ queryKey: ["paie", "liste", semaine], queryFn: () => lireListePaie(semaine) });
  const reglagesBonus = useQuery({ queryKey: ["reglages", "bonus"], queryFn: lireReglagesBonus });
  const lundiPaie = ajouterJours(semaine, 7);
  const lundiBonus =
    reglagesBonus.data && prochainLundiBonus(lundiPaie, reglagesBonus.data.premier_lundi) === lundiPaie;
  const lignes = liste.data ?? [];
  const equipes = parEquipe(lignes);
  const tot = totauxPaie(lignes);
  const texteAction = (l: LigneListePaie) =>
    l.action === "payer_moins" ? t("paie.liste.actions.payer_moins", { retenue: dollars(l.retenue, langue) }) : t(`paie.liste.actions.${l.action}`);
  const exporter = (ls: LigneListePaie[], nom: string) =>
    telechargerCsv(`paie_${nom}_${semaine}.csv`, csvListe(ls, texteAction));
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  return (
    <div className="space-y-4" data-testid="liste-paie">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium tabular-nums">
          {t("paie.liste.totalGeneral", {
            total: dollars(tot.total, langue),
            reste: dollars(tot.reste, langue),
            payees: tot.payees,
            lignes: tot.lignes,
          })}
        </p>
        <Button variant="outline" size="sm" disabled={lignes.length === 0} onClick={() => exporter(lignes, "tout")}>
          <Download />
          {t("paie.liste.exporter")}
        </Button>
      </div>

      {liste.isLoading && <BarreChargement actif />}
      {liste.error && <p className="text-sm text-destructive">{(liste.error as Error).message}</p>}
      {liste.data && lignes.length === 0 && <p className="text-sm text-muted-foreground">{t("paie.liste.vide")}</p>}

      {equipes.map((e) => (
        <details key={e.equipe ?? "aucune"} open className="group rounded-xl border bg-card" data-equipe={e.equipe ?? ""}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
            <ChevronDown className="size-4 transition-transform group-[:not([open])]:-rotate-90" aria-hidden />
            <span className="font-medium">{e.equipe ?? t("paie.liste.sansEquipe")}</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {t("paie.liste.totalEquipe", { total: dollars(e.totaux.total, langue), reste: dollars(e.totaux.reste, langue) })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={(ev) => {
                ev.preventDefault();
                exporter(e.lignes, slug(e.equipe ?? "sans-equipe"));
              }}
            >
              <Download />
              {t("paie.liste.exporterEquipe")}
            </Button>
          </summary>
          <div className="px-4 pb-4">
            <Tableau lignes={e.lignes} semaine={semaine} />
          </div>
        </details>
      ))}

      {lundiBonus && <BlocCommentMasters lundi={lundiPaie} />}
    </div>
  );
}
