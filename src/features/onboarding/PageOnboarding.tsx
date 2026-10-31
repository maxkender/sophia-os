import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { BoutonsTest } from "@/features/auto/test/ContratsTest";
import { arreterRecrueSamedi, reporterRecrue } from "@/features/cohortes/api";
import { ResumeContexte } from "@/features/ckd/decisions/ResumeContexte";
import { type EvenementFil, resumer } from "@/features/ckd/decisions/resumeContexte";
import { BadgeDemande } from "@/features/ckd/decisions/ListeSamedi";
import { type DemandeArret, lireDemandesArret } from "@/features/ckd/decisions/semaineComptes";
import { invoke } from "@/features/moteur/api";
import { envoyerSurUpwork } from "@/features/pipeline/api";
import { useReglages } from "@/features/reglagesOs/useReglages";
import { type Conversation, useConversations, conversationDe } from "@/features/upwork/conversation";
import { LienConversation } from "@/features/upwork/LienConversation";
import { localeDate } from "@/locales/localeDate";
import { cn } from "@/lib/utils";

import {
  ETAPES_ONBOARDING,
  etapeCourante,
  etapesRecrue,
  type FiltresOnboarding,
  filtrerOnboarding,
  heuresDepuis,
  lireDerniersReleves,
  lireEcartsPays,
  lireMessagesRecus,
  type MessageRecu,
  lireOnboarding,
  type RecrueOnboarding,
  type ReleveRecrue,
} from "./api";
import { type Canal, CLE_NUDGES, composerNudge, envoyerNudge, joignable, lireNudges, situation } from "./nudges";
import { aVerifier, confirmerPays, lirePaysRecrues, type PaysRecrue } from "./paysRecrue";
import { lireCompteurRelances, lireRelances, type RelanceRecrue } from "./relances";

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

function useFormats() {
  const { i18n } = useTranslation();
  const langue = localeDate(i18n.resolvedLanguage ?? "fr");
  const heure = new Intl.DateTimeFormat(langue, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const jour = new Intl.DateTimeFormat(langue, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return {
    le: (iso: string | null) => (iso ? heure.format(new Date(iso)) : "—"),
    jour: (d: string) => jour.format(new Date(`${d}T12:00:00Z`)),
  };
}

/** Le fil d'une recrue : nos messages (et ses réponses), et ce qu'elle a écrit (Slack, Upwork, dashboard). */
function filRecrue(r: RecrueOnboarding, recus: MessageRecu[]): EvenementFil[] {
  const vus = new Set<string>();
  const fil: EvenementFil[] = [];
  const ajouter = (e: EvenementFil) => {
    const cle = `${e.sens}:${e.at.slice(0, 16)}:${(e.texte ?? "").slice(0, 20)}`;
    if (!vus.has(cle)) {
      vus.add(cle);
      fil.push(e);
    }
  };
  for (const m of r.messages) {
    if (m.statut !== "erreur" && m.at) ajouter({ sens: "envoye", at: m.at, canal: (m.canaux?.length ? m.canaux.join("+") : m.canal) ?? null, texte: m.texte });
    if (m.reponse?.at) ajouter({ sens: "recu", at: m.reponse.at, canal: m.reponse.canal ?? null, texte: m.reponse.texte ?? null });
  }
  for (const m of recus) if (m.recu_at) ajouter({ sens: "recu", at: m.recu_at, canal: m.canal ?? null, texte: m.texte ?? null, cas: m.cas ?? null });
  return fil;
}

/** Une recrue : qui, son contrat, ses étapes, ses messages, la prochaine relance, et les boutons. */
/** 31/10 (0482) : le pays de la recrue : OK, en lecture, confirmé, ou « Country to check » avec la raison. */
function LignePays({ p }: { p: PaysRecrue }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const confirmer = useMutation({
    mutationFn: () => confirmerPays(p.poster_id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["onboarding-pays"] }),
  });
  const base = [p.pays_hm ?? "—", p.zone_hm ? t("onboardingPosters.pays.zone", { zone: p.zone_hm }) : null].filter(Boolean).join(" · ");
  const vit = p.pays_vit ? t("onboardingPosters.pays.vit", { pays: [p.ville, p.pays_vit].filter(Boolean).join(", ") }) : null;
  const annonce = p.annonce_zone
    ? t("onboardingPosters.pays.annonceZone", { zone: p.annonce_zone })
    : p.annonce_pays ? t("onboardingPosters.pays.annoncePays", { pays: p.annonce_pays }) : null;
  return (
    <div className="space-y-1" data-pays={p.verdict}>
      <p>
        <span className="font-medium">{base}</span>
        {[vit, annonce].filter(Boolean).map((x) => <span key={x} className="text-muted-foreground"> · {x}</span>)}
        {p.verdict === "ok" && <Badge variant="success" className="ml-2">{t("onboardingPosters.pays.ok")}</Badge>}
        {p.verdict === "en_lecture" && <span className="ml-2 text-muted-foreground">{t("onboardingPosters.pays.lecture")}</span>}
        {p.verdict === "confirme" && (
          <Badge variant="success" className="ml-2">{t("onboardingPosters.pays.confirme", { nom: p.confirme_par_nom ?? "?" })}</Badge>
        )}
      </p>
      {p.verdict === "a_verifier" && (
        <div className="flex flex-wrap items-center gap-2" data-testid="pays-a-verifier">
          <Badge variant="warning">{t("onboardingPosters.pays.aVerifier")}</Badge>
          <span className="text-warning-foreground">{p.raisons.join(" · ")}</span>
          {(role === "admin" || role === "head_of_ops") && p.pays_hm && (
            <Button size="xs" variant="outline" loading={confirmer.isPending} onClick={() => confirmer.mutate()}>
              {t("onboardingPosters.pays.confirmer", { pays: p.pays_hm })}
            </Button>
          )}
        </div>
      )}
      {confirmer.error && <p className="text-destructive">{(confirmer.error as Error).message}</p>}
    </div>
  );
}

function CarteRecrue({
  r,
  releve,
  recus = [],
  conv,
  ecart,
  pays,
  modeles,
  lienSlack = "",
  demande,
  relance,
}: {
  r: RecrueOnboarding;
  /** 31/10 : une demande d'arrêt ouverte (STOP, message, bouton) : elle se traite ici, plus le samedi. */
  demande?: DemandeArret;
  /** 1/11 : la dernière relance (étape, canal, heure, Upwork prévu). */
  relance?: RelanceRecrue;
  /** 31/10 (0482) : le pays vérifié (HM, lieu du freelance, annonce). */
  pays?: PaysRecrue;
  releve?: ReleveRecrue;
  recus?: MessageRecu[];
  conv?: Conversation;
  /** 0470 : « Lives in X, job post Y » (créé avec le pays de l'annonce). */
  ecart?: string;
  /** Les messages par situation (réglage onboarding_nudges). */
  modeles?: Record<string, string>;
  /** Le lien d'invitation Slack (réglage slack_lien_invitation). */
  lienSlack?: string;
}) {
  const { t } = useTranslation();
  const { le, jour } = useFormats();
  const admin = useAuth().role === "admin";
  const qc = useQueryClient();
  const [ecrire, setEcrire] = React.useState(false);
  const [texte, setTexte] = React.useState("");
  const [bilan, setBilan] = React.useState<string | null>(null);
  // Nudge on Upwork / Nudge on Slack : le message de sa situation, modifiable avant l'envoi.
  const [nudge, setNudge] = React.useState<Canal | null>(null);
  const [texteNudge, setTexteNudge] = React.useState("");
  const ouvrirNudge = (canal: Canal) => {
    setNudge(canal);
    setTexteNudge(composerNudge((modeles ?? lireNudges(null))[situation(r)], r, canal, lienSlack));
  };
  const envoyerLeNudge = useMutation({
    mutationFn: () => envoyerNudge(r.poster_id, nudge!, texteNudge.trim()),
    onSuccess: () => {
      setBilan(t(nudge === "slack" ? "onboardingPosters.nudges.parti_slack" : "onboardingPosters.nudges.parti_upwork"));
      setNudge(null);
      recharger();
    },
  });
  const recharger = () => void qc.invalidateQueries({ queryKey: ["onboarding"] });
  const envoyer = useMutation({
    mutationFn: () => envoyerSurUpwork(r.poster_id, texte.trim(), "onboarding"),
    onSuccess: () => {
      setEcrire(false);
      setTexte("");
      setBilan(t("onboardingPosters.envoye"));
      recharger();
    },
  });
  const reporter = useMutation({
    mutationFn: () => reporterRecrue(r.poster_id),
    onSuccess: (lundi) => {
      setBilan(t("onboardingPosters.reporte", { date: jour(lundi) }));
      recharger();
    },
  });
  const arreter = useMutation({
    // 31/10 : la cohorte qui arrive ne passe plus par le samedi : le Kill se fait ici, au clic,
    // comme Validate le samedi (sans message ; contrat fermé lundi après la paie, selon Full stop).
    mutationFn: async () => {
      await arreterRecrueSamedi(r.poster_id);
      await invoke("upwork", { action: "arrets" }).catch(() => undefined);
    },
    onSuccess: () => {
      setBilan(t("onboardingPosters.arrete"));
      recharger();
    },
  });
  const contrat = r.contrat_url ?? (r.contrat_id ? `https://www.upwork.com/nx/wm/workroom/${r.contrat_id}/overview` : null);
  const erreur = envoyer.error ?? envoyerLeNudge.error ?? reporter.error ?? arreter.error;
  return (
    <Card id={`recrue-${r.poster_id}`} data-recrue={r.poster_id} data-etape={etapeCourante(r)}>
      <CardContent className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {r.test && <Badge variant="info">TEST</Badge>}
          <span className="font-semibold">{r.nom ?? "—"}</span>
          <span className="text-muted-foreground">
            {t("onboardingPosters.qui", { hm: r.hm_nom ?? "—", pays: r.pays ?? "—", cohorte: jour(r.cohorte_lundi) })}
          </span>
          {ecart && <Badge variant="warning" data-testid="ecart-pays">{ecart}</Badge>}
        </div>
        {demande && <BadgeDemande d={demande} />}
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t("onboardingPosters.contrat")}</dt>
          <dd>
            {/* 0469 : la conversation Upwork et le contrat. */}
            {conv ? (
              <LienConversation c={conv.contrat_id ? conv : { contrat_id: r.contrat_id ?? null, room_id: null }} />
            ) : contrat ? (
              <a className="underline" href={contrat} target="_blank" rel="noreferrer">
                {r.contrat_id ?? contrat}
              </a>
            ) : (
              "—"
            )}
          </dd>
          {pays && (
            <>
              <dt className="text-muted-foreground">{t("onboardingPosters.pays.titre")}</dt>
              <dd><LignePays p={pays} /></dd>
            </>
          )}
          <dt className="text-muted-foreground">{t("onboardingPosters.relance.titre")}</dt>
          <dd data-testid="relance-recrue">
            {relance ? (
              <>
                {t("onboardingPosters.relance.ligne", {
                  etape: t(`onboardingPosters.relance.etapes.${relance.etape ?? "autre"}`, { defaultValue: relance.etape ?? "—" }),
                  canal: t(`onboardingPosters.relance.canaux.${relance.canal}`),
                  heure: le(relance.envoye_at),
                })}
                {relance.upwork_prevu_at && (
                  <span className="ml-1 text-muted-foreground">· {t("onboardingPosters.relance.upworkPrevu", { heure: le(relance.upwork_prevu_at) })}</span>
                )}
              </>
            ) : (
              t("onboardingPosters.relance.aucune")
            )}
          </dd>
          <dt className="text-muted-foreground">{t("onboardingPosters.login")}</dt>
          <dd>{r.email ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("onboardingPosters.slack")}</dt>
          <dd>{t(r.slack ? "onboardingPosters.surSlack" : "onboardingPosters.pasSlack")}</dd>
          {r.handle && (
            <>
              <dt className="text-muted-foreground">{t("onboardingPosters.handle")}</dt>
              <dd>
                {/* Le compte TikTok, dans un nouvel onglet. */}
                <a className="underline" href={`https://www.tiktok.com/@${r.handle}`} target="_blank" rel="noreferrer" data-testid="lien-tiktok">
                  @{r.handle}
                </a>
              </dd>
            </>
          )}
          {/* Prompt 25 MAJ, 7b : l'âge du dernier relevé lisible (une relance sur le compte n'en utilise qu'un de moins de 12 h). */}
          {releve && (
            <>
              <dt className="text-muted-foreground">{t("onboardingPosters.releve")}</dt>
              <dd data-testid="releve">
                {releve.releve_at ? t("onboardingPosters.releveIlYa", { h: heuresDepuis(releve.releve_at) }) : t("onboardingPosters.releveJamais")}
                {releve.tentative_at && releve.tentative_at !== releve.releve_at && (
                  <span className="text-warning"> {t("onboardingPosters.releveEchecs", { h: heuresDepuis(releve.releve_at ?? releve.tentative_at) })}</span>
                )}
              </dd>
            </>
          )}
        </dl>

        {/* Le contexte : ce qui s'est dit avec la HM ou le bot, et s'il ne répond pas, depuis quand. */}
        <ResumeContexte r={resumer(filRecrue(r, recus))} derniereConnexion={r.connexion_at} />

        <ol className="grid gap-1 text-xs sm:grid-cols-5" data-testid="etapes">
          {etapesRecrue(r).map((e, i) => (
            <li key={e.etape} className={cn("flex items-start gap-1.5", !e.fait && "text-muted-foreground")} data-etape-faite={e.fait}>
              {e.fait ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-foreground" aria-hidden /> : <Circle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
              <span>
                {t(`onboardingPosters.etapes.${e.etape}`, { n: i })}
                {e.at && <span className="block tabular-nums">{le(e.at)}</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="space-y-1">
          <p className="text-xs font-medium">{t("onboardingPosters.messages", { n: r.messages.length })}</p>
          {r.messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("onboardingPosters.aucunMessage")}</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-xs" data-testid="messages">
              {r.messages.map((m) => (
                <li key={m.id} className="space-y-0.5 p-2" data-message={m.type}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{le(m.at)}</span>
                    <span className="font-medium">{t(`autoOnglets.attente.types.${m.type}`, { defaultValue: m.type })}</span>
                    <Badge variant="secondary">{(m.canaux?.length ? m.canaux : [m.canal ?? "—"]).join(" + ")}</Badge>
                    {m.expediteur && m.expediteur !== "slack" && (
                      <span className="text-muted-foreground" data-expediteur={m.expediteur}>
                        {m.expediteur === "hm" && m.hm_nom
                          ? t("onboardingPosters.expediteurHm", { hm: m.hm_nom })
                          : t(`onboardingPosters.expediteurs.${m.expediteur}`, { defaultValue: m.expediteur })}
                      </span>
                    )}
                    {m.verif && (
                      <Badge variant={m.verif === "verifie" ? "success" : "error"} data-verif={m.verif}>{t(`onboardingPosters.verifs.${m.verif}`)}</Badge>
                    )}
                    <Badge variant={m.statut === "erreur" ? "error" : "success"}>{t(`onboardingPosters.statuts.${m.statut}`)}</Badge>
                  </div>
                  {m.raison && <p className="italic text-muted-foreground" data-raison>{t("onboardingPosters.raison", { raison: m.raison })}</p>}
                  {m.texte && <p className="whitespace-pre-wrap break-words">{m.texte}</p>}
                  {m.erreur && <p className="text-destructive">{m.erreur}</p>}
                  {m.reponse && (
                    <p className="rounded bg-muted/50 px-2 py-1">
                      {t("onboardingPosters.reponse", { quand: le(m.reponse.at), canal: m.reponse.canal })} {m.reponse.texte}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Décisions finales 4 : les messages reçus de la recrue (Slack, Upwork, dashboard). */}
        <div className="space-y-1" data-testid="recus">
          <p className="text-xs font-medium">{t("onboardingPosters.recus", { n: recus.length })}</p>
          {recus.length > 0 && (
            <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-xs">
              {recus.map((m, i) => (
                <li key={`${m.recu_at}-${i}`} className="space-y-0.5 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">{le(m.recu_at)}</span>
                    <Badge variant="secondary">{m.canal ?? "—"}</Badge>
                    {m.cas && <span className="text-muted-foreground">{t(`reponses.cas.${m.cas}`, { defaultValue: m.cas })}</span>}
                  </div>
                  {m.texte && <p className="whitespace-pre-wrap break-words">{m.texte}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs" data-testid="prochaine">
          <span className="font-medium">{t("onboardingPosters.prochaine")}</span>{" "}
          {r.prochaine
            ? t("onboardingPosters.prochaineDetail", {
              type: t(`autoOnglets.attente.types.${r.prochaine.type}`, { defaultValue: r.prochaine.type }),
              periode: jour(r.prochaine.periode),
              etat: t(r.prochaine.valide ? "onboardingPosters.enFile" : `onboardingPosters.raisons.${r.prochaine.raison ?? "prevu"}`, {
                defaultValue: r.prochaine.raison ?? "",
              }),
            })
            : etapeCourante(r) === "fini"
              ? t("onboardingPosters.rienAFaire")
              : t("onboardingPosters.demain")}
        </p>

        {r.test && admin && <BoutonsTest posterId={r.poster_id} />}

        {admin && (
          <div className="flex flex-wrap gap-2 border-t pt-2">
            <Button size="xs" variant="secondary" disabled={!joignable(r, "upwork")} onClick={() => ouvrirNudge("upwork")} data-testid="nudge-upwork">
              {t("onboardingPosters.nudges.upwork")}
            </Button>
            <Button size="xs" variant="secondary" disabled={!joignable(r, "slack")} onClick={() => ouvrirNudge("slack")} data-testid="nudge-slack">
              {t("onboardingPosters.nudges.slack")}
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setEcrire((x) => !x)}>
              {t("onboardingPosters.ecrire")}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={reporter.isPending}
              onClick={() => {
                if (window.confirm(t("onboardingPosters.confirmReporter", { nom: r.nom ?? "?" }))) reporter.mutate();
              }}
            >
              {t("onboardingPosters.reporter")}
            </Button>
            <Button
              size="xs"
              variant="destructive-outline"
              disabled={arreter.isPending}
              onClick={() => {
                if (window.confirm(t("onboardingPosters.confirmArreter", { nom: r.nom ?? "?" }))) arreter.mutate();
              }}
            >
              {t("onboardingPosters.arreter")}
            </Button>
          </div>
        )}
        {nudge && (
          <div className="space-y-2" data-testid="nudge-texte">
            <p className="text-xs text-muted-foreground">
              {t("onboardingPosters.nudges.situation", { etape: t(`onboardingPosters.nudges.situations.${situation(r)}`) })}
            </p>
            <Textarea
              className="min-h-24 text-xs"
              value={texteNudge}
              aria-label={t("onboardingPosters.nudges.texte", { nom: r.nom ?? "?" })}
              onChange={(e) => setTexteNudge(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="xs" disabled={!texteNudge.trim()} loading={envoyerLeNudge.isPending} onClick={() => envoyerLeNudge.mutate()}>
                {t(nudge === "slack" ? "onboardingPosters.nudges.envoyer_slack" : "onboardingPosters.nudges.envoyer_upwork")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setNudge(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
        {ecrire && (
          <div className="space-y-2">
            <Textarea
              className="min-h-20 text-xs"
              value={texte}
              aria-label={t("onboardingPosters.texte", { nom: r.nom ?? "?" })}
              onChange={(e) => setTexte(e.target.value)}
            />
            <Button
              size="xs"
              disabled={!texte.trim() || envoyer.isPending}
              onClick={() => {
                if (window.confirm(t("onboardingPosters.confirmEnvoyer", { nom: r.nom ?? "?" }))) envoyer.mutate();
              }}
            >
              {t("onboardingPosters.envoyer")}
            </Button>
          </div>
        )}
        {bilan && <p className="text-xs">{bilan}</p>}
        {erreur && <p className="text-xs text-destructive">{(erreur as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * « Nudge all on Slack » / « Nudge all on Upwork » : chaque recrue affichée
 * (pas finie, joignable sur ce canal) reçoit le message de sa situation.
 * Après confirmation, un par un ; le bilan s'affiche.
 */
function NudgeAll({ liste, modeles, lienSlack }: { liste: RecrueOnboarding[]; modeles: Record<string, string>; lienSlack: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [bilan, setBilan] = React.useState<string | null>(null);
  const cibles = (canal: Canal) => liste.filter((r) => etapeCourante(r) !== "fini" && joignable(r, canal));
  const tous = useMutation({
    mutationFn: async (canal: Canal) => {
      let ok = 0;
      const erreurs: string[] = [];
      for (const r of cibles(canal)) {
        try {
          await envoyerNudge(r.poster_id, canal, composerNudge(modeles[situation(r)] ?? "", r, canal, lienSlack));
          ok++;
        } catch (e) {
          erreurs.push(`${r.nom ?? r.poster_id} : ${(e as Error).message}`);
        }
      }
      return { ok, erreurs };
    },
    onSuccess: (b) => {
      setBilan(t("onboardingPosters.nudges.bilan", { ok: b.ok, erreurs: b.erreurs.length }) + (b.erreurs.length ? ` (${b.erreurs.slice(0, 5).join(" · ")})` : ""));
      void qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="nudge-all">
      {(["slack", "upwork"] as const).map((canal) => {
        const n = cibles(canal).length;
        return (
          <Button
            key={canal}
            size="sm"
            variant="outline"
            disabled={n === 0 || tous.isPending}
            loading={tous.isPending && tous.variables === canal}
            onClick={() => {
              if (window.confirm(t("onboardingPosters.nudges.confirmerTous", { n, canal: canal === "slack" ? "Slack" : "Upwork" }))) tous.mutate(canal);
            }}
          >
            {t(canal === "slack" ? "onboardingPosters.nudges.tousSlack" : "onboardingPosters.nudges.tousUpwork", { n })}
          </Button>
        );
      })}
      {bilan && <span className="text-xs" data-testid="bilan-nudges">{bilan}</span>}
    </div>
  );
}

/** Le message de chaque situation (modifiable, réglage onboarding_nudges). */
function MessagesSituations({ modeles, enregistrer }: { modeles: Record<string, string>; enregistrer: (v: Record<string, string>) => Promise<void> }) {
  const { t } = useTranslation();
  const [v, setV] = React.useState(modeles);
  React.useEffect(() => setV(modeles), [modeles]);
  const sauver = useMutation({ mutationFn: () => enregistrer(v) });
  return (
    <details className="rounded-md border px-3 py-2 text-sm" data-testid="messages-situations">
      <summary className="cursor-pointer font-medium">{t("onboardingPosters.nudges.messagesTitre")}</summary>
      <p className="mt-1 text-xs text-muted-foreground">{t("onboardingPosters.nudges.messagesAide")}</p>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {ETAPES_ONBOARDING.map((e) => (
          <label key={e} className="space-y-1 text-xs">
            <span className="font-medium">{t(`onboardingPosters.nudges.situations.${e}`)}</span>
            <Textarea className="min-h-20 text-xs" value={v[e] ?? ""} onChange={(ev) => setV({ ...v, [e]: ev.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" loading={sauver.isPending} onClick={() => sauver.mutate()}>
          {t("common.save")}
        </Button>
        {sauver.isSuccess && <span className="text-xs text-muted-foreground">{t("onboardingPosters.nudges.enregistre")}</span>}
        {sauver.error && <span className="text-xs text-destructive">{(sauver.error as Error).message}</span>}
      </div>
    </details>
  );
}

/**
 * Prompt 25 v4 : Onboarding posters (Recruitment Automation). Une carte par
 * recrue : HM, pays, cohorte, contrat Upwork, e-mail de connexion, Slack ou
 * pas, chaque étape avec sa date, tous les messages envoyés (date, canal,
 * texte, statut, réponse), la prochaine relance ; Send a message, Postpone,
 * Stop. Filtres : HM, cohorte, étape.
 */
export function PageOnboarding() {
  const { t } = useTranslation();
  const { jour } = useFormats();
  const lu = useQuery({ queryKey: ["onboarding"], queryFn: lireOnboarding, refetchInterval: 60_000 });
  const ids = (lu.data ?? []).map((r) => r.poster_id);
  const releves = useQuery({ queryKey: ["onboarding-releves", ids], queryFn: () => lireDerniersReleves(ids), enabled: ids.length > 0 });
  const recus = useQuery({ queryKey: ["onboarding-recus", ids], queryFn: () => lireMessagesRecus(ids), enabled: ids.length > 0 });
  const conv = useConversations(ids, (lu.data ?? []).map((r) => r.contrat_id));
  const admin = useAuth().role === "admin";
  // Les messages par situation et le lien Slack (réglages, modifiables dans l'OS).
  const { lu: reglages, enregistrer } = useReglages([CLE_NUDGES, "slack_lien_invitation"]);
  const modeles = lireNudges(reglages.data?.[CLE_NUDGES]);
  const lienSlack = typeof reglages.data?.slack_lien_invitation === "string" ? reglages.data.slack_lien_invitation.trim() : "";
  const ecarts = useQuery({ queryKey: ["onboarding-ecarts-pays"], queryFn: lireEcartsPays });
  // 31/10 (0482) : le pays de chaque recrue ; « Country to check » filtrable.
  const pays = useQuery({ queryKey: ["onboarding-pays"], queryFn: lirePaysRecrues, refetchInterval: 5 * 60_000 });
  const relances = useQuery({ queryKey: ["onboarding-relances"], queryFn: lireRelances, refetchInterval: 5 * 60_000 });
  const compteurRelances = useQuery({ queryKey: ["onboarding-relances-jour"], queryFn: lireCompteurRelances, refetchInterval: 5 * 60_000 });
  const demandes = useQuery({
    queryKey: ["demandes-arret"],
    queryFn: async () => new Map((await lireDemandesArret()).map((d) => [d.poster_id, d])),
  });
  const [seulementPays, setSeulementPays] = React.useState(false);
  const [f, setF] = React.useState<FiltresOnboarding>({ hm: "", cohorte: "", etape: "" });
  const tous = lu.data ?? [];
  const liste = filtrerOnboarding(tous, f).filter((r) => !seulementPays || aVerifier(pays.data?.get(r.poster_id)));
  const nbPays = tous.filter((r) => aVerifier(pays.data?.get(r.poster_id))).length;
  const hms = [...new Map(tous.filter((r) => r.hm_id).map((r) => [r.hm_id!, r.hm_nom ?? r.hm_id!])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const cohortes = [...new Set(tous.map((r) => r.cohorte_lundi))].sort();
  return (
    <section className="space-y-3" data-testid="page-onboarding">
      <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="filtres-onboarding">
        <span className="font-semibold">{t("onboardingPosters.titre", { n: liste.length })}</span>
        {compteurRelances.data && (
          <span className="text-xs text-muted-foreground" data-testid="compteur-relances">
            {t("onboardingPosters.relance.compteur", compteurRelances.data)}
          </span>
        )}
        <select className={selectClass} value={f.hm} aria-label={t("onboardingPosters.filtres.hm")} onChange={(e) => setF({ ...f, hm: e.target.value })}>
          <option value="">{t("onboardingPosters.filtres.tousHm")}</option>
          {hms.map(([id, nom]) => (
            <option key={id} value={id}>
              {nom}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={f.cohorte}
          aria-label={t("onboardingPosters.filtres.cohorte")}
          onChange={(e) => setF({ ...f, cohorte: e.target.value })}
        >
          <option value="">{t("onboardingPosters.filtres.toutesCohortes")}</option>
          {cohortes.map((c) => (
            <option key={c} value={c}>
              {jour(c)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant={seulementPays ? "default" : "outline"}
          aria-pressed={seulementPays}
          data-testid="filtre-pays"
          onClick={() => setSeulementPays(!seulementPays)}
        >
          {t("onboardingPosters.pays.filtre", { n: nbPays })}
        </Button>
        <select className={selectClass} value={f.etape} aria-label={t("onboardingPosters.filtres.etape")} onChange={(e) => setF({ ...f, etape: e.target.value })}>
          <option value="">{t("onboardingPosters.filtres.toutesEtapes")}</option>
          {[...ETAPES_ONBOARDING, "fini" as const].map((e, i) => (
            <option key={e} value={e}>
              {t(`onboardingPosters.manque.${e}`, { n: i })}
            </option>
          ))}
        </select>
      </div>
      {admin && (
        <div className="space-y-2">
          <NudgeAll liste={liste} modeles={modeles} lienSlack={lienSlack} />
          <MessagesSituations modeles={modeles} enregistrer={(v) => enregistrer.mutateAsync({ [CLE_NUDGES]: v })} />
        </div>
      )}
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      {lu.data && liste.length === 0 && <p className="text-sm text-muted-foreground">{t("onboardingPosters.vide")}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {liste.map((r) => (
          <CarteRecrue
            key={r.poster_id}
            r={r}
            releve={releves.data?.get(r.poster_id)}
            recus={recus.data?.get(r.poster_id)}
            conv={conversationDe(conv.data, { posteur: r.poster_id, contrat: r.contrat_id })}
            ecart={ecarts.data?.get(r.poster_id)}
            pays={pays.data?.get(r.poster_id)}
            modeles={modeles}
            lienSlack={lienSlack}
            demande={demandes.data?.get(r.poster_id)}
            relance={relances.data?.get(r.poster_id)}
          />
        ))}
      </div>
    </section>
  );
}
