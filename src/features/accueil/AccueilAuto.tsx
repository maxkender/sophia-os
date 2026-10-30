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
  creerAccueil,
  enregistrerAnnonce,
  lireAccueils,
  lireAnnonces,
  localiserAccueils,
  relierAccueil,
  type Accueil,
  type AnnoncePays,
} from "./api";

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

/** « Contrats à relier » : la HM (ou l'admin) donne la langue, le pays et la HM. */
function LigneARelier({ a, hms, admin }: { a: Accueil; hms: { id: string; nom: string }[]; admin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [langue, setLangue] = React.useState("");
  const [pays, setPays] = React.useState("");
  const [hm, setHm] = React.useState(a.hm_id ?? "");
  const [retenir, setRetenir] = React.useState(false);
  const relier = useMutation({
    mutationFn: () => relierAccueil(a.contrat_id, paysDe(langue, pays), langue, admin ? hm || null : null, retenir),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accueils"] }),
  });
  const pret = Boolean(langue && paysDe(langue, pays));
  const lieu = [a.freelance_ville, nomPaysIso(a.freelance_pays)].filter(Boolean).join(", ");
  return (
    <li className="space-y-2 px-3 py-2" data-a-relier={a.contrat_id}>
      <p className="text-sm">
        <span className="font-medium">{[a.prenom, a.nom].filter(Boolean).join(" ") || a.contrat_id}</span>
        <span className="text-muted-foreground"> · {a.job_titre ?? "—"}</span>
      </p>
      {/* 0470 : l'équipe Upwork du contrat, où vit le freelance, la HM du contrat, la raison. */}
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="infos-contrat">
        {a.equipe && (
          <Badge variant={/^vik studios$/i.test(a.equipe) ? "secondary" : "warning"} data-equipe={a.equipe}>
            {t("accueil.api.equipe", { nom: a.equipe })}
            {!/^vik studios$/i.test(a.equipe) && ` · ${t("accueil.api.horsVik")}`}
          </Badge>
        )}
        <span>{lieu ? t("accueil.api.vit", { lieu }) : t("accueil.api.vitInconnu")}</span>
        {a.hm_upwork_nom && <span>{t("accueil.api.hmContrat", { nom: a.hm_upwork_nom })}</span>}
        {a.raison && <span>· {a.raison}</span>}
      </p>
      {admin && <CreerPourContrat a={a} hms={hms} />}
      <div className="flex flex-wrap items-end gap-2">
        <select className={selectClass} value={langue} onChange={(e) => { setLangue(e.target.value); setPays(""); }} aria-label={t("accueil.langue")}>
          <option value="">{t("accueil.langue")}</option>
          {LANGUES_CIBLES.map((l) => (
            <option key={l} value={l}>
              {nomLangue(l)}
            </option>
          ))}
        </select>
        {langue && <ChampPaysCompte id={`pays-${a.contrat_id}`} langue={langue} pays={pays} onPays={setPays} />}
        {admin && (
          <select className={selectClass} value={hm} onChange={(e) => setHm(e.target.value)} aria-label={t("accueil.hm")}>
            <option value="">{t("accueil.hm")}</option>
            {hms.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nom}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={retenir} onChange={(e) => setRetenir(e.target.checked)} />
          {t("accueil.retenir")}
        </label>
        <Button size="sm" className="h-8" disabled={!pret || relier.isPending} onClick={() => relier.mutate()}>
          {t("accueil.relier")}
        </Button>
      </div>
      {relier.isError && <p className="text-xs text-destructive">{(relier.error as Error).message}</p>}
    </li>
  );
}

/**
 * 0470 : la carte « Contract to link » : pays et HM pour ce contrat, sans
 * passer par l'annonce. Un clic : posteur créé, relié au contrat, welcome
 * envoyé, carte fermée ; sinon l'erreur, telle quelle.
 */
function CreerPourContrat({ a, hms }: { a: Accueil; hms: { id: string; nom: string }[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pays, setPays] = React.useState(a.pays ?? a.freelance_pays ?? "");
  const [hm, setHm] = React.useState(a.hm_id ?? "");
  const tous = React.useMemo(() => paysTries(), []);
  const nom = [a.prenom, a.nom].filter(Boolean).join(" ") || a.contrat_id;
  const creer = useMutation({
    mutationFn: () => creerAccueil(a.contrat_id, pays, hm),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accueils"] }),
  });
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="creer-pour-contrat">
      <select className={selectClass} value={pays} onChange={(e) => setPays(e.target.value)} aria-label={t("accueil.api.pays")}>
        <option value="">{t("accueil.api.pays")}</option>
        {tous.map((p) => (
          <option key={p.code} value={p.code}>
            {p.nom}
          </option>
        ))}
      </select>
      <select className={selectClass} value={hm} onChange={(e) => setHm(e.target.value)} aria-label={t("accueil.hm")}>
        <option value="">{t("accueil.hm")}</option>
        {hms.map((h) => (
          <option key={h.id} value={h.id}>
            {h.nom}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-8"
        disabled={!pays || !hm || creer.isPending}
        loading={creer.isPending}
        onClick={() => {
          const hmNom = hms.find((h) => h.id === hm)?.nom ?? hm;
          if (window.confirm(t("accueil.api.confirmer", { nom, pays: nomPaysIso(pays) || pays, hm: hmNom }))) creer.mutate();
        }}
      >
        {t("accueil.api.creer")}
      </Button>
      {creer.isError && <p className="w-full text-xs text-destructive" role="alert">{(creer.error as Error).message}</p>}
      {creer.data && <p className="w-full text-xs text-muted-foreground">{t("accueil.api.cree", { statut: t(`accueil.statuts.${creer.data.statut ?? "cree"}`) })}</p>}
    </div>
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
  const aRelier = liste.filter((a) => a.statut === "a_relier");
  // 0470 : relire le pays du freelance et la HM du contrat (lecture seule).
  const localiser = useMutation({
    mutationFn: () => localiserAccueils(aRelier.map((a) => a.contrat_id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accueils"] }),
  });
  const autres = liste.filter((a) => a.statut !== "a_relier");
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
              <LigneARelier key={a.contrat_id} a={a} hms={hms} admin={admin} />
            ))}
          </ul>
        )}
      </div>

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
