/**
 * 23/11 (Max) : le rappel aux posteurs Ruul « reportés » (paie prête, mais pas encore READY chez Ruul), adapté à leur
 * statut Ruul, avec leur prénom et leur montant. Textes de Max, mot pour mot (anglais ; traduits ensuite selon le pays).
 */

export type CasReporte = "PENDING_KYC" | "PENDING_COLLECTION_ACCOUNT" | "NOT_REGISTERED";
export const CAS_REPORTES: readonly CasReporte[] = ["PENDING_KYC", "PENDING_COLLECTION_ACCOUNT", "NOT_REGISTERED"];

/** Le cas d'un posteur : son statut Ruul actuel s'il est l'un des trois, sinon celui noté dans la raison du report. */
export function casReporte(onboarding: string | null | undefined, raison: string | null | undefined): CasReporte | null {
  const o = (onboarding ?? "").trim().toUpperCase();
  if ((CAS_REPORTES as readonly string[]).includes(o)) return o as CasReporte;
  const m = (raison ?? "").match(/\((PENDING_KYC|PENDING_COLLECTION_ACCOUNT|NOT_REGISTERED)\)/);
  return m ? m[1] as CasReporte : null;
}

/** « 7 », « 10.5 » : le montant sans zéros inutiles. */
export function montantClair(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** « Hi Prénom, » (premier mot, majuscule) ; « Hi there, » s'il manque. */
export function salutation(prenom: string | null | undefined): string {
  const p = (prenom ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p || p === "?") return "Hi there,";
  return `Hi ${p.charAt(0).toLocaleUpperCase() + p.slice(1)},`;
}

/** L'objet et le corps (texte brut) du rappel. */
export function texteRappelReporte(
  cas: CasReporte,
  prenom: string | null | undefined,
  montant: number,
  ruulEmail: string,
): { objet: string; corps: string } {
  const m = montantClair(montant);
  const debut = `${salutation(prenom)}\n\nGreat job posting last week! Your payment of $${m} is ready, but`;
  const fin = "\n\nThanks!\nVik Studios";
  if (cas === "PENDING_KYC") {
    return {
      objet: `Your payment of $${m} is waiting – one step left on Ruul`,
      corps: `${debut} we can't send it yet: your identity verification on Ruul isn't finished.\n\n` +
        "Log in to Ruul and complete the ID check (it takes about 5 minutes). As soon as it's approved, you'll receive this week's payment together with the next one.\n\n" +
        "If you're stuck on a step, contact Ruul support directly from the app." + fin,
    };
  }
  if (cas === "PENDING_COLLECTION_ACCOUNT") {
    return {
      objet: `Add your payout method on Ruul to receive $${m}`,
      corps: `${debut} you haven't added a payout method on Ruul yet.\n\n` +
        "Log in to Ruul, go to your payout settings and add your bank account (or another payout method). As soon as it's done, you'll receive this week's payment together with the next one.\n\n" +
        "If you have trouble, contact Ruul support directly from the app." + fin,
    };
  }
  return {
    objet: `Create your Ruul account to get paid ($${m} waiting)`,
    corps: `${debut} you haven't created your Ruul account yet. That's how we pay you.\n\n` +
      `Open the Ruul invitation we sent to ${ruulEmail} (check your spam folder too), create your account, verify your identity and add your payout method. As soon as it's done, you'll receive this week's payment together with the next one.\n\n` +
      "If you can't find the invitation, reply to this email and we'll send it again." + fin,
  };
}
