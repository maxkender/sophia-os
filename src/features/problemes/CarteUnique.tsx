import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { drapeau, nomPays } from "@/features/decisionPays/logique";
import { releverCompte } from "@/features/needsYou/api";
import { cn } from "@/lib/utils";
import { localeDate } from "@/locales/localeDate";

import {
  agirProbleme,
  dejaEcritAujourdhui,
  deciderProbleme,
  deciderRituel,
  donnerFeedback,
  envoyerLienMotDePasse,
  envoyerSlack,
  envoyerUpwork,
  killSamedi,
  type Probleme,
  type Situation,
} from "./api";
import { MessagesCarte } from "./MessagesCarte";
import {
  avecLigneStop,
  debutJourParis,
  estArret,
  estBot,
  estDecision,
  etapesManquantes,
  feedbackAuto,
  groupeDe,
  phraseProbleme,
  planDecision,
  planFaire,
  samediDe,
  texteProposition,
  type PlanFaire,
} from "./logique";

const P = "problemes";
const C = "problemes.carte";

const jour = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(localeDate(), { day: "numeric", month: "short" });

/** Les autres gestes possibles (« Autre choix ▾ ») d'une carte qui n'est pas une décision. */
const AUTRES: readonly PlanFaire["type"][] = ["reponse", "kill", "motDePasse", "fiche", "fermer"];

function Situation_({ s, onboarding }: { s: Situation; onboarding: boolean }) {
  const { t } = useTranslation();
  const manque = etapesManquantes(s).filter((e) => onboarding || e === "slack");
  const pp = s.paie_passee;
  return (
    <ul className="space-y-0.5 text-xs" data-testid="situation">
      <li>{t(`${P}.sit.posts`, { posts: s.posts, attendus: s.attendus })}</li>
      {manque.length > 0 && <li className="text-red-600">✗ {t(`${P}.sit.manque`, { etapes: manque.map((e) => t(`${P}.sit.etape.${e}`)).join(", ") })}</li>}
      <li>
        {s.paye_passee
          ? t(`${P}.sit.paiePayee`, { semaine: jour(pp.semaine), montant: pp.montant ?? 0, date: pp.paye_at ? jour(pp.paye_at) : "—" })
          : t(`${P}.sit.paieNonPayee`, { semaine: jour(pp.semaine), montant: pp.montant ?? 0 })}
      </li>
      {(s.nb_reports ?? 0) > 0 && <li className="text-amber-700">{t(`${P}.sit.reports`, { count: s.nb_reports })}</li>}
    </ul>
  );
}

/**
 * 4/11 : la carte unique. Nom · pays · HM · groupe ; ❓ ce qui bloque ; 🧠 ce
 * que le bot a compris ; 👉 ce qu'il propose et le message en entier.
 * « ✅ Faire ça » fait tout : l'action ET le message (mode « on » seulement ;
 * en test, rien ne part). Jamais d'argent : il ouvre le contrat. Le feedback
 * au bot est automatique (✅ bon, ✏️ correction, Ignorer pas un problème).
 */
export function CarteUnique({ p, mode, surlignee = false }: { p: Probleme; mode: "test" | "on"; surlignee?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [edition, setEdition] = React.useState(false);
  const [texte, setTexte] = React.useState(texteProposition(p) ?? "");
  const [details, setDetails] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const s = p.situation ?? null;
  const groupe = groupeDe(p);
  const plan = planFaire(p);
  const decision = estDecision(p);
  const propose = texteProposition(p);
  const corrige = edition && texte.trim() !== (propose ?? "").trim();
  const rafraichir = () => void qc.invalidateQueries({ queryKey: ["problemes"] });

  const feedback = async (geste: "fait" | "corrige" | "ignore") => {
    if (!estBot(p.propose_par)) return;
    const f = feedbackAuto(geste, texte);
    await donnerFeedback(p.id, f.verdict, f.raison).catch(() => undefined);
  };

  /** Envoie le message (mode « on ») : à l'HM en DM Slack, au posteur sur Upwork (compte de Max) ou en DM Slack. */
  const envoyer = async (corps: string): Promise<boolean> => {
    const msg = corps.trim();
    if (!msg || mode !== "on") return false;
    if (p.destinataire === "hm") {
      if (!p.hm_id) throw new Error(t(`${C}.sansHm`));
      await envoyerSlack(p.hm_id, msg);
      return true;
    }
    if (!p.poster_id) return false;
    if (p.canal_reponse === "slack") {
      await envoyerSlack(p.poster_id, msg);
      return true;
    }
    if (await dejaEcritAujourdhui(p.poster_id, debutJourParis())) throw new Error(t(`${P}.unParJour`));
    await envoyerUpwork(p.poster_id, estArret(p) ? msg : avecLigneStop(msg));
    return true;
  };

  const faire = useMutation({
    mutationFn: async (choix: { plan: PlanFaire; index?: number }) => {
      const corps = texte;
      let envoye = false;
      let note: string | null = null;
      switch (choix.plan.type) {
        case "decision": {
          const i = choix.index ?? 0;
          const o = p.options![i]!;
          const pl = planDecision({ ...o, reponse: i === 0 && edition ? corps : o.reponse }, p, mode);
          if (pl.ouvrir) window.open(pl.ouvrir, "_blank", "noopener,noreferrer");
          if (pl.motDePasse) {
            await envoyerLienMotDePasse(pl.motDePasse);
            envoye = true;
          }
          if (pl.envoyer || pl.aCopier) envoye = (await envoyer(pl.envoyer ?? pl.aCopier ?? "")) || envoye;
          await deciderProbleme(p.id, i, envoye);
          if (pl.page) navigate(pl.page);
          note = pl.ouvrir ? t(`${P}.decision.paie`) : null;
          break;
        }
        case "kill":
          await killSamedi(p.id);
          if (corps.trim()) envoye = await envoyer(corps);
          break;
        case "rituel":
          await deciderRituel(p.id, choix.plan.choix);
          break;
        case "argent":
          // L'OS ne paie jamais : le contrat (ou Payroll / Who to fund) s'ouvre ; la carte se ferme quand la paie est faite.
          if (choix.plan.url) window.open(choix.plan.url, "_blank", "noopener,noreferrer");
          else navigate(choix.plan.vers);
          note = t(`${P}.decision.paie`);
          return { envoye, note };
        case "motDePasse":
          if (mode === "on" && p.poster_id) {
            await envoyerLienMotDePasse(p.poster_id);
            envoye = true;
          }
          if (corps.trim()) envoye = (await envoyer(corps)) || envoye;
          await agirProbleme(p.id, "valider", { envoye, action: p.proposition_action, reponse: corps });
          break;
        case "releve":
          await releverCompte(choix.plan.compte_id);
          if (corps.trim()) envoye = await envoyer(corps);
          await agirProbleme(p.id, "valider", { envoye, action: p.proposition_action, reponse: corps });
          break;
        case "fiche":
          navigate(choix.plan.vers);
          return { envoye, note };
        case "reponse":
          envoye = await envoyer(corps);
          await agirProbleme(p.id, "valider", { envoye, action: p.proposition_action, reponse: corps });
          break;
        case "fermer":
          await agirProbleme(p.id, "fermer");
          break;
      }
      await feedback(corrige ? "corrige" : "fait");
      return { envoye, note };
    },
    onSuccess: (r) => {
      setMessage(r.note ?? (r.envoye ? t(`${C}.fait`) : mode === "test" ? t(`${P}.rienEnvoye`) : t(`${C}.note`)));
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  const autre = useMutation({
    mutationFn: async (geste: "samedi" | "ignorer" | "modifier") => {
      if (geste === "modifier") {
        await agirProbleme(p.id, "modifier", { reponse: texte });
        setEdition(false);
        return;
      }
      await agirProbleme(p.id, geste);
      if (geste === "ignorer") await feedback("ignore");
    },
    onSuccess: rafraichir,
    onError: (e) => setMessage((e as Error).message),
  });

  const nom = p.sujet && p.sujet !== "posteur" && !p.poster_id ? p.hm_nom : p.nom ?? p.contrat_id;
  const phrase = phraseProbleme(p, localeDate());
  const bloque = p.sans_reponse
    ? { texte: p.sans_reponse.texte, meta: t(`${C}.sansReponse`, { canal: t(`${P}.messages.canaux.${p.sans_reponse.canal}`), heures: p.sans_reponse.depuis_heures }) }
    : { texte: p.question ?? (phrase ? t(`${P}.${phrase.cle}`, phrase.vars) : p.resume), meta: null };
  const libelleAction = decision
    ? p.options![0]!.libelle
    : plan.type === "kill" && p.kill_samedi_lundi
      ? t(`${P}.kill.prevu`, { date: samediDe(p.kill_samedi_lundi) })
      : t(`${C}.actions.${plan.type === "rituel" ? plan.choix : plan.type}`);
  const sujets = p.sujets ?? [];

  return (
    <Card data-testid="carte-probleme" id={`probleme-${p.id}`} className={cn(surlignee && "ring-2 ring-primary")}>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{nom ?? t(`${P}.sansPosteur`)}</span>
          {s?.pays && <span className="text-muted-foreground">· {drapeau(s.pays)} {nomPays(s.pays, i18next.resolvedLanguage ?? "fr")}</span>}
          {(p.hm || p.hm_nom) && <span className="text-muted-foreground">· {t(`${P}.hm`, { hm: p.hm ?? p.hm_nom })}</span>}
          <span className="text-muted-foreground">· {t(`${P}.groupes.${groupe}`)}</span>
          <Badge variant="outline">{t(`${P}.categories.${p.categorie}`, { defaultValue: p.categorie })}</Badge>
          {sujets.length > 0 && <Badge variant="secondary" data-testid="nb-sujets">{t(`${C}.sujets`, { count: sujets.length })}</Badge>}
          {p.actif === false && <Badge variant="secondary">{t(`${P}.inactif`)}</Badge>}
        </div>

        <div data-testid="bloque">
          <p className="font-medium">❓ {bloque.meta && <span className="text-xs font-normal text-red-600">{bloque.meta} </span>}</p>
          <p className="whitespace-pre-wrap">{bloque.texte}</p>
        </div>
        {p.diagnostic?.trim() && <p data-testid="compris">🧠 {p.diagnostic}</p>}
        <div data-testid="propose">
          <p className="font-medium">👉 {libelleAction}</p>
          {edition ? (
            <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} />
          ) : (
            propose && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2">{propose}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={() => faire.mutate({ plan })} disabled={faire.isPending} data-testid="faire">
            ✅ {t(`${C}.faire`)}
          </Button>
          {edition ? (
            <Button size="sm" variant="outline" onClick={() => autre.mutate("modifier")} disabled={autre.isPending}>💾 {t(`${P}.enregistrer`)}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEdition(true)} data-testid="modifier">✏️ {t(`${P}.modifier`)}</Button>
          )}
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            aria-label={t(`${C}.autre`)}
            data-testid="autre-choix"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v.startsWith("option:")) faire.mutate({ plan: { type: "decision", index: Number(v.slice(7)) }, index: Number(v.slice(7)) });
              else if (v === "double" || v === "recreate") faire.mutate({ plan: { type: "rituel", choix: v } });
              else if (v === "kill") faire.mutate({ plan: { type: "kill" } });
              else if (v === "fiche") faire.mutate({ plan: { type: "fiche", vers: p.poster_id ? `/admin/posters?poster=${p.poster_id}` : "/admin/posters" } });
              else faire.mutate({ plan: { type: v as "reponse" | "motDePasse" | "fermer" } as PlanFaire });
            }}
          >
            <option value="">{t(`${C}.autre`)} ▾</option>
            {decision && p.options!.slice(1).map((o, i) => <option key={i} value={`option:${i + 1}`}>{o.libelle}</option>)}
            {!decision && p.poster_id && (
              <>
                {AUTRES.filter((a) => a !== plan.type).map((a) => <option key={a} value={a}>{t(`${C}.actions.${a}`)}</option>)}
                <option value="double">{t(`${C}.actions.double`)}</option>
                <option value="recreate">{t(`${C}.actions.recreate`)}</option>
              </>
            )}
          </select>
          {p.niveau !== "samedi" && (
            <Button size="sm" variant="outline" onClick={() => autre.mutate("samedi")} disabled={autre.isPending}>📅 {t(`${P}.samedi`)}</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => autre.mutate("ignorer")} disabled={autre.isPending}>{t(`${P}.ignorer`)}</Button>
          <button type="button" className="ml-auto text-xs text-primary underline" onClick={() => setDetails(!details)} data-testid="details">
            {details ? "⌃" : "⌄"} {t(`${C}.details`)}
          </button>
        </div>
        {message && <p className="text-xs text-muted-foreground" data-testid="carte-message">{message}</p>}

        {details && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-2" data-testid="carte-details">
            {sujets.length > 0 && (
              <ul className="space-y-0.5 text-xs" data-testid="sujets">
                {sujets.map((x, i) => (
                  <li key={i}>
                    <Badge variant="outline">{t(`${P}.categories.${x.categorie}`, { defaultValue: x.categorie })}</Badge> {x.question ?? x.diagnostic ?? x.resume}
                  </li>
                ))}
              </ul>
            )}
            {s && <Situation_ s={s} onboarding={groupe === "onboarding"} />}
            <MessagesCarte messages={p.messages} sansReponse={null} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
