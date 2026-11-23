// Indicatifs téléphoniques (pays ouverts et voisins). Le sélecteur propose aussi « + » libre.
export const INDICATIFS: Record<string, string> = {
  AE: "971", AM: "374", AR: "54", AT: "43", AU: "61", BA: "387", BE: "32", BG: "359", BO: "591", BR: "55", CA: "1",
  CH: "41", CL: "56", CO: "57", CZ: "420", DE: "49", DK: "45", EC: "593", EE: "372", ES: "34", FI: "358", FR: "33",
  GB: "44", GE: "995", GR: "30", HR: "385", HU: "36", ID: "62", IE: "353", IL: "972", IN: "91", IS: "354", IT: "39",
  JP: "81", KR: "82", KZ: "7", LB: "961", LT: "370", LU: "352", LV: "371", MA: "212", ME: "382", MX: "52", MY: "60",
  NL: "31", NO: "47", NZ: "64", PH: "63", PL: "48", PT: "351", RO: "40", RS: "381", SA: "966", SE: "46", SG: "65",
  SI: "386", SK: "421", TH: "66", TR: "90", UA: "380", US: "1", UY: "598", VE: "58", VN: "84", ZA: "27",
};

/** Le numéro au format international : indicatif + numéro local sans le 0 de tête. */
export function formatInternational(indicatif: string, local: string): string {
  const chiffres = local.replace(/[^\d+]/g, "");
  if (chiffres.startsWith("+")) return chiffres;
  if (chiffres.startsWith("00")) return `+${chiffres.slice(2)}`;
  return `+${indicatif}${chiffres.replace(/^0+/, "")}`;
}
