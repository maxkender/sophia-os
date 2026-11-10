import { Gift } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Statut d'un filleul, vu par le parrain. */
/** invited → applied → accepted → started → bonus paid (9/11) ; plus « liste d'attente » et « arrêté ». */
export type StatutFilleul = "attente" | "envoye" | "postule" | "accepte" | "actif" | "bonus_paye" | "arrete";

export interface Filleul {
  id: string;
  prenom: string;
  pays: string;
  statut: StatutFilleul;
  cree_at: string;
}

export interface PaysParrainable {
  code: string;
  nom: string;
  /** Recrutement ouvert et envoi automatique : l'email part. Sinon : liste d'attente. */
  ouvert: boolean;
}

export const LIBELLE_FILLEUL: Record<StatutFilleul, string> = {
  attente: "Waiting list",
  envoye: "Invited",
  postule: "Applied",
  accepte: "Accepted",
  actif: "Started",
  bonus_paye: "Bonus paid 🎉",
  arrete: "Stopped",
};

const COULEUR: Record<StatutFilleul, string> = {
  attente: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  envoye: "bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  postule: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200",
  accepte: "bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200",
  actif: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  bonus_paye: "bg-emerald-200 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100",
  arrete: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

/** 9/11 : « How it works », toujours visible (le texte de Max, mot pour mot). */
export const COMMENT_CA_MARCHE = [
  "Your friend doesn't need Upwork or any freelancing account: they apply directly with the link we email them.",
  "Same job as yours: 2 posts a day, 7 days a week, warm-up first, start on a Monday, ongoing week after week.",
  "Your friend will see their weekly rate on their dashboard.",
  "Your $10 bonus is paid on Upwork, as a bonus on your current contract, the Monday after your friend completes their first full week of posts. Nothing to do.",
  "Tell your friend to watch their inbox (and spam folder): the email comes from Sophia.",
  "You can follow each referral's status here: invited → applied → accepted → started → bonus paid.",
];

/** 0592 : pour un posteur payé par Ruul, le bonus part avec sa paie Ruul (jamais Upwork). */
export const BONUS_RUUL = "Your $10 bonus is paid with your weekly Ruul payment, the Monday after your friend completes their first full week of posts. Nothing to do.";

export const AMI_RUUL = "Your friend doesn't need any freelancing account: they apply directly with the link we email them.";

export function commentCaMarche(ruul: boolean): string[] {
  if (!ruul) return COMMENT_CA_MARCHE;
  return COMMENT_CA_MARCHE.map((l) =>
    l.startsWith("Your $10 bonus is paid on Upwork") ? BONUS_RUUL
    : l.startsWith("Your friend doesn't need Upwork") ? AMI_RUUL
    : l);
}

export const MAX_PAR_MOIS = 10;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface PropsBlocParrainer {
  pays: PaysParrainable[];
  filleuls: Filleul[];
  /** Filleuls ajoutés ce mois-ci (10 au plus). */
  ceMois: number;
  envoyer: (f: { email: string; prenom: string; pays: string }) => Promise<{ attente: boolean }>;
  /** 0592 : le parrain est payé par Ruul (aucun texte Upwork). */
  ruul?: boolean;
}

/**
 * 8/11 : « Refer a friend » sur le dashboard du posteur. L'email part de
 * Sophia (site vik-studios-creators.com, expéditeur noreply@sophia-culture.com) dans la langue du pays de l'ami ; 10 amis par
 * mois au plus ; l'accord de l'ami est obligatoire.
 */
export function BlocParrainer({ pays, filleuls, ceMois, envoyer, ruul = false }: PropsBlocParrainer) {
  const [email, setEmail] = React.useState("");
  const [prenom, setPrenom] = React.useState("");
  const [code, setCode] = React.useState("");
  const [accord, setAccord] = React.useState(false);
  const [etat, setEtat] = React.useState<{ envoi: boolean; fait: { prenom: string; attente: boolean } | null; erreur: string | null }>({
    envoi: false, fait: null, erreur: null,
  });
  const plein = ceMois >= MAX_PAR_MOIS;
  const pret = EMAIL_OK.test(email.trim()) && prenom.trim().length >= 1 && !!code && accord && !plein;
  const paysChoisi = pays.find((p) => p.code === code);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pret) return;
    setEtat({ envoi: true, fait: null, erreur: null });
    try {
      const r = await envoyer({ email: email.trim().toLowerCase(), prenom: prenom.trim(), pays: code });
      setEtat({ envoi: false, fait: { prenom: prenom.trim(), attente: r.attente }, erreur: null });
      setEmail("");
      setPrenom("");
      setCode("");
      setAccord(false);
    } catch (err) {
      setEtat({ envoi: false, fait: null, erreur: (err as Error).message || "Something went wrong. Please try again." });
    }
  };

  return (
    <Card data-testid="bloc-parrainer">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success-foreground">
            <Gift className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Refer a friend</h2>
            <p className="text-sm text-muted-foreground">
              Know someone who'd like this job? Add them here. You get a <b>$10 bonus</b> once they complete their first full week of posts.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="parrainer-comment">
          <h3 className="mb-1 font-semibold">How it works</h3>
          <ul className="list-disc space-y-1 pl-5">
            {commentCaMarche(ruul).map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>

        {etat.fait && (
          <p className="rounded-lg bg-success/10 p-3 text-sm" role="status" data-testid="parrainer-ok">
            {etat.fait.attente
              ? "We're not recruiting in this country right now, we'll contact your friend as soon as we are."
              : `Done! ${etat.fait.prenom} will get an email from Sophia in a few minutes. Tell them to look out for it 🙂`}
          </p>
        )}

        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => void soumettre(e)}>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Friend's email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" autoComplete="off" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">First name</span>
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Maria" autoComplete="off" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Country</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Country"
            >
              <option value="">Choose…</option>
              {pays.map((p) => (
                <option key={p.code} value={p.code}>{p.nom}</option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-3">
            <input type="checkbox" className="mt-0.5 size-4" checked={accord} onChange={(e) => setAccord(e.target.checked)} />
            <span>My friend agreed to receive an email from Sophia</span>
          </label>
          {paysChoisi && !paysChoisi.ouvert && (
            <p className="text-xs text-warning-foreground sm:col-span-3">
              We're not recruiting in this country right now, we'll contact your friend as soon as we are.
            </p>
          )}
          <p className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm font-medium sm:col-span-3" data-testid="parrainer-prevenir">
            👉 Let your friend know they'll receive an email from Sophia (check the spam folder too!)
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <Button type="submit" disabled={!pret || etat.envoi}>{etat.envoi ? "Sending…" : "Send the invitation"}</Button>
            <span className="text-xs text-muted-foreground">{Math.min(ceMois, MAX_PAR_MOIS)}/{MAX_PAR_MOIS} friends this month</span>
            {plein && <span className="text-xs text-warning-foreground">You've reached 10 friends this month. You can add more next month.</span>}
          </div>
          {etat.erreur && <p className="text-sm text-destructive sm:col-span-3">{etat.erreur}</p>}
        </form>

        {filleuls.length > 0 && (
          <div className="space-y-2" data-testid="mes-filleuls">
            <h3 className="text-sm font-semibold">Your friends</h3>
            <ul className="divide-y rounded-lg border">
              {filleuls.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{f.prenom}</span>
                  <span className="text-xs text-muted-foreground">{f.pays}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${COULEUR[f.statut]}`}>{LIBELLE_FILLEUL[f.statut]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
