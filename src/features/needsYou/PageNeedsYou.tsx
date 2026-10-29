import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CAS_REPONSE } from "@/features/reponses/api";
import { cn } from "@/lib/utils";

import {
  agirNeedsYou,
  CATEGORIES,
  ignorerQuestions,
  lireNeedsYou,
  releverCompte,
  repondreQuestions,
  URGENCES,
  type CasNeedsYou,
} from "./api";
import { estInterne, filtrer, FILTRES_VIDES, options, parCategorie, trier, type Filtres } from "./logique";

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

const VARIANTE_URGENCE = { lundi: "error", paie: "warning", kill: "warning", rien: "secondary" } as const;

/**
 * Prompt 21, partie U : une seule page pour tout ce que l'OS n'a pas pu faire,
 * ou dont il n'est pas sûr. Chaque ligne dit qui, ce que l'OS a vu, ce qu'il
 * en pense, pourquoi c'est urgent, et se règle sur place (1 à 3 boutons).
 */
export function PageNeedsYou() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["needs-you", "liste"], queryFn: lireNeedsYou, refetchInterval: 60_000 });
  const [f, setF] = React.useState<Filtres>(FILTRES_VIDES);
  const tous = lu.data ?? [];
  const visibles = trier(filtrer(tous, f));
  const o = options(tous);
  const compte = parCategorie(tous);
  const maj = (champ: keyof Filtres) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [champ]: e.target.value });

  return (
    <div className="space-y-4" data-testid="needs-you">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("needsYou.categories")}>
        {CATEGORIES.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={f.categorie === c ? "default" : "outline"}
            aria-pressed={f.categorie === c}
            data-categorie={c}
            onClick={() => setF({ ...f, categorie: f.categorie === c ? "" : c })}
          >
            {t(`needsYou.cat.${c}`)} ({compte[c]})
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClass} aria-label={t("needsYou.filtres.cohorte")} value={f.cohorte} onChange={maj("cohorte")}>
          <option value="">{t("needsYou.filtres.cohorte")}</option>
          {o.cohortes.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={selectClass} aria-label={t("needsYou.filtres.hm")} value={f.hm} onChange={maj("hm")}>
          <option value="">{t("needsYou.filtres.hm")}</option>
          {o.hms.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={selectClass} aria-label={t("needsYou.filtres.pays")} value={f.pays} onChange={maj("pays")}>
          <option value="">{t("needsYou.filtres.pays")}</option>
          {o.pays.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={selectClass} aria-label={t("needsYou.filtres.urgence")} value={f.urgence} onChange={maj("urgence")}>
          <option value="">{t("needsYou.filtres.urgence")}</option>
          {URGENCES.map((x) => <option key={x} value={x}>{t(`needsYou.urgence.${x}`)}</option>)}
        </select>
        <select className={selectClass} aria-label={t("needsYou.filtres.anciennete")} value={f.anciennete} onChange={maj("anciennete")}>
          <option value="">{t("needsYou.filtres.anciennete")}</option>
          {(["24h", "3j", "7j"] as const).map((x) => <option key={x} value={x}>{t(`needsYou.anciennete.${x}`)}</option>)}
        </select>
        <Input className="h-9 w-52" placeholder={t("needsYou.filtres.recherche")} value={f.recherche} onChange={maj("recherche")} />
        <span className="text-sm text-muted-foreground">{t("needsYou.n", { n: visibles.length, total: tous.length })}</span>
      </div>
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      {lu.data && visibles.length === 0 && <p className="text-sm text-muted-foreground">{t("needsYou.vide")}</p>}
      <div className="space-y-2">
        {visibles.map((c) => <LigneCas key={c.cle} c={c} />)}
      </div>
    </div>
  );
}

function LigneCas({ c }: { c: CasNeedsYou }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [valeur, setValeur] = React.useState(c.valeur ?? "");
  const [ok, setOk] = React.useState<string | null>(null);
  const action = useMutation({
    mutationFn: async (a: string) => {
      if (c.type === "question_faq") {
        const ids = (c.ref ?? "").split(",").filter(Boolean);
        if (a === "repondre") await repondreQuestions(ids, valeur.trim());
        else await ignorerQuestions(ids);
        return a;
      }
      const r = await agirNeedsYou(c.cle, a, ["corriger_lien", "corriger_handle", "classer"].includes(a) ? valeur.trim() : null);
      // U4 : un handle corrigé est relevé tout de suite.
      if (a === "corriger_handle" && c.ref) await releverCompte(c.ref).catch(() => undefined);
      return r;
    },
    onSuccess: (r) => {
      setOk(r);
      void qc.invalidateQueries({ queryKey: ["needs-you"] });
    },
  });
  const nom = c.nom ?? t("needsYou.inconnu");
  const qui = [c.cohorte && t("needsYou.cohorte", { date: c.cohorte }), c.hm && t("needsYou.hm", { nom: c.hm }), c.pays].filter(Boolean).join(" · ");
  const boutons = c.actions.filter((a) => a !== "ouvrir");
  const saisie = boutons.find((a) => ["corriger_lien", "corriger_handle", "repondre", "classer"].includes(a));

  return (
    <Card
      data-cas={c.cle}
      data-type={c.type}
      // Prompt 21, R6 : une contestation ouverte depuis plus de 24 h passe en rouge.
      className={cn(c.type === "contestation_24h" ? "border-l-4 border-l-destructive" : c.urgence !== "rien" && "border-l-4 border-l-warning")}
    >
      <CardContent className="space-y-2 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`needsYou.cat.${c.categorie}`)}</Badge>
          <span className="font-medium">{t(`needsYou.types.${c.type}`, { defaultValue: c.type })}</span>
          <Badge variant={VARIANTE_URGENCE[c.urgence]}>{t(`needsYou.urgence.${c.urgence}`)}</Badge>
          {c.compteur > 1 && <Badge variant="info">×{c.compteur}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(c.cree_at))}
          </span>
        </div>
        <p>
          <span className="font-medium">{nom}</span>
          {qui && <span className="text-muted-foreground"> · {qui}</span>}
          {c.contestation && (
            <Link to="/admin/retours-contestes" className="ml-2 text-xs font-medium text-destructive underline" data-testid="contestation">
              {t("needsYou.contestation")}
            </Link>
          )}
        </p>
        <p className="whitespace-pre-wrap break-words text-muted-foreground">
          <span className="font-medium text-foreground">{t("needsYou.vu")} </span>
          {c.vu}
        </p>
        <p>
          <span className="font-medium">{t("needsYou.pense")} </span>
          {c.pense}
          {c.confiance !== null && <span className="text-muted-foreground"> ({t("needsYou.confiance", { n: Math.round(c.confiance * 100) })})</span>}
        </p>
        {saisie === "classer" && (
          <select className={selectClass} aria-label={t("needsYou.actions.classer")} value={valeur} onChange={(e) => setValeur(e.target.value)}>
            <option value="">—</option>
            {CAS_REPONSE.map((x) => <option key={x} value={x}>{t(`reponses.cas.${x}`, { defaultValue: x })}</option>)}
          </select>
        )}
        {saisie === "repondre" && (
          <Textarea rows={3} aria-label={t("needsYou.actions.repondre")} value={valeur} onChange={(e) => setValeur(e.target.value)} />
        )}
        {(saisie === "corriger_lien" || saisie === "corriger_handle") && (
          <Input className="h-9 max-w-md" aria-label={t(`needsYou.actions.${saisie}`)} value={valeur} onChange={(e) => setValeur(e.target.value)} />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {boutons.slice(0, 3).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={a === "ignorer" || a === "faux" || a === "delier" ? "outline" : "default"}
              disabled={action.isPending || (a === saisie && !valeur.trim())}
              data-action={a}
              onClick={() => action.mutate(a)}
            >
              {t(`needsYou.actions.${a}`, { valeur: c.valeur ?? "" })}
            </Button>
          ))}
          {c.lien && (
            estInterne(c.lien)
              ? <Button size="sm" variant="ghost" asChild><Link to={c.lien}>{t("needsYou.actions.ouvrir")}</Link></Button>
              : <Button size="sm" variant="ghost" asChild><a href={c.lien} target="_blank" rel="noreferrer">{t("needsYou.actions.ouvrir")}</a></Button>
          )}
          {ok && <span className="text-xs text-muted-foreground">{ok}</span>}
          {action.error && <span className="text-xs text-destructive">{(action.error as Error).message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
