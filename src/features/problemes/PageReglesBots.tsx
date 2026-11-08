import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { BancBots } from "./BancBots";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { localeDate } from "@/locales/localeDate";

import { activerRegle, enregistrerRegle, lireFeedbacks, lireRegles, type BotFeedback, type BotRegle } from "./api";
import { EMOJI_VERDICT, PROPRIETAIRES, regleDepuisFeedback } from "./logique";

const P = "problemes";
const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

interface Brouillon {
  id: string | null;
  bot: BotRegle;
  regle: string;
  exemple: string | null;
  sources: string[];
  active: boolean;
}

const VIDE: Brouillon = { id: null, bot: "tous", regle: "", exemple: null, sources: [], active: true };

/**
 * 3/11 : « Règles des bots ». Des règles courtes (1-2 phrases + un exemple)
 * que les bots lisent (vue bots_apprentissage), souvent tirées d'un feedback.
 */
export function PageReglesBots() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const regles = useQuery({ queryKey: ["bots", "regles"], queryFn: lireRegles });
  const feedbacks = useQuery({ queryKey: ["bots", "feedbacks"], queryFn: () => lireFeedbacks(30) });
  const [b, setB] = React.useState<Brouillon>(VIDE);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["bots"] });

  // « En faire une règle » depuis une carte : ?feedback=<id> pré-remplit le formulaire.
  const depuis = params.get("feedback");
  React.useEffect(() => {
    const f = depuis ? feedbacks.data?.find((x) => x.id === depuis) : undefined;
    if (f) {
      setB(regleDepuisFeedback(f));
      setParams({}, { replace: true });
    }
  }, [depuis, feedbacks.data, setParams]);

  const enregistrer = useMutation({
    mutationFn: () => enregistrerRegle({ ...b, regle: b.regle.trim(), exemple: b.exemple?.trim() || null }),
    onSuccess: () => { setB(VIDE); void rafraichir(); },
  });
  const activer = useMutation({ mutationFn: (x: { id: string; active: boolean }) => activerRegle(x.id, x.active), onSuccess: rafraichir });
  const nomBot = (x: string) => (x === "tous" ? t(`${P}.regles.tous`) : t(`${P}.proprietaires.${x}`));

  return (
    <div className="space-y-4" data-testid="page-regles-bots">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t(`${P}.regles.titre`)}</h2>
        <Link to="/admin/auto/problemes" className="ml-auto text-xs underline">{t(`${P}.regles.retour`)}</Link>
      </div>
      <p className="text-sm text-muted-foreground">{t(`${P}.regles.aide`)}</p>

      <BancBots />

      <Card>
        <CardContent className="space-y-2 p-4" data-testid="form-regle">
          <p className="text-sm font-medium">{b.id ? t(`${P}.regles.modifierTitre`) : t(`${P}.regles.nouvelle`)}</p>
          <div className="flex flex-wrap gap-2">
            <select className={selectClass} value={b.bot} onChange={(e) => setB({ ...b, bot: e.target.value as BotRegle })} aria-label={t(`${P}.regles.bot`)}>
              <option value="tous">{t(`${P}.regles.tous`)}</option>
              {PROPRIETAIRES.map((x) => <option key={x} value={x}>{t(`${P}.proprietaires.${x}`)}</option>)}
            </select>
            {b.sources.length > 0 && <span className="self-center text-xs text-muted-foreground">{t(`${P}.regles.depuisFeedback`, { count: b.sources.length })}</span>}
          </div>
          <Textarea value={b.regle} onChange={(e) => setB({ ...b, regle: e.target.value })} rows={2} maxLength={500}
            placeholder={t(`${P}.regles.reglePlaceholder`)} aria-label={t(`${P}.regles.regle`)} />
          <Textarea value={b.exemple ?? ""} onChange={(e) => setB({ ...b, exemple: e.target.value })} rows={2}
            placeholder={t(`${P}.regles.exemplePlaceholder`)} aria-label={t(`${P}.regles.exemple`)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => enregistrer.mutate()} disabled={!b.regle.trim() || enregistrer.isPending}>💾 {t(`${P}.enregistrer`)}</Button>
            {(b.id || b.regle) && <Button size="sm" variant="outline" onClick={() => setB(VIDE)}>{t(`${P}.regles.annuler`)}</Button>}
          </div>
          {enregistrer.error && <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h3 className="font-semibold">{t(`${P}.regles.liste`, { count: regles.data?.length ?? 0 })}</h3>
        {(regles.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t(`${P}.regles.aucune`)}</p>}
        <ul className="space-y-2">
          {(regles.data ?? []).map((r) => (
            <li key={r.id} className="rounded-md border p-3 text-sm" data-testid="regle">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.active ? "default" : "secondary"}>{r.active ? t(`${P}.regles.active`) : t(`${P}.regles.inactive`)}</Badge>
                <span className="text-xs text-muted-foreground">{nomBot(r.bot)} · {new Date(r.created_at).toLocaleDateString(localeDate())}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setB({ id: r.id, bot: r.bot, regle: r.regle, exemple: r.exemple, sources: r.source_feedback_ids, active: r.active })}>
                    ✏️ {t(`${P}.modifier`)}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => activer.mutate({ id: r.id, active: !r.active })} disabled={activer.isPending}>
                    {r.active ? t(`${P}.regles.desactiver`) : t(`${P}.regles.activer`)}
                  </Button>
                </div>
              </div>
              <p className="mt-1 font-medium">{r.regle}</p>
              {r.exemple && <p className="text-xs text-muted-foreground">{t(`${P}.regles.ex`)} {r.exemple}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t(`${P}.regles.feedbacks`, { count: feedbacks.data?.length ?? 0 })}</h3>
        {(feedbacks.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t(`${P}.regles.aucunFeedback`)}</p>}
        <ul className="space-y-1">
          {(feedbacks.data ?? []).map((f: BotFeedback) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-1.5 text-sm" data-testid="feedback">
              <span>{EMOJI_VERDICT[f.verdict]} {t(`${P}.feedback.verdicts.${f.verdict}`)}</span>
              <span className="text-xs text-muted-foreground">
                {t(`${P}.proprietaires.${f.bot}`)} · {f.nom ?? "—"} · {t(`${P}.categories.${f.categorie ?? "autre"}`, { defaultValue: f.categorie ?? "—" })}
              </span>
              {f.raison && <span>« {f.raison} »</span>}
              {f.diagnostic_du_bot && <span className="text-xs text-muted-foreground">{t(`${P}.regles.botAvaitDit`)} {f.diagnostic_du_bot}</span>}
              {f.verdict !== "juste" && (
                <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={f.en_regle} onClick={() => setB(regleDepuisFeedback(f))}>
                  {f.en_regle ? t(`${P}.regles.dejaRegle`) : t(`${P}.feedback.enRegle`)}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
