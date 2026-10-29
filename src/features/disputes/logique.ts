import type { Contestation, Dossier, LignePaieDossier, Verdict } from "./api";

/**
 * Prompt 21, partie R : les onglets de Disputes et le verdict que propose
 * l'OS (« the OS was wrong » / « the OS was right ») avec sa raison en une
 * phrase. La raison est en anglais : elle remplit {raison} dans la réponse
 * au posteur.
 */
export const ONGLETS = ["ouvertes", "paie", "kill", "posts", "feedback", "fermees"] as const;
export type Onglet = (typeof ONGLETS)[number];

export function filtrerOnglet(liste: Contestation[], onglet: Onglet): Contestation[] {
  const ouvertes = liste.filter((c) => c.statut === "ouverte");
  switch (onglet) {
    case "ouvertes":
      return ouvertes.filter((c) => c.genre === "contestation");
    case "paie":
      return ouvertes.filter((c) => c.type === "paie");
    case "kill":
      return ouvertes.filter((c) => c.type === "kill");
    case "posts":
      return ouvertes.filter((c) => c.type === "posts" || c.type === "lien");
    case "feedback":
      return liste.filter((c) => c.genre === "retour");
    case "fermees":
      return liste.filter((c) => c.statut === "fermee" && c.genre === "contestation");
  }
}

export function compterOnglets(liste: Contestation[]): Record<Onglet, number> {
  return Object.fromEntries(
    ONGLETS.map((o) => [o, o === "feedback" ? liste.filter((c) => c.genre === "retour" && c.statut === "ouverte").length : filtrerOnglet(liste, o).length]),
  ) as Record<Onglet, number>;
}

/** R6 : ouverte depuis plus de 24 h → en rouge. */
export function enRetard(c: Pick<Contestation, "statut" | "recu_at">, maintenant = new Date()): boolean {
  return c.statut === "ouverte" && maintenant.getTime() - new Date(c.recu_at).getTime() > 24 * 3600_000;
}

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const jour = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", day: "numeric", month: "short" }).format(new Date(iso));

/** La ligne de paie de la semaine contestée (la plus récente si plusieurs). */
export function ligneDeLaSemaine(d: Dossier): LignePaieDossier | null {
  return d.paie.find((l) => l.semaine === d.semaine) ?? null;
}

/** « Pay what's due » : la ligne due, ni payée ni exclue. null : rien à payer. */
export function ligneDue(d: Dossier): LignePaieDossier | null {
  const l = ligneDeLaSemaine(d);
  if (!l || l.paye_at || l.exclu || !(Number(l.montant ?? 0) > 0)) return null;
  // Déjà approuvée par l'API (la case « payé » arrive au passage suivant) : rien de plus.
  if (d.paiements.some((p) => p.semaine === l.semaine && p.jalon_approuve)) return null;
  return l;
}

/** Les posts de la semaine avec un lien, et ceux dont le lien n'a pas été trouvé ni confirmé. */
export function bilanPosts(d: Dossier) {
  const avecLien = d.posts.filter((p) => p.url);
  const douteux = avecLien.filter((p) => !p.confirme && (p.resolution === "introuvable" || p.resolution === "a_resoudre"));
  return { avecLien: avecLien.length, douteux: douteux.length, sansLien: d.posts.length - avecLien.length };
}

export interface Proposition {
  verdict: Verdict | null;
  raison: string;
  /** La preuve Upwork (paie) : la milestone approuvée et son montant. */
  preuve: string | null;
}

export function proposerVerdict(d: Dossier): Proposition {
  const type = d.contestation.type;
  if (type === "paie") {
    const l = ligneDeLaSemaine(d);
    const p = d.paiements.find((x) => x.semaine === d.semaine && x.jalon_approuve) ?? null;
    const preuve = p ? `Upwork milestone ${p.jalon_approuve} approved: ${usd(Number(p.montant_approuve ?? 0))}` : null;
    if (!l) {
      const b = bilanPosts(d);
      return b.avecLien > 0
        ? { verdict: "os_tort", raison: `${b.avecLien} post(s) with a link that week, but no pay line.`, preuve }
        : { verdict: "os_raison", raison: "No post with a link that week, so nothing was due.", preuve };
    }
    if (l.exclu) return { verdict: "os_raison", raison: `That week is not paid by the OS${l.raison ? ` (${l.raison})` : ""}.`, preuve };
    if (l.paye_at || p) {
      const montant = Number(p?.montant_approuve ?? l.montant ?? 0);
      return { verdict: "os_raison", raison: `That week was paid on ${jour(l.paye_at ?? p!.maj_at)} (${usd(montant)}).`, preuve };
    }
    if (!(Number(l.montant ?? 0) > 0)) {
      return { verdict: "os_raison", raison: `0 counted posts that week (${l.faits ?? 0} of ${l.prevus ?? 0}), so nothing was due.`, preuve };
    }
    return { verdict: "os_tort", raison: `${usd(Number(l.montant))} is due for that week and was not paid yet.`, preuve };
  }
  if (type === "kill") {
    const a = d.arret;
    const k = d.kill;
    if (!a && !k) return { verdict: null, raison: "No Kill or stop found for this poster.", preuve: null };
    const debut = k?.message_at ?? null;
    const fin = a?.created_at ?? k?.prevu_at ?? null;
    const repondu = debut && d.recus.some((r) => r.at > debut && (!fin || r.at < fin));
    const motif = a?.motif ?? a?.source ?? "kill_48h";
    if (motif === "je_ne_veux_plus") return { verdict: "os_raison", raison: "You asked to stop.", preuve: null };
    if (motif === "moins6") {
      const b = bilanPosts(d);
      if (b.douteux > 0) return { verdict: "os_tort", raison: `${b.douteux} of your links were not found on TikTok and not counted.`, preuve: null };
      return { verdict: "os_raison", raison: `Only ${b.avecLien} post(s) with a link that week, under the 6 required.`, preuve: null };
    }
    if (repondu) return { verdict: "os_tort", raison: "You replied before the Kill.", preuve: null };
    return {
      verdict: "os_raison",
      raison: debut ? `No step done and no reply within 48 hours after our message of ${jour(debut)}.` : "The step was not done in time.",
      preuve: null,
    };
  }
  if (type === "posts" || type === "lien") {
    const b = bilanPosts(d);
    if (b.douteux > 0) return { verdict: "os_tort", raison: `${b.douteux} link(s) were not found on TikTok and not counted.`, preuve: null };
    return { verdict: "os_raison", raison: `All ${b.avecLien} post(s) with a link that week were counted.`, preuve: null };
  }
  return { verdict: null, raison: "Check the message they got.", preuve: null };
}

/** La réponse proposée : le modèle du verdict, rempli (modifiable avant l'envoi). */
export function reponseProposee(modele: string, prenom: string | null, raison: string): string {
  return modele.replace(/\{prenom\}/g, prenom?.trim() || "there").replace(/\{raison\}/g, raison).trim();
}
