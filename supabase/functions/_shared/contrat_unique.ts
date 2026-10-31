/**
 * 31/10 — Un seul profil de posteur par contrat Upwork. manage-users refuse
 * une 2e création (« POSTER_EXISTANT|id|nom|email ») ; l'onboarding de l'OS
 * relie alors le contrat au profil existant et envoie son welcome.
 */

/** Le n° de contrat d'une URL Upwork (workroom / contracts), comme contrat_de_url en base. */
export function contratDeUrl(url: string | null | undefined): string | null {
  const m = String(url ?? "").trim().match(/\/(?:workroom|contracts?)\/([0-9]{6,})/);
  return m ? m[1] : null;
}

/** « POSTER_EXISTANT|id|nom|email » : lu par le formulaire HM et par l'onboarding de l'OS. */
export function erreurPosteurExistant(p: { id: string; nom: string | null; email: string | null }): string {
  return ["POSTER_EXISTANT", p.id, (p.nom ?? "").replace(/\|/g, " "), (p.email ?? "").replace(/\|/g, " ")].join("|");
}

/** L'id du posteur qui a déjà le contrat, lu dans l'erreur de manage-users. */
export function posteurExistantDeErreur(erreur: string | null | undefined): string | null {
  const [code, id] = String(erreur ?? "").split("|");
  return code === "POSTER_EXISTANT" && /^[0-9a-f-]{36}$/i.test(id ?? "") ? id : null;
}
