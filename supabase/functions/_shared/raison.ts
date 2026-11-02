/**
 * Prompt 25, mises à jour, point 1 : chaque message envoyé garde sa raison, les
 * données utilisées, en clair (Messages sent, carte de la recrue). Par exemple
 * « pas connectée depuis le 29/10 », « @sara.studie746 introuvable aux 2
 * derniers relevés ». Rien ici ne touche la base ni le réseau.
 */

/** « 29/10 » (heure de Paris) ; vide si la date manque. */
export function jourCourt(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }).format(d);
}

const depuis = (iso: unknown) => (jourCourt(iso) ? ` depuis le ${jourCourt(iso)}` : "");

/** Une relance : un morceau par chose qui manque. */
function raisonRelance(d: Record<string, unknown>): string {
  const elements = Array.isArray(d.elements) ? (d.elements as string[]) : typeof d.element === "string" ? [d.element] : [];
  const handle = typeof d.handle === "string" && d.handle ? `@${d.handle.replace(/^@/, "")}` : "le compte";
  const morceaux = elements.map((e) => {
    switch (e) {
      case "slack":
        return "pas sur Slack";
      case "connexion":
        return `pas connectée${depuis(d.bienvenue ?? d.offre)}`;
      case "tiktok":
        return `${handle} pas trouvé sur TikTok`;
      case "warmup":
        return "Start warmup pas cliqué";
      case "follows": {
        const n = Number(d.abonnements);
        return Number.isFinite(n) ? `${n} abonnement${n > 1 ? "s" : ""} sur 5` : "abonnements à faire";
      }
      default:
        return e;
    }
  });
  const releve = jourCourt(d.releve_at) ? ` (relevé TikTok du ${jourCourt(d.releve_at)})` : "";
  return morceaux.length ? morceaux.join(" · ") + (elements.some((e) => e === "tiktok" || e === "follows") ? releve : "") : "relance du jour";
}

/** La raison d'un message, d'après son type et les données utilisées pour le préparer. */
export function raisonLisible(type: string, donnees: Record<string, unknown> | null | undefined): string {
  const d = donnees ?? {};
  switch (type) {
    case "relance":
      return raisonRelance(d);
    case "handle":
    case "handle_upwork": {
      const h = typeof d.handle === "string" ? `@${d.handle}` : "le @";
      const base = `${h} introuvable aux 2 derniers relevés${depuis(d.introuvable_depuis)}, Start warmup cliqué${jourCourt(d.start_warmup) ? ` le ${jourCourt(d.start_warmup)}` : ""}`;
      return type === "handle_upwork" ? `${base} ; pas de réaction 24 h après le message Slack` : base;
    }
    case "accueil":
      return `offre acceptée${jourCourt(d.offre) ? ` le ${jourCourt(d.offre)}` : ""}${d.contrat ? `, contrat ${d.contrat}` : ""}`;
    case "lundi_soir": {
      const n = Number(d.posts_avec_lien_lundi);
      return `1er jour de posts${jourCourt(d.cohorte) ? ` (${jourCourt(d.cohorte)})` : ""} : warm-up fini, ${Number.isFinite(n) ? n : 0} post avec lien à ${d.heure_locale ?? "20 h"}`;
    }
    case "lundi":
      return "message du lundi";
    case "lien_introuvable": {
      const n = Array.isArray(d.liens) ? d.liens.length : 0;
      return `${n} lien(s) de post introuvable(s) sur le profil plus de 24 h après la publication${jourCourt(d.depuis) ? ` (depuis le ${jourCourt(d.depuis)})` : ""}`;
    }
    case "jeudi":
      return typeof d.raison === "string" ? d.raison : "choisi sur la page du jeudi";
    default:
      return typeof d.raison === "string" ? d.raison : type;
  }
}

/** Les familles de messages : une recrue n'en reçoit qu'un par jour dans chaque famille. */
export function familleMessage(type: string): string {
  if (["relance", "handle", "handle_upwork", "connexion", "tiktok", "warmup_lance", "warmup_bien_fait"].includes(type)) return "relance";
  return type;
}
