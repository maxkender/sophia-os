import type { MembreLibre } from "./api";

/** « José Pérez » → « jose perez » : la recherche ignore accents et casse. */
export function sansAccents(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function libelleMembre(m: MembreLibre): string {
  const nom = m.nom_reel || m.nom_affiche || m.slack_user_id;
  const affiche = m.nom_affiche && m.nom_affiche !== m.nom_reel ? ` (@${m.nom_affiche})` : "";
  return `${nom}${affiche}`;
}

/** Les membres dont le nom, le pseudo ou l'email contient chaque mot tapé. */
export function filtrerMembres(membres: MembreLibre[], recherche: string, max = 8): MembreLibre[] {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];
  return membres
    .filter((m) => {
      const texte = sansAccents(`${m.nom_reel ?? ""} ${m.nom_affiche ?? ""} ${m.email ?? ""}`);
      return mots.every((mot) => texte.includes(mot));
    })
    .slice(0, max);
}

/** Les membres qui ressemblent au posteur (un mot du nom en commun), pour pré-remplir la recherche. */
export function suggestions(membres: MembreLibre[], nom: string | null, max = 3): MembreLibre[] {
  const mots = sansAccents(nom).split(/\s+/).filter((m) => m.length >= 3);
  if (mots.length === 0) return [];
  return membres
    .map((m) => {
      const texte = sansAccents(`${m.nom_reel ?? ""} ${m.nom_affiche ?? ""}`);
      return { m, score: mots.filter((mot) => texte.includes(mot)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.m);
}
