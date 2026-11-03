import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { donnerFeedback, lireStatsBots, type BotFeedback, type Probleme, type Verdict } from "./api";
import { EMOJI_VERDICT, pourcentJuste, raisonObligatoire, VERDICTS } from "./logique";

const P = "problemes";

/**
 * 3/11 : « Feedback au bot » sur une carte proposée par un bot (ou fermée par
 * lui avec « close »). Ne change rien à la carte : Valider, Ignorer, Fermer
 * restent à côté.
 */
export function FeedbackBot({ p, dernier, compact = false }: { p: Pick<Probleme, "id" | "propose_par">; dernier?: BotFeedback; compact?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [verdict, setVerdict] = React.useState<Verdict | null>(null);
  const [raison, setRaison] = React.useState("");
  const [donne, setDonne] = React.useState<BotFeedback | null>(null);
  const envoyer = useMutation({
    mutationFn: (v: Verdict) => donnerFeedback(p.id, v, v === "juste" ? (raison.trim() || null) : raison.trim()),
    onSuccess: (f) => {
      setDonne(f);
      setVerdict(null);
      setRaison("");
      void qc.invalidateQueries({ queryKey: ["bots"] });
    },
  });
  const vu = donne ?? dernier ?? null;
  const choisir = (v: Verdict) => {
    if (!raisonObligatoire(v)) return envoyer.mutate(v);
    setVerdict(verdict === v ? null : v);
  };

  return (
    <div className={cn("space-y-1 rounded-md border border-dashed p-2", compact && "p-1.5")} data-testid="feedback-bot">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-medium">{t(`${P}.feedback.titre`, { bot: t(`${P}.proprietaires.${p.propose_par}`, { defaultValue: p.propose_par ?? "" }) })}</span>
        {VERDICTS.map((v) => (
          <Button key={v} size="sm" variant={verdict === v ? "default" : "outline"} className="h-7 px-2 text-xs"
            onClick={() => choisir(v)} disabled={envoyer.isPending} data-testid={`verdict-${v}`}>
            {EMOJI_VERDICT[v]} {t(`${P}.feedback.verdicts.${v}`)}
          </Button>
        ))}
      </div>
      {verdict && (
        <div className="flex flex-wrap items-end gap-2">
          <Textarea value={raison} onChange={(e) => setRaison(e.target.value)} rows={2} className="min-w-[16rem] flex-1 text-xs"
            placeholder={t(`${P}.feedback.pourquoiExemple`)} aria-label={t(`${P}.feedback.pourquoi`)} />
          <Button size="sm" className="h-8 text-xs" disabled={!raison.trim() || envoyer.isPending} onClick={() => envoyer.mutate(verdict)}>
            {t(`${P}.feedback.envoyer`)}
          </Button>
        </div>
      )}
      {envoyer.error && <p className="text-xs text-destructive">{(envoyer.error as Error).message}</p>}
      {vu && (
        <p className="text-xs text-muted-foreground" data-testid="feedback-donne">
          {t(`${P}.feedback.donne`, { verdict: `${EMOJI_VERDICT[vu.verdict]} ${t(`${P}.feedback.verdicts.${vu.verdict}`)}` })}
          {vu.raison && <> : « {vu.raison} »</>}
          {vu.verdict !== "juste" && !vu.en_regle && (
            <> · <Link to={`/admin/auto/regles-bots?feedback=${vu.id}`} className="underline">{t(`${P}.feedback.enRegle`)}</Link></>
          )}
        </p>
      )}
    </div>
  );
}

/** Le compteur par bot : % de 👍 sur 7 jours et les catégories où il se trompe le plus. */
export function StatsBots() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["bots", "stats"], queryFn: lireStatsBots });
  if (!lu.data) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-xs" data-testid="stats-bots">
      {lu.data.map((s) => {
        const pc = pourcentJuste(s);
        return (
          <span key={s.bot}>
            <span className="font-medium">{t(`${P}.proprietaires.${s.bot}`)}</span>{" "}
            {pc === null ? t(`${P}.feedback.statsVide`) : t(`${P}.feedback.stats`, { pc, n: s.total })}
            {s.erreurs.length > 0 && (
              <span className="text-amber-700">
                {" "}· {t(`${P}.feedback.seTrompe`)}{" "}
                {s.erreurs.map((e) => `${t(`${P}.categories.${e.categorie}`, { defaultValue: e.categorie })} (${e.n})`).join(", ")}
              </span>
            )}
          </span>
        );
      })}
      <Link to="/admin/auto/regles-bots" className="ml-auto underline">{t(`${P}.regles.lien`)}</Link>
    </div>
  );
}
