import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { dejaEcritAujourdhui, deciderProbleme, envoyerLienMotDePasse, envoyerUpwork, type Probleme } from "./api";
import { debutJourParis, optionLibre, planDecision } from "./logique";

const P = "problemes";

/**
 * 0528 : la question posée à Max et ses options (la 1re recommandée). Le clic
 * exécute l'action non financière liée et envoie la réponse liée (mode « on »
 * seulement ; en test, rien ne part), puis enregistre le choix (bot_feedback).
 * Une option « paie » ouvre le contrat Upwork : l'OS ne paie jamais.
 * La réponse à une HM est montrée pour être copiée (DM Slack à la main).
 */
export function BlocDecision({ p, mode }: { p: Probleme; mode: "test" | "on" }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [libre, setLibre] = React.useState<number | null>(null);
  const [texte, setTexte] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [aCopier, setACopier] = React.useState<string | null>(null);
  const [copie, setCopie] = React.useState(false);
  const options = p.options ?? [];

  const choisir = useMutation({
    mutationFn: async ({ index, texteLibre }: { index: number; texteLibre?: string }) => {
      const o = options[index]!;
      const plan = planDecision(o, p, mode, texteLibre);
      // L'argent : on ouvre le contrat Upwork (nouvel onglet), rien n'est payé ici.
      if (plan.ouvrir) window.open(plan.ouvrir, "_blank", "noopener,noreferrer");
      let envoye = false;
      if (plan.motDePasse) {
        await envoyerLienMotDePasse(plan.motDePasse);
        envoye = true;
      }
      if (plan.envoyer && p.poster_id) {
        if (await dejaEcritAujourdhui(p.poster_id, debutJourParis())) throw new Error(t(`${P}.unParJour`));
        await envoyerUpwork(p.poster_id, plan.envoyer);
        envoye = true;
      }
      await deciderProbleme(p.id, index, envoye);
      return { plan, envoye };
    },
    onSuccess: ({ plan, envoye }) => {
      setLibre(null);
      setACopier(plan.aCopier);
      setMessage(
        plan.ouvrir ? t(`${P}.decision.paie`)
          : plan.samedi ? t(`${P}.decision.samedi`)
          : envoye ? t(`${P}.decision.envoye`)
          : mode === "test" && !plan.aCopier ? t(`${P}.rienEnvoye`)
          : t(`${P}.decision.note`),
      );
      // La réponse à copier reste visible : on ne rafraîchit la liste qu'après la copie.
      if (!plan.aCopier) void qc.invalidateQueries({ queryKey: ["problemes"] });
      if (plan.page) navigate(plan.page);
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const copier = async () => {
    if (!aCopier) return;
    try {
      await navigator.clipboard.writeText(aCopier);
    } catch {
      // Le texte reste affiché : copie à la main.
    }
    setCopie(true);
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3" data-testid="decision">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t(`${P}.decision.titre`)}</p>
      <p className="font-semibold" data-testid="question">{p.question}</p>
      {!aCopier && (
        <div className="flex flex-wrap gap-2">
          {options.map((o, i) => (
            <Button
              key={i}
              size="sm"
              variant={i === 0 ? "default" : "outline"}
              disabled={choisir.isPending}
              data-testid={`option-${i}`}
              onClick={() => {
                setMessage(null);
                if (optionLibre(o)) {
                  setLibre(i);
                  setTexte("");
                } else choisir.mutate({ index: i });
              }}
            >
              {o.libelle}
              {o.paie && " ↗"}
              {i === 0 && <span className="ml-1 text-[10px] font-normal opacity-80">({t(`${P}.decision.recommande`)})</span>}
            </Button>
          ))}
        </div>
      )}
      {libre !== null && (
        <div className="space-y-1" data-testid="option-libre">
          <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} placeholder={t(`${P}.decision.autre`)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => choisir.mutate({ index: libre, texteLibre: texte })} disabled={choisir.isPending}>
              {t(`${P}.decision.confirmer`, { libelle: options[libre]?.libelle ?? "" })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLibre(null)}>{t(`${P}.decision.annuler`)}</Button>
          </div>
        </div>
      )}
      {!aCopier && options.some((o) => o.reponse) && (
        <ul className="space-y-1 text-xs text-muted-foreground" data-testid="reponses-options">
          {options.map((o, i) => o.reponse && (
            <li key={i}>
              <span className="font-medium">{o.libelle}</span> → {t(`${P}.decision.reponse`)} <span className="italic">« {o.reponse} »</span>
            </li>
          ))}
        </ul>
      )}
      {aCopier && (
        <div className="space-y-1" data-testid="a-copier">
          <p className="text-xs">{t(`${P}.decision.aCopier`, { hm: p.hm_nom ?? "HM" })}</p>
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{aCopier}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={copier}>{copie ? `✓ ${t(`${P}.decision.copie`)}` : t(`${P}.decision.copier`)}</Button>
            <Button size="sm" variant="ghost" onClick={() => void qc.invalidateQueries({ queryKey: ["problemes"] })}>{t(`${P}.kill.fermerFenetre`)}</Button>
          </div>
        </div>
      )}
      {message && <p className="text-xs text-muted-foreground" data-testid="decision-message">{message}</p>}
    </div>
  );
}
