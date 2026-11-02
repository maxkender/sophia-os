/** 31/10 : « POSTER_EXISTANT|id|nom|email » (manage-users) → le posteur qui a déjà ce contrat. */
export function posteurExistant(message: string): { id: string; nom: string; email: string } | null {
  const [code, id, nom, email] = message.split("|");
  return code === "POSTER_EXISTANT" && id ? { id, nom: nom ?? "", email: email ?? "" } : null;
}
