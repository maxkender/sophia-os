/**
 * 12/11 (OS clair) : « Aujourd'hui », ce que Max doit faire maintenant. 5 lignes au plus,
 * la plus urgente en haut, chacune avec son bouton. Une ligne à 0 n'apparaît pas.
 */
export interface LigneAujourdhui {
  cle: string;
  icone: string;
  texte: string;
  bouton: string;
  to: string;
  rang: number;
}

export interface EntreeAujourdhui {
  pourMax: number;
  maintenant: number;
  jeudi: number;
  samedi: number;
  ruulAInviter: number;
  /** 0678 : contrats dont le pays est introuvable ou fermé (sinon la règle relie tout). */
  contratsARelier?: number;
  /** 0681 : heures depuis le dernier import des statuts Ruul (null : jamais, undefined : inconnu). */
  ruulImportHeures?: number | null;
  /** 0690 : signés sans compte (création refusée), erreurs d'envoi du parcours Ruul. */
  creationsEchouees?: number;
  parcoursErreurs?: number;
  /** 0700 : emails en file (réessai auto), non délivrés (24 h), Brevo sans crédit, clé Brevo absente. */
  emailsEnFile?: number;
  emailsNonDelivres?: number;
  brevoSansCredit?: boolean;
  brevoCleAbsente?: boolean;
  /** 0 = dimanche … 6 = samedi, heure de Paris. */
  jourSemaine: number;
}

const s = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export function lignesAujourdhui(e: EntreeAujourdhui): LigneAujourdhui[] {
  const l: LigneAujourdhui[] = [];
  if (e.pourMax > 0) {
    l.push({ cle: "pour_max", icone: "💰", rang: 1, texte: `${s(e.pourMax, "demande", "demandes")} paiement / urgent pour toi`, bouton: "Ouvrir", to: "/admin/auto/support?onglet=boite" });
  }
  if ((e.creationsEchouees ?? 0) > 0) {
    l.push({ cle: "creations", icone: "⛔", rang: 1, texte: `${s(e.creationsEchouees!, "signé", "signés")} sans compte : création refusée`, bouton: "Voir", to: "/admin/auto/ruul" });
  }
  if ((e.parcoursErreurs ?? 0) > 0) {
    l.push({ cle: "parcours", icone: "✉️", rang: 2, texte: `${s(e.parcoursErreurs!, "email Ruul", "emails Ruul")} en erreur (24 h)`, bouton: "Voir", to: "/admin/auto/ruul" });
  }
  // 0700 (13/11) : Brevo sans crédit → les emails attendent en file ; sinon les emails en file / non délivrés.
  if (e.brevoSansCredit) {
    const n = e.emailsEnFile ?? 0;
    l.push({ cle: "brevo_credit", icone: "🚨", rang: 0, texte: `Brevo sans crédit : ${s(n, "email en attente", "emails en attente")} (ils partiront dès que Brevo a du crédit)`, bouton: "Brevo", to: "https://app.brevo.com/billing/addon/customize/emails" });
  } else if ((e.emailsEnFile ?? 0) > 0) {
    l.push({ cle: "emails_file", icone: "📨", rang: 2, texte: `${s(e.emailsEnFile!, "email en file", "emails en file")} : Brevo a refusé, nouvel essai automatique`, bouton: "Voir", to: "/admin/auto/ruul" });
  }
  if ((e.emailsNonDelivres ?? 0) > 0) {
    l.push({ cle: "emails_refuses", icone: "✉️", rang: 2, texte: `${s(e.emailsNonDelivres!, "email non délivré", "emails non délivrés")} (24 h)`, bouton: "Voir", to: "/admin/auto/ruul" });
  }
  if (e.brevoCleAbsente) {
    l.push({ cle: "brevo_cle", icone: "🔑", rang: 3, texte: "Livraison des emails non vérifiée : clé Brevo à ajouter", bouton: "Ajouter", to: "https://supabase.com/dashboard/project/mbikecieskoobeizixig/functions/secrets" });
  }
  if (e.maintenant > 0) {
    l.push({ cle: "maintenant", icone: "✋", rang: 2, texte: `${s(e.maintenant, "décision", "décisions")} à prendre maintenant`, bouton: "Décider", to: "/admin/auto/decisions" });
  }
  // Le samedi se prépare dès le vendredi ; le jeudi, le jour même.
  if (e.samedi > 0 && (e.jourSemaine === 5 || e.jourSemaine === 6)) {
    l.push({ cle: "samedi", icone: "🗓️", rang: 3, texte: `${s(e.samedi, "décision", "décisions")} à prendre avant samedi 20h`, bouton: "Valider", to: "/admin/auto/decisions" });
  }
  if (e.jeudi > 0 && e.jourSemaine === 4) {
    l.push({ cle: "jeudi", icone: "🗓️", rang: 3, texte: `${s(e.jeudi, "décision", "décisions")} du jeudi`, bouton: "Décider", to: "/admin/auto/decisions" });
  }
  if (e.jourSemaine === 1) {
    l.push({ cle: "paie", icone: "💳", rang: 4, texte: "Paie du lundi : Upwork et Ruul", bouton: "Payer", to: "/admin/auto/payroll" });
  }
  if ((e.contratsARelier ?? 0) > 0) {
    const n = e.contratsARelier!;
    l.push({ cle: "contrats", icone: "🌍", rang: 2, texte: `${s(n, "contrat", "contrats")} : pays introuvable ou fermé`, bouton: "Répondre", to: "/admin/auto/recruits" });
  }
  if (e.ruulImportHeures === null || (e.ruulImportHeures !== undefined && e.ruulImportHeures > 48)) {
    const quand = e.ruulImportHeures === null ? "jamais importés" : `pas importés depuis ${Math.floor(e.ruulImportHeures / 24)} jours`;
    l.push({ cle: "ruul_import", icone: "🔄", rang: 4, texte: `Statuts Ruul ${quand}`, bouton: "Importer", to: "/admin/auto/ruul" });
  }
  if (e.ruulAInviter > 0) {
    l.push({ cle: "ruul", icone: "📧", rang: 5, texte: `${s(e.ruulAInviter, "posteur Ruul", "posteurs Ruul")} à inviter dans Ruul`, bouton: "Voir", to: "/admin/auto/ruul" });
  }
  return l.sort((a, b) => a.rang - b.rang).slice(0, 5);
}

/** Le jour de la semaine à Paris (0 = dimanche). */
export function jourParis(d = new Date()): number {
  const nom = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nom);
}
