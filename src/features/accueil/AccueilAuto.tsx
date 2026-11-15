import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/AuthContext";
import { listerHms } from "@/features/ckd/api";
import { lireInterrupteurs } from "@/features/interrupteurs/api";
import { ChampPaysCompte } from "@/features/moteur/ChampPaysCompte";
import { LANGUES_CIBLES, nomLangue } from "@/features/moteur/langues";
import { nomPaysIso, paysParDefaut, paysTries } from "@/features/moteur/pays";
import { cn } from "@/lib/utils";

import { LiaisonsContrats } from "./LiaisonsContrats";
import {
  amorcerAnnonces,
  ecarterAccueil,
  enregistrerAnnonce,
  lireAccueils,
  lireAnnonces,
  localiserAccueils,
  relierAccueil,
  type Accueil,
  type AnnoncePays,
} from "./api";
import { estARelier, LANGUE_DU_PAYS, questionARelier } from "./aRelier";

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

const VARIANTE: Record<Accueil["statut"], "success" | "warning" | "error" | "info" | "secondary"> = {
  simule: "info",
  a_relier: "warning",
  a_creer: "info",
  doublon: "secondary",
  cree: "info",
  envoi: "info",
  envoye: "success",
  erreur: "error",
};

/** Le pays envoyé : celui choisi, sinon celui de la langue. */
function paysDe(langue: string, choisi: string): string {
  return choisi || paysParDefaut(langue) || "";
}

/**
 * 12/11 (Max) : un contrat n'arrive ici que si le pays est introuvable ou fermé.
 * Une seule question ; la langue vient du pays, la HM de la règle (la moins chargée).
 */
function LigneARelier({ a }: { a: Accueil }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pays, setPays] = React.useState("");
  const nom = [a.prenom, a.nom].filter(Boolean).join(" ") || a.contrat_id;
  const question = questionARelier(a);
  const choix = React.useMemo(
    () => paysTries().filter((p) => LANGUE_DU_PAYS[p.code]),
    [],
  );
  const fini = () => qc.invalidateQueries({ queryKey: ["accueils"] });
  const relier = useMutation({
    // HM nulle : la règle la choisit au passage suivant ; le pays donné à la main n'est plus « fermé ».
    mutationFn: (p: string) => relierAccueil(a.contrat_id, p, LANGUE_DU_PAYS[p] ?? a.langue ?? "", null, question === "pays"),
    onSuccess: fini,
  });
  const ecarter = useMutation({ mutationFn: () => ecarterAccueil(a.contrat_id, `pays fermé (${a.pays})`), onSuccess: fini });
  return (
    <li className="space-y-2 px-3 py-3" data-a-relier={a.contrat_id}>
      {question === "ferme" ? (
        <>
          <p className="text-sm font-medium">{t("accueil.question.ferme", { nom, pays: nomPaysIso(a.pays) || a.pays })}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={relier.isPending || ecarter.isPending} onClick={() => relier.mutate(a.pays!)}>{t("accueil.question.creer")}</Button>
            <Button size="sm" variant="outline" disabled={relier.isPending || ecarter.isPending} onClick={() => ecarter.mutate()}>{t("accueil.question.ecarter")}</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">{t("accueil.question.pays", { nom })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectClass} value={pays} onChange={(e) => setPays(e.target.value)} aria-label={t("accueil.question.choisirPays")}>
              <option value="">{t("accueil.question.choisirPays")}</option>
              {choix.map((p) => <option key={p.code} value={p.code}>{p.nom}</option>)}
            </select>
            <Button size="sm" className="h-8" disabled={!pays || relier.isPending} onClick={() => relier.mutate(pays)}>{t("accueil.question.valider")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{a.job_titre ?? ""}{a.job_titre ? " · " : ""}{t("accueil.question.aideRegle")}</p>
        </>
      )}
      {(relier.isError || ecarter.isError) && <p className="text-xs text-destructive">{((relier.error ?? ecarter.error) as Error).message}</p>}
    </li>
  );
}

/** Une annonce : langue, pays, HM, tarif, générique. */
function LigneAnnonce({ a, hms }: { a: AnnoncePays; hms: { id: string; nom: string }[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [langue, setLangue] = React.useState(a.langue ?? "");
  const [pays, setPays] = React.useState(a.pays ?? "");
  const [hm, setHm] = React.useState(a.hm_id ?? "");
  const [tarif, setTarif] = React.useState(a.tarif === null ? "" : String(a.tarif));
  const [generique, setGenerique] = React.useState(a.generique);
  const enregistrer = useMutation({
    mutationFn: () =>
      enregistrerAnnonce({
        job_id: a.job_id,
        langue: generique ? null : langue || null,
        pays: generique ? null : paysDe(langue, pays) || null,
        hm_id: hm || null,
        tarif: tarif.trim() ? Number(tarif) : null,
        generique,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annonces"] }),
  });
  return (
    <li className="space-y-2 px-3 py-2" data-annonce={a.job_id}>
      <p className="text-sm">
        <span className="font-medium">{a.titre ?? a.job_id}</span>
        {!a.pays && !a.generique && <Badge variant="warning" className="ml-2">{t("accueil.annonceAVoir")}</Badge>}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={generique} onChange={(e) => setGenerique(e.target.checked)} />
          {t("accueil.generique")}
        </label>
        {!generique && (
          <>
            <select className={selectClass} value={langue} onChange={(e) => { setLangue(e.target.value); setPays(""); }} aria-label={t("accueil.langue")}>
              <option value="">{t("accueil.langue")}</option>
              {LANGUES_CIBLES.map((l) => (
                <option key={l} value={l}>
                  {nomLangue(l)}
                </option>
              ))}
            </select>
            {langue && <ChampPaysCompte id={`annonce-${a.job_id}`} langue={langue} pays={pays} onPays={setPays} />}
          </>
        )}
        <select className={selectClass} value={hm} onChange={(e) => setHm(e.target.value)} aria-label={t("accueil.hm")}>
          <option value="">{t("accueil.hm")}</option>
          {hms.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nom}
            </option>
          ))}
        </select>
        <Input className="h-8 w-24" type="number" min={1} step="0.5" value={tarif} placeholder={t("accueil.tarif")} onChange={(e) => setTarif(e.target.value)} aria-label={t("accueil.tarif")} />
        <Button size="sm" variant="outline" className="h-8" disabled={enregistrer.isPending || (!generique && !langue)} onClick={() => enregistrer.mutate()}>
          {t("common.save")}
        </Button>
      </div>
      {enregistrer.isError && <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>}
    </li>
  );
}

/**
 * Système du 2 nov., partie A : l'accueil automatique. « Contrats à relier »
 * en tête (annonce inconnue ou générique), puis ce que l'OS a fait (ou ferait,
 * en test) pour chaque contrat, et les annonces (pays, langue, HM, tarif).
 */
export function AccueilAuto({ hmSeulement = false }: { hmSeulement?: boolean }) {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin" || role === "head_of_ops";
  const accueils = useQuery({ queryKey: ["accueils"], queryFn: lireAccueils });
  const annonces = useQuery({ queryKey: ["annonces"], queryFn: lireAnnonces, enabled: !hmSeulement });
  const hmsQ = useQuery({ queryKey: ["ckd", "hms"], queryFn: listerHms, enabled: admin });
  const interrupteurs = useQuery({ queryKey: ["interrupteurs"], queryFn: lireInterrupteurs });
  const hms = (hmsQ.data ?? []).map((h) => ({ id: h.profile_id, nom: h.nom }));
  const qc = useQueryClient();
  const amorcer = useMutation({
    mutationFn: amorcerAnnonces,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["annonces"] }),
  });
  const liste = accueils.data ?? [];
  const aRelier = liste.filter(estARelier);
  // 0493 : les contrats qui ne sont pas des recrues (contrat de HM, autre activité) : listés à part, jamais à relier.
  const classes = liste.filter((a) => a.classement);
  // 0470 : relire le pays du freelance et la HM du contrat (lecture seule).
  const localiser = useMutation({
    mutationFn: () => localiserAccueils(aRelier.map((a) => a.contrat_id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accueils"] }),
  });
  const autres = liste.filter((a) => a.statut !== "a_relier" && !a.classement);
  const mode = interrupteurs.data?.accueil_auto ?? "test";
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  if (hmSeulement && aRelier.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="accueil-auto">
      <div className="flex flex-wrap items-center gap-2">
        <UserPlus className="size-4" aria-hidden />
        <h2 className="font-semibold">{t("accueil.titre")}</h2>
        <Badge variant={mode === "on" ? "success" : mode === "test" ? "warning" : "secondary"}>{t(`interrupteurs.modes.${mode}`)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t(`accueil.aide.${mode}`)}</p>
      {accueils.error && <p className="text-sm text-destructive">{(accueils.error as Error).message}</p>}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{t("accueil.aRelier", { n: aRelier.length })}</p>
          {admin && aRelier.length > 0 && (
            <>
              <Button size="sm" variant="outline" className="h-7" loading={localiser.isPending} onClick={() => localiser.mutate()} title={t("accueil.api.lireAide")}>
                {t("accueil.api.lire")}
              </Button>
              {localiser.data && <span className="text-xs text-muted-foreground">{t("accueil.api.lu", { n: localiser.data.length })}</span>}
              {localiser.error && <span className="text-xs text-destructive">{(localiser.error as Error).message}</span>}
            </>
          )}
        </div>
        {aRelier.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("accueil.rienARelier")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {aRelier.map((a) => (
              <LigneARelier key={a.contrat_id} a={a} />
            ))}
          </ul>
        )}
      </div>

      {!hmSeulement && classes.length > 0 && (
        <details className="group rounded-lg border" data-testid="accueils-classes">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
            <ChevronDown className="size-4 transition-transform group-[:not([open])]:-rotate-90" aria-hidden />
            {t("accueil.classes.titre", { n: classes.length })}
          </summary>
          <ul className="divide-y border-t text-sm">
            {classes.map((a) => (
              <li key={a.contrat_id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-classe={a.classement ?? ""}>
                <span className="font-medium">{[a.prenom, a.nom].filter(Boolean).join(" ") || "—"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{a.contrat_id}</span>
                <Badge variant={a.classement === "hm" ? "info" : "secondary"}>{t(`accueil.classes.${a.classement}`)}</Badge>
                {a.classement_raison && <span className="text-xs text-muted-foreground">{a.classement_raison}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!hmSeulement && admin && <LiaisonsContrats />}

      {!hmSeulement && (
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
            <ChevronDown className="size-4 transition-transform group-[:not([open])]:-rotate-90" aria-hidden />
            {t("accueil.journal", { n: autres.length })}
          </summary>
          <ul className="divide-y border-t">
            {autres.map((a) => (
              <li key={a.contrat_id} className="space-y-1 px-3 py-2 text-sm" data-accueil={a.contrat_id}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{[a.prenom, a.nom].filter(Boolean).join(" ") || a.contrat_id}</span>
                  <Badge variant={VARIANTE[a.statut]}>{t(`accueil.statuts.${a.statut}`)}</Badge>
                  {a.pays && <span className="text-xs text-muted-foreground">{a.pays} · {a.langue}</span>}
                  {a.cohorte_lundi && <span className="text-xs text-muted-foreground">{t("accueil.cohorte", { date: a.cohorte_lundi })}</span>}
                  {a.message_at && <span className="text-xs text-muted-foreground">{t("accueil.envoyeLe", { date: fmt.format(new Date(a.message_at)) })}</span>}
                </p>
                {a.raison && <p className={cn("text-xs", a.statut === "erreur" ? "text-destructive" : "text-muted-foreground")}>{a.raison}</p>}
                {a.message_texte && (
                  <details>
                    <summary className="cursor-pointer text-xs text-primary">{t("accueil.voirMessage")}</summary>
                    <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">{a.message_texte}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!hmSeulement && (
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
            <ChevronDown className="size-4 transition-transform group-[:not([open])]:-rotate-90" aria-hidden />
            {t("accueil.annonces", { n: (annonces.data ?? []).length })}
          </summary>
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            <Button size="sm" variant="outline" className="h-8" disabled={amorcer.isPending} onClick={() => amorcer.mutate()}>
              {amorcer.isPending ? t("accueil.amorcerEnCours") : t("accueil.amorcer")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("accueil.amorcerAide")}</span>
            {amorcer.data && (
              <span className="text-xs" data-testid="bilan-amorcage">
                {t("accueil.amorcerBilan", {
                  annonces: amorcer.data.annonces,
                  pays: amorcer.data.avec_pays,
                  generiques: amorcer.data.generiques,
                  dites: amorcer.data.deja_dites,
                  erreurs: amorcer.data.erreurs.length,
                })}
              </span>
            )}
            {amorcer.error && <span className="text-xs text-destructive">{(amorcer.error as Error).message}</span>}
          </div>
          <ul className="divide-y border-t">
            {(annonces.data ?? []).map((a) => (
              <LigneAnnonce key={a.job_id} a={a} hms={hms} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
