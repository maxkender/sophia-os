import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRegles } from "@/features/regles/api";
import { BoutonDeclarer } from "@/features/onboarding/BoutonDeclarer";
import { prochaineVerification } from "@/features/onboarding/cinqEtapes";
import { lireMesDeclarations } from "@/features/onboarding/cinqEtapesApi";
import { enregistrerIdentiteRuul } from "@/features/moteur/api";
import { cn } from "@/lib/utils";

import { enregistrerMonEmailRuul, jeSuisPretRuul, lireMonOnboardingRuul, type MonOnboardingRuul } from "./api";

export type EtapeRuul = "identite" | "email" | "tiktok" | "warmup" | "slack" | "ruul";
export const ETAPES_RUUL_ONBOARDING: EtapeRuul[] = ["identite", "email", "tiktok", "warmup", "slack", "ruul"];

/** Faite ou pas, pour chaque étape (Slack est recommandé, jamais bloquant). */
export function etapesRuulFaites(o: MonOnboardingRuul): Record<EtapeRuul, boolean> {
  return {
    identite: Boolean(o.prenom_legal?.trim() && o.nom_legal?.trim()),
    email: Boolean(o.ruul_email),
    tiktok: o.tiktok,
    warmup: o.pret_warmup || (o.warmup_lance && o.abonnements >= 5),
    slack: o.slack,
    // 13/11 (Max) : « ready » seulement quand le compte Ruul est Active (import) ou « It's done » cliqué.
    ruul: etatRuul(o) === "pret",
  };
}

/** Tout ce qui est obligatoire est fait (Slack mis à part) : la checklist disparaît. */
export function onboardingRuulFini(o: MonOnboardingRuul): boolean {
  const f = etapesRuulFaites(o);
  return ETAPES_RUUL_ONBOARDING.filter((e) => e !== "slack").every((e) => f[e]);
}

function jourMois(jour: string, langue: string): string {
  return new Intl.DateTimeFormat(langue.startsWith("fr") ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${jour}T12:00:00Z`));
}

/**
 * 13/11 (Max) : l'étape Ruul du dashboard, selon le statut Ruul. Jamais « ready » tant que le compte
 * n'est pas Active : pas encore invité (⏳, rien à faire) → invité (finir le compte) → prêt.
 */
export function etatRuul(o: MonOnboardingRuul): "attente" | "invite" | "pret" {
  if (o.ruul_pret || o.ruul_compte === "active") return "pret";
  if (o.ruul_invite || o.ruul_compte === "invited") return "invite";
  return "attente";
}

/** L'espace Ruul (connexion, identité, banque). */
const LIEN_RUUL = "https://app.ruul.io";

function Pastille({ numero, fait, recommande }: { numero: number; fait: boolean; recommande?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
        fait ? "bg-success text-success-foreground" : recommande ? "border bg-background text-muted-foreground" : "bg-primary text-primary-foreground",
      )}
    >
      {fait ? <Check className="size-3.5" /> : numero}
    </span>
  );
}

function FormIdentite({ o }: { o: MonOnboardingRuul }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [prenom, setPrenom] = React.useState(o.prenom_legal ?? "");
  const [nom, setNom] = React.useState(o.nom_legal ?? "");
  const m = useMutation({
    mutationFn: () => enregistrerIdentiteRuul(prenom, nom),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ruul-mon-onboarding"] }),
  });
  return (
    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Input className="h-8 w-40" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder={t("ruulOnboarding.prenom")} aria-label={t("ruulOnboarding.prenom")} />
      <Input className="h-8 w-40" value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t("ruulOnboarding.nom")} aria-label={t("ruulOnboarding.nom")} />
      <Button size="sm" className="h-8" type="submit" disabled={m.isPending || !prenom.trim() || !nom.trim()}>{t("ruulOnboarding.enregistrer")}</Button>
      {m.isError && <span className="text-destructive text-xs">{t("ruulOnboarding.erreur")}</span>}
    </form>
  );
}

function FormEmail({ o }: { o: MonOnboardingRuul }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = React.useState(o.ruul_email ?? o.email_candidature ?? "");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => enregistrerMonEmailRuul(email),
    onSuccess: (r) => {
      if (!r.ok) return setErreur(r.erreur ?? t("ruulOnboarding.erreur"));
      setErreur(null);
      void qc.invalidateQueries({ queryKey: ["ruul-mon-onboarding"] });
      void qc.invalidateQueries({ queryKey: ["ruul-mon-email"] });
    },
    onError: () => setErreur(t("ruulOnboarding.erreur")),
  });
  return (
    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Input className="h-8 w-64" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t("ruulOnboarding.emailLibelle")} />
      <Button size="sm" className="h-8" type="submit" disabled={m.isPending || !email.trim() || email.trim() === o.ruul_email}>
        {t("ruulOnboarding.enregistrer")}
      </Button>
      {erreur && <span className="text-destructive text-xs">{erreur}</span>}
    </form>
  );
}

function BoutonPret() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: jeSuisPretRuul,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ruul-mon-onboarding"] }),
  });
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" className="h-8" disabled={m.isPending} onClick={() => m.mutate()} data-testid="ruul-pret">{t("ruulOnboarding.fait")}</Button>
      {(m.isError || (m.data && !m.data.ok)) && <span className="text-destructive text-xs">{m.data?.erreur ?? t("ruulOnboarding.erreur")}</span>}
    </span>
  );
}

/**
 * 0592 (Max, 10/11) : en haut du dashboard d'un posteur Ruul, ce qu'il doit
 * faire avant de commencer, dans l'ordre. Aucun texte Upwork. Disparaît une fois
 * tout fait (Slack est recommandé, pas bloquant).
 */
export function ChecklistRuul() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["ruul-mon-onboarding"], queryFn: lireMonOnboardingRuul, staleTime: 60_000 });
  const declarations = useQuery({ queryKey: ["mes-declarations"], queryFn: lireMesDeclarations, staleTime: 60_000 });
  const regles = useRegles();
  const o = q.data;
  if (!o?.ruul || onboardingRuulFini(o)) return null;
  const f = etapesRuulFaites(o);
  const date = o.cohorte_lundi ? jourMois(o.cohorte_lundi, i18n.language ?? "en") : null;
  // 13/11 (Max) : la limite est dimanche minuit (heure de Paris), la veille du lundi de départ.
  const dimanche = o.cohorte_lundi
    ? jourMois(new Date(new Date(`${o.cohorte_lundi}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10), i18n.language ?? "en")
    : null;
  const warmupDeclare = (declarations.data ?? []).some((d) => d.etape === "warmup" && d.statut === "en_attente");
  const ruul = etatRuul(o);
  const handle = o.handle ? `@${o.handle.replace(/^@/, "")}` : null;

  const lignes: { cle: EtapeRuul; titre: string; detail?: React.ReactNode }[] = [
    { cle: "identite", titre: t("ruulOnboarding.identite"), detail: !f.identite && <FormIdentite o={o} /> },
    { cle: "email", titre: t("ruulOnboarding.email"), detail: <FormEmail o={o} /> },
    {
      cle: "tiktok",
      titre: handle ? t("ruulOnboarding.tiktok", { handle }) : t("ruulOnboarding.tiktokSansHandle"),
      detail: !f.tiktok && <BoutonDeclarer etape="tiktok" libelle={t("calendrier.cinq.declarer.fait")} />,
    },
    {
      cle: "warmup",
      titre: t("ruulOnboarding.warmup"),
      detail: !f.warmup && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">{t("ruulOnboarding.warmupDetail", { n: o.abonnements })}</p>
          {warmupDeclare ? (
            <p className="text-success text-xs" data-testid="warmup-declare">{t("calendrier.cinq.declarer.merci", { heure: prochaineVerification("warmup") })}</p>
          ) : (
            <BoutonDeclarer etape="warmup" libelle={t("ruulOnboarding.warmupDeclarer")} />
          )}
        </div>
      ),
    },
    {
      cle: "slack",
      titre: t("ruulOnboarding.slack"),
      detail: !f.slack && (
        <span className="mt-1 inline-flex flex-wrap items-center gap-2">
          {regles.slack && (
            <a className="text-primary text-sm underline" href={regles.slack} target="_blank" rel="noreferrer">{t("ruulOnboarding.rejoindreSlack")}</a>
          )}
          <BoutonDeclarer etape="slack" libelle={t("calendrier.cinq.declarer.slack")} />
        </span>
      ),
    },
    {
      cle: "ruul",
      titre: ruul === "pret" ? t("ruulOnboarding.ruulPretTitre") : ruul === "invite" ? t("ruulOnboarding.ruulInviteTitre") : t("ruulOnboarding.ruulAttenteTitre"),
      detail: (
        <div className="space-y-1" data-testid="ruul-statut" data-etat={ruul}>
          <p className="text-muted-foreground text-xs">
            {ruul === "attente" && <span aria-hidden className="mr-1">⏳</span>}
            {ruul === "pret" ? t("ruulOnboarding.ruulPretTexte") : ruul === "invite"
              ? t("ruulOnboarding.ruulInviteTexte", { email: o.ruul_email ?? o.email_candidature ?? "your email" })
              : t("ruulOnboarding.ruulAttenteTexte")}
          </p>
          {ruul === "invite" && (
            <span className="mt-1 inline-flex flex-wrap items-center gap-2">
              <Button asChild size="sm" className="h-8">
                <a href={LIEN_RUUL} target="_blank" rel="noreferrer" data-testid="ouvrir-ruul">{t("ruulOnboarding.ouvrirRuul")}</a>
              </Button>
              <BoutonPret />
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card data-testid="checklist-ruul" className="border-primary/40">
      <CardHeader>
        <CardTitle>{t("ruulOnboarding.titre")}</CardTitle>
        {date && <CardDescription>{t("ruulOnboarding.avant", { date, dimanche })}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {lignes.map((l, i) => (
            <li key={l.cle} className="flex gap-3" data-testid={`ruul-etape-${l.cle}`} data-fait={f[l.cle] ? "oui" : "non"}>
              <Pastille numero={i + 1} fait={f[l.cle]} recommande={l.cle === "slack"} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", f[l.cle] && "text-muted-foreground")}>
                  {l.titre}
                  {l.cle === "slack" && <span className="ml-2 text-muted-foreground text-xs">{t("ruulOnboarding.recommande")}</span>}
                </p>
                {l.detail}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
