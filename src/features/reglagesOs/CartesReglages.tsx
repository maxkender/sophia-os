import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthContext";
import { aujourdhuiParis } from "@/features/moteur/cohortes";

import { isoVersLocalParis, lireReglagesBruts, localParisVersIso, RAISONS_FIN_UPWORK, remplirVariables, variablesInconnues } from "./api";
import { useReglages } from "./useReglages";
import { JournalReglages } from "./JournalReglages";

/**
 * Partie E (0411) : les cartes de Settings. Chaque carte lit ses réglages,
 * garde un brouillon et l'enregistre d'un coup ; admin seulement (le Head of
 * Ops lit) ; dessous, qui a changé quoi et quand.
 */

const texte = (v: unknown, defaut = "") => (typeof v === "string" ? v : defaut);
const objet = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});


export function Pied({
  admin,
  enregistrer,
  onSave,
  desactive,
  cles,
}: {
  admin: boolean;
  enregistrer: { isPending: boolean; isSuccess: boolean; error: unknown };
  onSave: () => void;
  desactive?: boolean;
  cles: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 border-t pt-3">
      {admin ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={enregistrer.isPending || desactive} onClick={onSave}>
            {t("common.save")}
          </Button>
          {enregistrer.isSuccess && <span className="text-sm text-muted-foreground">{t("reglagesOs.enregistre")}</span>}
          {enregistrer.error ? <span className="text-sm text-destructive">{(enregistrer.error as Error).message}</span> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("reglagesOs.adminSeulement")}</p>
      )}
      <JournalReglages cles={cles} />
    </div>
  );
}

function ChampTexte({
  id,
  label,
  valeur,
  onChange,
  admin,
  lignes = 4,
}: {
  id: string;
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  admin: boolean;
  lignes?: number;
}) {
  return (
    <label className="block space-y-1 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      <Textarea id={id} rows={lignes} value={valeur} disabled={!admin} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ---------------------------------------------------------------------------
// 1. Messages Upwork : bienvenue, arrêt complet, motif de fin
// ---------------------------------------------------------------------------

const CLES_UPWORK = ["accueil_message_texte", "arret_message_texte", "arret_raison_upwork"] as const;
/** Les variables du message de bienvenue (fonction upwork, messageAccueil). */
export const VARIABLES_ACCUEIL = ["prenom", "url", "email", "mot_de_passe", "handle", "slack", "guide", "date"] as const;
const OS_URL = "https://sophia-marketing-orga.vercel.app";
const GUIDE_POSTER = "https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505";

/** Le lundi qui suit aujourd'hui (Paris), pour l'aperçu. */
function prochainLundi(): string {
  const d = new Date(`${aujourdhuiParis()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
}

/** « 2 November » : le texte dit déjà « Monday » (comme dateAnglaise côté fonctions). */
function dateAnglaise(jour: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${jour}T12:00:00Z`));
}

export function CarteMessagesUpwork() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const { lu, enregistrer } = useReglages([...CLES_UPWORK, "slack_lien_invitation"]);
  const [b, setB] = React.useState<{ accueil: string; arret: string; raison: string } | null>(null);
  React.useEffect(() => {
    if (lu.data) {
      setB({
        accueil: texte(lu.data.accueil_message_texte),
        arret: texte(lu.data.arret_message_texte),
        raison: texte(lu.data.arret_raison_upwork, "107"),
      });
    }
  }, [lu.data]);
  if (!b) return null;
  const vars: Record<string, string> = {
    prenom: "Ana",
    url: OS_URL,
    email: "anas@sophia.com",
    mot_de_passe: "12345678",
    handle: "ana.studies",
    slack: texte(lu.data?.slack_lien_invitation) || "https://join.slack.com/…",
    guide: GUIDE_POSTER,
    date: dateAnglaise(prochainLundi()),
  };
  const inconnues = variablesInconnues(b.accueil, VARIABLES_ACCUEIL);
  return (
    <Card data-testid="carte-messages-upwork">
      <CardHeader>
        <CardTitle>{t("reglagesOs.upwork.titre")}</CardTitle>
        <CardDescription>{t("reglagesOs.upwork.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChampTexte id="accueil-texte" label={t("reglagesOs.upwork.accueil")} valeur={b.accueil} admin={admin} lignes={8}
          onChange={(v) => setB({ ...b, accueil: v })} />
        <p className="text-xs text-muted-foreground">
          {t("reglagesOs.variables", { liste: VARIABLES_ACCUEIL.map((v) => `{${v}}`).join(" ") })}
        </p>
        {inconnues.length > 0 && (
          <p className="text-xs text-destructive">{t("reglagesOs.inconnues", { liste: inconnues.map((v) => `{${v}}`).join(" ") })}</p>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("reglagesOs.apercu")}</p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs" data-testid="apercu-accueil">
            {remplirVariables(b.accueil, vars)}
          </pre>
        </div>
        <ChampTexte id="arret-texte" label={t("reglagesOs.upwork.arret")} valeur={b.arret} admin={admin} lignes={3}
          onChange={(v) => setB({ ...b, arret: v })} />
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t("reglagesOs.apercu")}</p>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs" data-testid="apercu-arret">{b.arret.trim()}</pre>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("reglagesOs.upwork.raison")}</span>
          <select
            className="h-9 w-full max-w-md rounded-md border bg-background px-2 text-sm"
            value={b.raison}
            disabled={!admin}
            aria-label={t("reglagesOs.upwork.raison")}
            onChange={(e) => setB({ ...b, raison: e.target.value })}
          >
            {RAISONS_FIN_UPWORK.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} · {r.libelle}
              </option>
            ))}
          </select>
        </label>
        <Pied
          admin={admin}
          enregistrer={enregistrer}
          cles={CLES_UPWORK}
          desactive={!b.accueil.trim() || !b.arret.trim()}
          onSave={() =>
            enregistrer.mutate({ accueil_message_texte: b.accueil, arret_message_texte: b.arret, arret_raison_upwork: b.raison })
          }
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Cohorte et accueil : jour limite, date de départ de l'accueil
// ---------------------------------------------------------------------------

const CLES_COHORTE = ["cohorte_jour_limite", "accueil_contrats_depuis"] as const;
const JOURS = [1, 2, 3, 4, 5, 6, 7] as const;

export function CarteCohorteAccueil() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const { lu, enregistrer } = useReglages(CLES_COHORTE);
  const [b, setB] = React.useState<{ jour: number; depuis: string } | null>(null);
  React.useEffect(() => {
    if (lu.data) {
      const n = Number(lu.data.cohorte_jour_limite);
      setB({ jour: Number.isInteger(n) && n >= 1 && n <= 7 ? n : 6, depuis: isoVersLocalParis(texte(lu.data.accueil_contrats_depuis)) });
    }
  }, [lu.data]);
  if (!b) return null;
  return (
    <Card data-testid="carte-cohorte-accueil">
      <CardHeader>
        <CardTitle>{t("reglagesOs.cohorte.titre")}</CardTitle>
        <CardDescription>{t("reglagesOs.cohorte.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("reglagesOs.cohorte.jour")}</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={b.jour}
              disabled={!admin}
              aria-label={t("reglagesOs.cohorte.jour")}
              onChange={(e) => setB({ ...b, jour: Number(e.target.value) })}
            >
              {JOURS.map((j) => (
                <option key={j} value={j}>{t(`reglagesOs.jours.${j}`)}</option>
              ))}
            </select>
            <span className="block text-xs text-muted-foreground">{t("reglagesOs.cohorte.jourAide")}</span>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("reglagesOs.cohorte.depuis")}</span>
            <Input
              type="datetime-local"
              value={b.depuis}
              disabled={!admin}
              aria-label={t("reglagesOs.cohorte.depuis")}
              onChange={(e) => setB({ ...b, depuis: e.target.value })}
            />
            <span className="block text-xs text-muted-foreground">{t("reglagesOs.cohorte.depuisAide")}</span>
          </label>
        </div>
        <Pied
          admin={admin}
          enregistrer={enregistrer}
          cles={CLES_COHORTE}
          desactive={!b.depuis}
          onSave={() => enregistrer.mutate({ cohorte_jour_limite: b.jour, accueil_contrats_depuis: localParisVersIso(b.depuis) })}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 6. Textes aux posteurs : lien à 1 000 abonnés, raison du nudge, boutons Slack
// ---------------------------------------------------------------------------

const CLES_TEXTES = ["lien_1000", "ckd_raison_textes", "slack_boutons"] as const;
export const CHAMPS_LIEN_1000 = ["titre", "message", "titre_relance", "message_relance"] as const;
export const APPLIS_LIEN_1000 = ["sophia", "unswipe", "micabo"] as const;
export const CHAMPS_RAISON = ["shadowban_zero", "shadowban_faibles", "vues_basses", "posts_manquants"] as const;
export const CHAMPS_BOUTONS = [
  "done", "aide", "stop", "confirmer_titre", "confirmer_texte", "confirmer_oui", "confirmer_non", "merci",
] as const;

type Textes = {
  lien: Record<string, string>;
  liens: Record<string, string>;
  raison: Record<string, string>;
  boutons: Record<string, string>;
};

export function CarteTextesPosteurs() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const { lu, enregistrer } = useReglages(CLES_TEXTES);
  const [b, setB] = React.useState<Textes | null>(null);
  React.useEffect(() => {
    if (!lu.data) return;
    const l = objet(lu.data.lien_1000);
    const r = objet(lu.data.ckd_raison_textes);
    const s = objet(lu.data.slack_boutons);
    setB({
      lien: Object.fromEntries(CHAMPS_LIEN_1000.map((k) => [k, texte(l[k])])),
      liens: Object.fromEntries(APPLIS_LIEN_1000.map((k) => [k, texte(objet(l.liens)[k])])),
      raison: Object.fromEntries(CHAMPS_RAISON.map((k) => [k, texte(r[k])])),
      boutons: Object.fromEntries(CHAMPS_BOUTONS.map((k) => [k, texte(s[k])])),
    });
  }, [lu.data]);
  if (!b) return null;
  const vide = [...Object.values(b.lien), ...Object.values(b.liens), ...Object.values(b.raison), ...Object.values(b.boutons)]
    .some((v) => !v.trim());
  const enregistrerTout = async () => {
    // Relu juste avant : les autres clés de lien_1000 (envoi_actif, seuil…) restent telles quelles.
    const frais = await lireReglagesBruts(["lien_1000"]);
    const l = objet(frais.lien_1000);
    enregistrer.mutate({
      lien_1000: { ...l, ...b.lien, liens: { ...objet(l.liens), ...b.liens } },
      ckd_raison_textes: b.raison,
      slack_boutons: b.boutons,
    });
  };
  return (
    <Card data-testid="carte-textes-posteurs">
      <CardHeader>
        <CardTitle>{t("reglagesOs.textes.titre")}</CardTitle>
        <CardDescription>{t("reglagesOs.textes.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("reglagesOs.textes.lien1000")}</h3>
          <p className="text-xs text-muted-foreground">{t("reglagesOs.variables", { liste: "{handle} {lien}" })}</p>
          {CHAMPS_LIEN_1000.map((k) => (
            <ChampTexte key={k} id={`lien1000-${k}`} label={t(`reglagesOs.textes.lien.${k}`)} valeur={b.lien[k]!} admin={admin}
              lignes={k.startsWith("titre") ? 1 : 3} onChange={(v) => setB({ ...b, lien: { ...b.lien, [k]: v } })} />
          ))}
          <div className="grid gap-3 sm:grid-cols-3">
            {APPLIS_LIEN_1000.map((k) => (
              <label key={k} className="block space-y-1 text-sm">
                <span className="font-medium">{t("reglagesOs.textes.lienAppli", { appli: k })}</span>
                <Input value={b.liens[k]} disabled={!admin} aria-label={t("reglagesOs.textes.lienAppli", { appli: k })}
                  onChange={(e) => setB({ ...b, liens: { ...b.liens, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("reglagesOs.textes.raison")}</h3>
          <p className="text-xs text-muted-foreground">{t("reglagesOs.textes.raisonAide")}</p>
          {CHAMPS_RAISON.map((k) => (
            <ChampTexte key={k} id={`raison-${k}`} label={t(`reglagesOs.textes.raisons.${k}`)} valeur={b.raison[k]!} admin={admin}
              lignes={2} onChange={(v) => setB({ ...b, raison: { ...b.raison, [k]: v } })} />
          ))}
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("reglagesOs.textes.boutons")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHAMPS_BOUTONS.map((k) => (
              <label key={k} className="block space-y-1 text-sm">
                <span className="font-medium">{t(`reglagesOs.textes.bouton.${k}`)}</span>
                <Input value={b.boutons[k]} disabled={!admin} aria-label={t(`reglagesOs.textes.bouton.${k}`)}
                  onChange={(e) => setB({ ...b, boutons: { ...b.boutons, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
        </section>
        <Pied admin={admin} enregistrer={enregistrer} cles={CLES_TEXTES} desactive={vide} onSave={() => void enregistrerTout()} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Prompt 21, B et P : les textes de la paie (Kill sous les 6 posts, milestone
// pas soumise, réponses aux questions de paie)
// ---------------------------------------------------------------------------

export const TEXTES_PAIE = [
  { cle: "kill_moins6_texte", variables: ["prenom", "n"] },
  { cle: "paie_soumettre_texte", variables: ["prenom", "NN"] },
  { cle: "paie_reponse_payee_texte", variables: ["montant", "NN"] },
  { cle: "paie_reponse_deja_payee_texte", variables: ["montant", "NN", "date"] },
  { cle: "paie_reponse_financee_texte", variables: ["NN"] },
  { cle: "paie_reponse_attente_texte", variables: [] },
] as const;

const DEFAUTS_PAIE: Record<string, string> = {
  paie_reponse_attente_texte: "Thanks, we're checking it. We'll reply here within 24 hours.",
};

export function CarteTextesPaie() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const admin = role === "admin";
  const cles = TEXTES_PAIE.map((x) => x.cle);
  const { lu, enregistrer } = useReglages(cles);
  const [b, setB] = React.useState<Record<string, string> | null>(null);
  React.useEffect(() => {
    if (lu.data) setB(Object.fromEntries(cles.map((c) => [c, texte(lu.data[c], DEFAUTS_PAIE[c] ?? "")])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lu.data]);
  if (!b) return null;
  return (
    <Card data-testid="carte-textes-paie">
      <CardHeader>
        <CardTitle>{t("reglagesOs.paie.titre")}</CardTitle>
        <CardDescription>{t("reglagesOs.paie.aide")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {TEXTES_PAIE.map((x) => {
          const inconnues = variablesInconnues(b[x.cle], x.variables);
          return (
            <div key={x.cle} className="space-y-1">
              <ChampTexte id={x.cle} label={t(`reglagesOs.paie.${x.cle}`)} valeur={b[x.cle]} admin={admin} lignes={3}
                onChange={(v) => setB({ ...b, [x.cle]: v })} />
              {x.variables.length > 0 && (
                <p className="text-xs text-muted-foreground">{t("reglagesOs.variables", { liste: x.variables.map((v) => `{${v}}`).join(" ") })}</p>
              )}
              {inconnues.length > 0 && (
                <p className="text-xs text-destructive">{t("reglagesOs.inconnues", { liste: inconnues.map((v) => `{${v}}`).join(" ") })}</p>
              )}
            </div>
          );
        })}
        <Pied
          admin={admin}
          enregistrer={enregistrer}
          cles={cles}
          desactive={cles.some((c) => !b[c].trim())}
          onSave={() => enregistrer.mutate(b)}
        />
      </CardContent>
    </Card>
  );
}
