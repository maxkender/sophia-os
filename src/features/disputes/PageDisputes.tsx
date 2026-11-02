import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segments } from "@/components/ui/segments";
import { Textarea } from "@/components/ui/textarea";
import { DialogPaiement } from "@/features/paie/api-upwork/DialogPaiement";
import { cn } from "@/lib/utils";

import {
  agirContestation,
  CLES_TEXTES_CONTESTATION,
  compterContestations,
  creerContestation,
  enregistrerTexteContestation,
  lireContestations,
  lireDossier,
  lireKillSansPaie,
  lireTextesContestation,
  repondreContestation,
  type CleTexteContestation,
  type Contestation,
  type Dossier,
  type Verdict,
  TYPES_MANUELS,
} from "./api";
import { bilanPosts, compterOnglets, enRetard, filtrerOnglet, ligneDue, ONGLETS_DISPUTES, proposerVerdict, reponseProposee, type Onglet } from "./logique";
import { HandleTiktok } from "@/features/ckd/cohorte/liens";
import { type Conversation, conversationDe, useConversations } from "@/features/upwork/conversation";
import { LienConversation } from "@/features/upwork/LienConversation";

const quand = (iso: string | null | undefined, langue: string) =>
  iso ? new Intl.DateTimeFormat(langue, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso)) : "—";

/**
 * Prompt 21, partie R : quand un posteur dit que l'OS s'est trompé (paie,
 * Kill, posts, liens, messages). Une carte par contestation : ce qu'il dit,
 * ce que l'OS a fait et pourquoi, le verdict proposé ; puis vérifier,
 * corriger, répondre. Toutes les actions sont confirmées et notées dans les Logs.
 */
export function PageDisputes({ onglets = ONGLETS_DISPUTES }: { onglets?: readonly Onglet[] }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  // 31/10 : Posts & links et Feedback ont leur page dans Tracking ; ici, seulement les onglets donnés.
  const onglet = onglets.find((o) => o === params.get("onglet")) ?? onglets[0];
  const lu = useQuery({ queryKey: ["disputes", "liste"], queryFn: lireContestations, refetchInterval: 60_000 });
  const tous = lu.data ?? [];
  const compte = compterOnglets(tous);
  const visibles = filtrerOnglet(tous, onglet).sort((a, b) => a.recu_at.localeCompare(b.recu_at));
  // 0469 : la conversation Upwork de chaque posteur.
  const conv = useConversations(visibles.map((c) => c.poster_id));
  const choisir = (o: Onglet) => {
    const next = new URLSearchParams();
    next.set("onglet", o);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4" data-testid="disputes">
      <Segments
        libelle={t("disputes.onglets.libelle")}
        options={onglets.map((o) => ({ cle: o, contenu: <>{t(`disputes.onglets.${o}`)} ({compte[o]})</> }))}
        actif={onglet}
        onChange={choisir}
      />
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      {lu.data && visibles.length === 0 && <p className="text-sm text-muted-foreground">{t("disputes.vide")}</p>}
      <div className="space-y-3">
        {visibles.map((c) => <CarteContestation key={c.id} c={c} conv={conversationDe(conv.data, { posteur: c.poster_id })} />)}
      </div>
      {onglet === "ouvertes" && <TextesContestation />}
    </div>
  );
}

/** Prompt 26 : la raison du « Kill & don't pay », gardée le samedi. */
function RaisonKillSansPaie({ posterId }: { posterId: string }) {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["disputes", "kill-sans-paie", posterId], queryFn: () => lireKillSansPaie(posterId) });
  if (!lu.data) return null;
  return (
    <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1" data-testid="raison-kill-sans-paie">
      {t("disputes.killSansPaie", { raison: lu.data.raison, semaine: lu.data.semaine, montant: lu.data.montant ?? "?" })}
    </p>
  );
}

function CarteContestation({ c, conv }: { c: Contestation; conv?: Conversation }) {
  const { t, i18n } = useTranslation();
  const [ouverte, setOuverte] = React.useState(false);
  const rouge = enRetard(c);
  return (
    <Card data-contestation={c.id} data-type={c.type} className={cn(rouge && "border-l-4 border-l-destructive")}>
      <CardContent className="space-y-2 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`disputes.types.${c.type}`)}</Badge>
          <span className="font-medium">{c.nom ?? "—"}</span>
          {c.hm && <span className="text-muted-foreground">· HM {c.hm}</span>}
          <span className="text-muted-foreground">· {t(`disputes.canaux.${c.canal ?? "os"}`, { defaultValue: c.canal ?? "" })}</span>
          {rouge && <Badge variant="error">{t("disputes.plus24h")}</Badge>}
          {c.type === "kill" && c.statut === "ouverte" && <Badge variant="warning">{t("disputes.killSuspendu")}</Badge>}
          {c.statut === "fermee" && <Badge variant="secondary">{t(`disputes.verdicts.${c.verdict ?? "aucun"}`)}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{quand(c.recu_at, i18n.language)}</span>
        </div>
        <LienConversation c={conv} />
        <p className="whitespace-pre-wrap break-words">
          <span className="font-medium">{t("disputes.ditLePosteur")} </span>
          {c.texte ?? "—"}
        </p>
        {c.ferme_raison && <p className="text-muted-foreground">{t("disputes.fermeeRaison", { raison: c.ferme_raison })}</p>}
        {(c.type === "kill" || c.type === "paie") && c.poster_id && <RaisonKillSansPaie posterId={c.poster_id} />}
        <Button size="sm" variant="outline" onClick={() => setOuverte(!ouverte)} aria-expanded={ouverte}>
          {ouverte ? t("disputes.masquer") : t("disputes.verifier")}
        </Button>
        {ouverte && <DossierContestation c={c} />}
      </CardContent>
    </Card>
  );
}

function DossierContestation({ c }: { c: Contestation }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const lu = useQuery({ queryKey: ["disputes", "dossier", c.id], queryFn: () => lireDossier(c.id) });
  const textes = useQuery({ queryKey: ["disputes", "textes"], queryFn: lireTextesContestation });
  const [message, setMessage] = React.useState<string | null>(null);
  const rafraichir = () => {
    void qc.invalidateQueries({ queryKey: ["disputes"] });
    void qc.invalidateQueries({ queryKey: ["needs-you"] });
  };
  const agir = useMutation({
    mutationFn: (o: { action: Parameters<typeof agirContestation>[1]; valeur?: Record<string, unknown> }) => agirContestation(c.id, o.action, o.valeur),
    onSuccess: (r) => {
      setMessage(r);
      rafraichir();
    },
  });

  if (lu.error) return <p className="text-destructive">{(lu.error as Error).message}</p>;
  if (!lu.data) return <p className="text-muted-foreground">{t("disputes.chargement")}</p>;
  const d = lu.data;
  const p = proposerVerdict(d);
  const ouverte = c.statut === "ouverte";
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" data-testid="dossier">
      <p data-verdict={p.verdict ?? "aucun"}>
        <span className="font-medium">{t("disputes.verdictPropose")} </span>
        <Badge variant={p.verdict === "os_tort" ? "error" : p.verdict === "os_raison" ? "success" : "secondary"}>
          {t(`disputes.verdicts.${p.verdict ?? "aucun"}`)}
        </Badge>{" "}
        {p.raison}
        {p.preuve && <span className="block text-xs text-muted-foreground" data-testid="preuve">{t("disputes.preuve", { preuve: p.preuve })}</span>}
      </p>

      <SectionPaie d={d} />
      <SectionPosts d={d} ouverte={ouverte} onCompter={(passage_id, url) => {
        if (window.confirm(t("disputes.actions.compterConfirm"))) agir.mutate({ action: "compter_post", valeur: { passage_id, url } });
      }} />
      <SectionKill d={d} />
      <SectionMessages d={d} langue={i18n.language} />

      {ouverte && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <BoutonPayerDu c={c} d={d} onFait={rafraichir} />
            {(d.arret || d.kill) && !d.arret?.annule_at && (
              d.contrat_termine ? (
                <span className="text-xs text-muted-foreground" data-testid="contrat-termine">{t("disputes.contratTermine")}</span>
              ) : (
                <Button
                  size="sm"
                  data-action={d.actif === false ? "rouvrir" : "annuler_kill"}
                  disabled={agir.isPending}
                  onClick={() => {
                    const action = d.actif === false ? "rouvrir" : "annuler_kill";
                    if (window.confirm(t(`disputes.actions.${action}Confirm`))) agir.mutate({ action });
                  }}
                >
                  {t(d.actif === false ? "disputes.actions.rouvrir" : "disputes.actions.annuler_kill")}
                </Button>
              )
            )}
          </div>
          <Repondre c={c} d={d} verdict={p.verdict} raison={p.raison} modeles={textes.data ?? null} onFait={rafraichir} />
          <Fermer verdictPropose={p.verdict} enCours={agir.isPending} onFermer={(raison, verdict) => agir.mutate({ action: "fermer", valeur: { raison, verdict } })} />
        </div>
      )}
      {!ouverte && (
        <Button size="sm" variant="outline" onClick={() => agir.mutate({ action: "rouvrir_contestation" })}>{t("disputes.actions.rouvrirContestation")}</Button>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      {agir.error && <p className="text-xs text-destructive">{(agir.error as Error).message}</p>}
      {d.contestation.journal.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary>{t("disputes.journal", { n: d.contestation.journal.length })}</summary>
          <ul className="mt-1 space-y-0.5">
            {d.contestation.journal.map((j, i) => (
              <li key={i}>{quand(j.at, i18n.language)} · {j.action}{j.detail ? ` · ${j.detail}` : ""}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SectionPaie({ d }: { d: Dossier }) {
  const { t, i18n } = useTranslation();
  if (d.paie.length === 0 && d.paiements.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("disputes.paie.aucune", { semaine: d.semaine })}</p>;
  }
  return (
    <div className="space-y-1">
      <p className="font-medium">{t("disputes.paie.titre")}</p>
      <ul className="space-y-0.5 text-xs" data-testid="lignes-paie">
        {d.paie.map((l) => (
          <li key={l.id}>
            {t("disputes.paie.ligne", {
              semaine: l.semaine,
              montant: l.montant ?? 0,
              faits: l.faits ?? 0,
              prevus: l.prevus ?? 0,
              action: l.action ?? "—",
            })}
            {" · "}
            {l.paye_at ? t("disputes.paie.payee", { quand: quand(l.paye_at, i18n.language) }) : l.exclu ? t("disputes.paie.exclue") : t("disputes.paie.pasPayee")}
          </li>
        ))}
        {d.paiements.map((p, i) => (
          <li key={`api-${i}`} className="text-muted-foreground">
            {t("disputes.paie.upwork", {
              semaine: p.semaine,
              statut: p.statut,
              jalon: p.jalon_approuve ?? "—",
              montant: p.montant_approuve ?? 0,
              finance: p.montant_finance ?? 0,
            })}
            {p.erreur && ` · ${p.erreur}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionPosts({ d, ouverte, onCompter }: { d: Dossier; ouverte: boolean; onCompter: (passageId: string, url: string | null) => void }) {
  const { t, i18n } = useTranslation();
  const [liens, setLiens] = React.useState<Record<string, string>>({});
  const b = bilanPosts(d);
  return (
    <div className="space-y-1">
      <p className="font-medium">{t("disputes.posts.titre", { avecLien: b.avecLien, total: d.posts.length, douteux: b.douteux })}</p>
      <ul className="space-y-1 text-xs" data-testid="posts">
        {d.posts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0">{p.jour}</span>
            {p.compte ? <HandleTiktok handle={p.compte} className="font-normal text-muted-foreground" /> : <span className="text-muted-foreground">@?</span>}
            {p.url ? (
              <a href={p.url} target="_blank" rel="noreferrer" className="underline">{p.publie_at ? quand(p.publie_at, i18n.language) : t("disputes.posts.lien")}</a>
            ) : (
              <span className="text-muted-foreground">{t("disputes.posts.sansLien")}</span>
            )}
            {p.url && (p.confirme || p.resolution === "ok" || p.resolution === "resolu") && <Badge variant="success">{t("disputes.posts.compte")}</Badge>}
            {p.url && !p.confirme && (p.resolution === "introuvable" || p.resolution === "a_resoudre") && <Badge variant="warning">{t("disputes.posts.introuvable")}</Badge>}
            {ouverte && !p.confirme && (
              <>
                {!p.url && (
                  <Input
                    className="h-7 w-56"
                    placeholder="https://www.tiktok.com/…"
                    aria-label={t("disputes.posts.lienAAjouter")}
                    value={liens[p.id] ?? ""}
                    onChange={(e) => setLiens({ ...liens, [p.id]: e.target.value })}
                  />
                )}
                {(p.url || (liens[p.id] ?? "").trim()) && (
                  <Button size="sm" variant="outline" className="h-7" data-action="compter_post" onClick={() => onCompter(p.id, p.url ? null : liens[p.id]!.trim())}>
                    {t("disputes.actions.compter")}
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionKill({ d }: { d: Dossier }) {
  const { t, i18n } = useTranslation();
  if (!d.arret && !d.kill) return null;
  return (
    <div className="space-y-0.5 text-xs">
      <p className="text-sm font-medium">{t("disputes.kill.titre")}</p>
      {d.kill && (
        <p>{t("disputes.kill.kill", { etape: d.kill.etape, statut: d.kill.statut, message: quand(d.kill.message_at, i18n.language), raison: d.kill.raison ?? "—" })}</p>
      )}
      {d.arret && (
        <p>
          {t("disputes.kill.arret", { motif: d.arret.motif ?? d.arret.source, statut: d.arret.statut, quand: quand(d.arret.created_at, i18n.language) })}
          {d.arret.annule_at && ` · ${t("disputes.kill.annule")}`}
        </p>
      )}
      {d.arret?.etapes.length ? (
        <p className="text-muted-foreground">{d.arret.etapes.map((e) => `${e.action} : ${e.statut}`).join(" · ")}</p>
      ) : null}
    </div>
  );
}

function SectionMessages({ d, langue }: { d: Dossier; langue: string }) {
  const { t } = useTranslation();
  if (d.messages.length === 0 && d.recus.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="text-sm font-medium">{t("disputes.messages.titre", { envoyes: d.messages.length, recus: d.recus.length })}</summary>
      <ul className="mt-1 space-y-1">
        {d.messages.map((m, i) => (
          <li key={`e-${i}`}>
            <span className="text-muted-foreground">{quand(m.at, langue)} · {m.type} · {m.canal}</span> {m.texte}
            {m.reponse_at && <span className="text-muted-foreground"> · {t("disputes.messages.reaction", { quand: quand(m.reponse_at, langue) })}{m.reponse ? ` (${m.reponse})` : ""}</span>}
            {m.erreur && <span className="text-destructive"> · {m.erreur}</span>}
          </li>
        ))}
        {d.recus.map((r, i) => (
          <li key={`r-${i}`}>
            <span className="text-muted-foreground">{quand(r.at, langue)} · {t("disputes.messages.recu")} · {r.canal}</span> {r.texte}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** « Pay what's due » : la ligne due de la semaine, par l'API (aperçu, puis confirmation ; plafonds). */
function BoutonPayerDu({ c, d, onFait }: { c: Contestation; d: Dossier; onFait: () => void }) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = React.useState(false);
  const l = ligneDue(d);
  if (c.type !== "paie" && c.type !== "posts" && c.type !== "lien") return null;
  return (
    <>
      <Button size="sm" data-action="payer" disabled={!l} onClick={() => setOuvert(true)} title={l ? undefined : t("disputes.actions.rienAPayer")}>
        {t("disputes.actions.payer")}
      </Button>
      {l && (
        <DialogPaiement
          semaine={l.semaine}
          ids={[l.id]}
          titre={t("disputes.actions.payerTitre", { nom: c.nom ?? "—" })}
          ouvert={ouvert}
          onOpenChange={setOuvert}
          onPaye={(lignes) => {
            const r = lignes.map((x) => x.resultat ?? x.statut).join(", ");
            void agirContestation(c.id, "noter", { quoi: "payer", detail: `Pay what's due (${l.semaine}) : ${r}` }).finally(onFait);
          }}
        />
      )}
    </>
  );
}

function Repondre({
  c,
  d,
  verdict,
  raison,
  modeles,
  onFait,
}: {
  c: Contestation;
  d: Dossier;
  verdict: Verdict | null;
  raison: string;
  modeles: Record<CleTexteContestation, string> | null;
  onFait: () => void;
}) {
  const { t } = useTranslation();
  const canal = t(`disputes.canaux.${c.canal === "upwork" ? "upwork" : "slack"}`);
  const modele = modeles ? modeles[verdict ?? "os_raison"] : "";
  const [texte, setTexte] = React.useState<string | null>(null);
  const valeur = texte ?? (modele ? reponseProposee(modele, d.prenom, raison) : "");
  const envoyer = useMutation({
    mutationFn: () => repondreContestation(c.id, valeur.trim()),
    onSuccess: onFait,
  });
  return (
    <div className="space-y-1">
      <p className="font-medium">{t("disputes.repondre.titre", { canal })}</p>
      <Textarea rows={3} aria-label={t("disputes.repondre.titre", { canal })} value={valeur} onChange={(e) => setTexte(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          data-action="repondre"
          disabled={!valeur.trim() || envoyer.isPending || envoyer.isSuccess}
          onClick={() => {
            if (window.confirm(t("disputes.repondre.confirm"))) envoyer.mutate();
          }}
        >
          {t("disputes.actions.repondre")}
        </Button>
        {envoyer.isSuccess && <span className="text-xs text-muted-foreground">{t("disputes.repondre.envoye")}</span>}
        {envoyer.error && <span className="text-xs text-destructive">{(envoyer.error as Error).message}</span>}
      </div>
    </div>
  );
}

function Fermer({ verdictPropose, enCours, onFermer }: { verdictPropose: Verdict | null; enCours: boolean; onFermer: (raison: string, verdict: Verdict | null) => void }) {
  const { t } = useTranslation();
  const [raison, setRaison] = React.useState("");
  const [verdict, setVerdict] = React.useState<Verdict | "">(verdictPropose ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        aria-label={t("disputes.fermer.verdict")}
        value={verdict}
        onChange={(e) => setVerdict(e.target.value as Verdict | "")}
      >
        <option value="">—</option>
        <option value="os_tort">{t("disputes.verdicts.os_tort")}</option>
        <option value="os_raison">{t("disputes.verdicts.os_raison")}</option>
      </select>
      <Input className="h-9 w-72" placeholder={t("disputes.fermer.raison")} aria-label={t("disputes.fermer.raison")} value={raison} onChange={(e) => setRaison(e.target.value)} />
      <Button
        size="sm"
        variant="outline"
        data-action="fermer"
        disabled={!raison.trim() || enCours}
        onClick={() => {
          if (window.confirm(t("disputes.fermer.confirm"))) onFermer(raison.trim(), verdict || null);
        }}
      >
        {t("disputes.actions.fermer")}
      </Button>
    </div>
  );
}

/** Les textes aux posteurs (anglais) : la réponse automatique et les deux modèles de réponse. */
function TextesContestation() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["disputes", "textes"], queryFn: lireTextesContestation });
  const [brouillon, setBrouillon] = React.useState<Partial<Record<CleTexteContestation, string>>>({});
  const qc = useQueryClient();
  const enregistrer = useMutation({
    mutationFn: async () => {
      for (const [cle, texte] of Object.entries(brouillon) as [CleTexteContestation, string][]) await enregistrerTexteContestation(cle, texte);
    },
    onSuccess: () => {
      setBrouillon({});
      void qc.invalidateQueries({ queryKey: ["disputes", "textes"] });
    },
  });
  if (!lu.data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("disputes.textes.titre")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {(Object.keys(CLES_TEXTES_CONTESTATION) as CleTexteContestation[]).map((cle) => (
          <label key={cle} className="block space-y-1">
            <span className="font-medium">{t(`disputes.textes.${cle}`)}</span>
            <Textarea rows={2} value={brouillon[cle] ?? lu.data[cle]} onChange={(e) => setBrouillon({ ...brouillon, [cle]: e.target.value })} />
          </label>
        ))}
        <p className="text-xs text-muted-foreground">{t("disputes.textes.aide")}</p>
        <Button size="sm" disabled={Object.keys(brouillon).length === 0 || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
          {t("disputes.textes.enregistrer")}
        </Button>
        {enregistrer.error && <p className="text-xs text-destructive">{(enregistrer.error as Error).message}</p>}
      </CardContent>
    </Card>
  );
}

/** Prompt 21, R5 : le nombre de contestations ouvertes, en haut de Logs (lien vers Disputes). */
export function BandeauDisputes() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["disputes", "compte"], queryFn: compterContestations, refetchInterval: 60_000 });
  if (!lu.data || lu.data.ouvertes === 0) return null;
  return (
    <Link to="/admin/auto/disputes" data-testid="bandeau-disputes" className="inline-block">
      <Badge variant={lu.data.plus_24h > 0 ? "error" : "secondary"}>
        {t("disputes.resume", { n: lu.data.ouvertes })}
        {lu.data.plus_24h > 0 && ` · ${t("disputes.resumeRetard", { n: lu.data.plus_24h })}`}
      </Badge>
    </Link>
  );
}

/** Prompt 21, R2 : « This is a dispute » sur un message de Messages received (le type, puis le bouton). */
export function BoutonContestation({ reponseId }: { reponseId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = React.useState<(typeof TYPES_MANUELS)[number]>("paie");
  const creer = useMutation({
    mutationFn: () => creerContestation(reponseId, type),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["disputes"] });
      void qc.invalidateQueries({ queryKey: ["needs-you"] });
    },
  });
  if (creer.isSuccess) {
    return (
      <Link to="/admin/auto/disputes" className="text-xs text-primary underline-offset-2 hover:underline" data-testid={`contestation-creee-${reponseId}`}>
        {t("disputes.creee")}
      </Link>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <select
        className="h-7 rounded-md border border-input bg-background px-1 text-xs"
        aria-label={t("disputes.typeContestation")}
        value={type}
        onChange={(e) => setType(e.target.value as (typeof TYPES_MANUELS)[number])}
      >
        {TYPES_MANUELS.map((x) => <option key={x} value={x}>{t(`disputes.types.${x}`)}</option>)}
      </select>
      <Button size="sm" variant="outline" className="h-7 text-xs" data-action="contestation" disabled={creer.isPending} onClick={() => creer.mutate()}>
        {t("disputes.estUneContestation")}
      </Button>
      {creer.error && <span className="text-xs text-destructive">{(creer.error as Error).message}</span>}
    </span>
  );
}

/** Prompt 21, R2 : l'onglet « Pay questions » de Messages received est l'onglet Pay de Disputes. */
export function RenvoiPaieDisputes() {
  const { t } = useTranslation();
  return (
    <Card data-testid="reponses-paie-disputes">
      <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
        <span>{t("disputes.paieDeplacee")}</span>
        <Button size="sm" asChild>
          <Link to="/admin/auto/disputes?onglet=paie">{t("disputes.ouvrirPaie")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
