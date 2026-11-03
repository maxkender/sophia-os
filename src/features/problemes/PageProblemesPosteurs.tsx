import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { releverCompte } from "@/features/needsYou/api";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import {
  agirProbleme,
  dejaEcritAujourdhui,
  envoyerUpwork,
  lireArchives,
  lireModeProblemes,
  lireProblemes,
  passerMaintenant,
  type Niveau,
  type Probleme,
  validerCategorie,
} from "./api";
import {
  avecLigneStop,
  compterParNiveau,
  debutJourParis,
  FILTRES_VIDES,
  filtrer,
  gesteValider,
  NIVEAUX,
  options,
  peutValiderCategorie,
  PROPRIETAIRES,
  type FiltresProblemes,
} from "./logique";

const P = "problemes";
const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const VARIANTE: Record<Niveau, "destructive" | "warning" | "secondary"> = { urgent: "destructive", aujourdhui: "warning", samedi: "secondary" };

function quand(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString(localeDate(), { dateStyle: "short", timeStyle: "short" }) : "—";
}

/** La date d'une cohorte (« 2 nov. »), dans la langue de l'écran. */
function jourCohorte(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeDate(), { day: "numeric", month: "short" });
}

const MOTIFS_OFFRE = /\b(hors_vik|nb_milestones|montant|nom_1er|echeance_1er|plusieurs_finances)\b/;

/** Le résumé, avec le motif d'une alerte d'offre en clair (« Pas 4 « Week NN » » plutôt que nb_milestones). */
function resumeLisible(p: Pick<Probleme, "resume" | "categorie">, t: (k: string) => string): string {
  if (p.categorie !== "offre_hm_incorrecte") return p.resume;
  return p.resume.replace(MOTIFS_OFFRE, (m) => t(`decisionPays.motif.${m}`));
}

function CarteProbleme({ p, mode }: { p: Probleme; mode: "test" | "on" }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [edition, setEdition] = React.useState(false);
  const [reponse, setReponse] = React.useState(p.proposition_reponse ?? "");
  const [message, setMessage] = React.useState<string | null>(null);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["problemes"] });
  const geste = gesteValider(p);

  const agir = useMutation({
    mutationFn: async (action: "valider" | "ignorer" | "samedi" | "modifier") => {
      if (action === "modifier") {
        await agirProbleme(p.id, "modifier", { reponse });
        setEdition(false);
        return;
      }
      if (action !== "valider") return agirProbleme(p.id, action);
      if (geste.type === "page") {
        // L'argent et les formulaires (Kill, recréer…) : on ouvre la bonne page, rien n'est exécuté ici.
        navigate(geste.vers);
        return;
      }
      if (geste.type === "releve") await releverCompte(geste.compte_id);
      let envoye = false;
      if (geste.type === "reponse" && mode === "on" && p.poster_id && (p.canal_reponse ?? "upwork") === "upwork") {
        if (await dejaEcritAujourdhui(p.poster_id, debutJourParis())) throw new Error(t(`${P}.unParJour`));
        await envoyerUpwork(p.poster_id, avecLigneStop(p.proposition_reponse ?? ""));
        envoye = true;
      }
      await agirProbleme(p.id, "valider", { envoye, action: p.proposition_action, reponse: p.proposition_reponse });
      if (mode === "test" && geste.type === "reponse") setMessage(t(`${P}.rienEnvoye`));
    },
    onSuccess: rafraichir,
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <Card data-testid="carte-probleme">
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{p.nom ?? p.contrat_id ?? t(`${P}.sansPosteur`)}</span>
          {p.hm && <span className="text-muted-foreground">· {t(`${P}.hm`, { hm: p.hm })}</span>}
          {p.cohorte && <span className="text-muted-foreground">· {t(`${P}.cohorte`, { date: jourCohorte(p.cohorte) })}</span>}
          <Badge variant={VARIANTE[p.niveau]}>{t(`${P}.categories.${p.categorie}`, { defaultValue: p.categorie })}</Badge>
          <Badge variant="outline">{t(`${P}.proprietaires.${p.proprietaire}`)}</Badge>
          {p.actif === false && <Badge variant="secondary">{t(`${P}.inactif`)}</Badge>}
        </div>
        <p>{resumeLisible(p, t)}</p>
        {(p.proposition_reponse || edition) && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t(`${P}.reponseProposee`, { canal: p.canal_reponse ?? "upwork" })}
            </p>
            {edition ? (
              <Textarea value={reponse} onChange={(e) => setReponse(e.target.value)} rows={4} />
            ) : (
              <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{p.proposition_reponse}</p>
            )}
          </div>
        )}
        {p.proposition_action && (
          <p className="text-xs">
            {t(`${P}.actionProposee`)} <span className="font-medium">{t(`${P}.actions.${p.proposition_action}`, { defaultValue: p.proposition_action })}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {p.sources.slice(-5).map((s) => (
            <span key={`${s.type}:${s.ref}`} title={s.texte ?? ""}>
              {s.lien ? <a href={s.lien} target="_blank" rel="noreferrer" className="underline">{t(`${P}.sources.${s.type}`, { defaultValue: s.type })}</a> : t(`${P}.sources.${s.type}`, { defaultValue: s.type })}
              {s.at ? ` · ${quand(s.at)}` : ""}
            </span>
          ))}
          {p.sources.length > 5 && <span>{t(`${P}.autresSources`, { n: p.sources.length - 5 })}</span>}
          {p.propose_par && <span>· {t(`${P}.proposePar`, { qui: p.propose_par, quand: quand(p.propose_at) })}</span>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => agir.mutate("valider")} disabled={agir.isPending}>
            ✅ {geste.type === "page" ? t(`${P}.ouvrir`) : t(`${P}.valider`)}
          </Button>
          {edition ? (
            <Button size="sm" variant="outline" onClick={() => agir.mutate("modifier")} disabled={agir.isPending}>💾 {t(`${P}.enregistrer`)}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEdition(true)}>✏️ {t(`${P}.modifier`)}</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => agir.mutate("ignorer")} disabled={agir.isPending}>🗑️ {t(`${P}.ignorer`)}</Button>
          {p.niveau !== "samedi" && (
            <Button size="sm" variant="outline" onClick={() => agir.mutate("samedi")} disabled={agir.isPending}>📅 {t(`${P}.samedi`)}</Button>
          )}
        </div>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Bloc C (2/11) : « Problèmes » remplace Needs you. Un problème par posteur et
 * par catégorie ; 3 onglets (Urgent, Aujourd'hui, Samedi) ; une proposition
 * (réponse + action) à valider, modifier, ignorer ou reporter au samedi.
 */
export function PageProblemesPosteurs() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [onglet, setOnglet] = React.useState<Niveau>("urgent");
  const [vue, setVue] = React.useState<"ouverts" | "fermes" | "archives">("ouverts");
  const [f, setF] = React.useState<FiltresProblemes>(FILTRES_VIDES);
  const lu = useQuery({ queryKey: ["problemes", "ouverts"], queryFn: () => lireProblemes("ouverts"), refetchInterval: 60_000 });
  const fermes = useQuery({ queryKey: ["problemes", "fermes"], queryFn: () => lireProblemes("fermes"), enabled: vue === "fermes" });
  const archives = useQuery({ queryKey: ["problemes", "archives"], queryFn: lireArchives, enabled: vue === "archives" });
  const mode = useQuery({ queryKey: ["problemes", "mode"], queryFn: lireModeProblemes });
  const passer = useMutation({ mutationFn: passerMaintenant, onSuccess: () => qc.invalidateQueries({ queryKey: ["problemes"] }) });
  const lot = useMutation({
    mutationFn: () => validerCategorie(onglet, f.categorie),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["problemes"] }),
  });

  const tous = lu.data ?? [];
  const filtres = filtrer(tous, f);
  const n = compterParNiveau(filtres);
  const o = options(tous);
  const visibles = filtres.filter((p) => p.niveau === onglet);
  const modeActuel = mode.data ?? "test";

  return (
    <div className="space-y-4" data-testid="page-problemes">
      {modeActuel === "test" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" data-testid="mode-test">
          {t(`${P}.modeTest`)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-sm" role="tablist">
          {NIVEAUX.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={vue === "ouverts" && onglet === x}
              onClick={() => { setVue("ouverts"); setOnglet(x); }}
              className={cn("rounded px-3 py-1.5", vue === "ouverts" && onglet === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {t(`${P}.niveaux.${x}`)} <span className="tabular-nums">({n[x]})</span>
            </button>
          ))}
        </div>
        <select className={selectClass} value={f.proprietaire} onChange={(e) => setF({ ...f, proprietaire: e.target.value })} aria-label={t(`${P}.filtreProprietaire`)}>
          <option value="">{t(`${P}.tousProprietaires`)}</option>
          {PROPRIETAIRES.map((x) => <option key={x} value={x}>{t(`${P}.proprietaires.${x}`)}</option>)}
        </select>
        <select className={selectClass} value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })} aria-label={t(`${P}.filtreCategorie`)}>
          <option value="">{t(`${P}.toutesCategories`)}</option>
          {o.categories.map((x) => <option key={x} value={x}>{t(`${P}.categories.${x}`, { defaultValue: x })}</option>)}
        </select>
        <select className={selectClass} value={f.hm} onChange={(e) => setF({ ...f, hm: e.target.value })} aria-label="HM">
          <option value="">{t(`${P}.tousHm`)}</option>
          {o.hms.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant={vue === "fermes" ? "default" : "outline"} onClick={() => setVue(vue === "fermes" ? "ouverts" : "fermes")}>{t(`${P}.fermes`)}</Button>
          <Button size="sm" variant={vue === "archives" ? "default" : "outline"} onClick={() => setVue(vue === "archives" ? "ouverts" : "archives")}>{t(`${P}.archives`)}</Button>
          <Button size="sm" variant="outline" onClick={() => passer.mutate()} disabled={passer.isPending}>{t(`${P}.relire`)}</Button>
          <Link to="/admin/auto/needs-you-ancien" className="self-center text-xs underline">{t(`${P}.ancienne`)}</Link>
        </div>
      </div>

      {vue === "ouverts" && f.categorie && peutValiderCategorie(f.categorie) && visibles.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => lot.mutate()} disabled={lot.isPending} data-testid="valider-categorie">
          {t(`${P}.validerCategorie`, { n: visibles.length })}
        </Button>
      )}

      {lu.isLoading && <p className="text-sm text-muted-foreground">{t(`${P}.chargement`)}</p>}
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}

      {vue === "ouverts" && (
        <div className="space-y-3">
          {visibles.length === 0 && !lu.isLoading && <p className="text-sm text-muted-foreground">{t(`${P}.rien`)}</p>}
          {visibles.map((p) => <CarteProbleme key={p.id} p={p} mode={modeActuel} />)}
        </div>
      )}

      {vue === "fermes" && (
        <ul className="space-y-1 text-sm" data-testid="liste-fermes">
          {(fermes.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap gap-2 border-b py-1">
              <span className="font-medium">{p.nom ?? p.contrat_id ?? "—"}</span>
              <span className="text-muted-foreground">{t(`${P}.categories.${p.categorie}`, { defaultValue: p.categorie })}</span>
              <span>{resumeLisible(p, t)}</span>
              <span className="text-muted-foreground">→ {p.ferme_raison ?? p.statut} · {quand(p.ferme_at)}</span>
            </li>
          ))}
        </ul>
      )}

      {vue === "archives" && (
        <ul className="space-y-1 text-sm" data-testid="liste-archives">
          <li className="text-xs text-muted-foreground">{t(`${P}.archivesAide`)}</li>
          {(archives.data ?? []).map((a) => (
            <li key={`${a.type}:${a.ref}`} className="flex flex-wrap gap-2 border-b py-1">
              <span className="font-medium">{a.nom ?? "—"}</span>
              <span>« {a.texte ?? ""} »</span>
              <span className="text-muted-foreground">{t(`${P}.sources.${a.type}`, { defaultValue: a.type })} · {quand(a.recu_at)} · {a.raison}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
