import type { ScrapedPost } from "./apify.ts";
import { messageErreur, type serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/**
 * Le profil d'un compte (abonnés, lien cliquable) lu sur un scrape de son
 * profil : Apify le répète sur chaque post, on prend le premier qui le porte.
 * `null` si aucun post ne le donne (compte sans post, réponse incomplète) :
 * mieux vaut ne rien écrire qu'écrire 0 abonné.
 */
export function profilDepuisPosts(
  posts: Pick<ScrapedPost, "auteur">[],
): { abonnes: number; lienBio: string | null } | null {
  const porteur = posts.find((p) => typeof p.auteur?.abonnes === "number");
  if (!porteur) return null;
  return { abonnes: porteur.auteur.abonnes as number, lienBio: porteur.auteur.lienBio };
}

/**
 * Garde le dernier profil connu du compte dans `compte_profils` (0323), lu
 * par le contrôle hebdomadaire « lien à 1 000 abonnés ». Le scrape est déjà
 * payé par le relevé de vues : ceci ne coûte aucun appel Apify.
 *
 * Ne lève jamais : un profil non enregistré se rattrape au scrape suivant, et
 * ne doit pas faire échouer le relevé des vues qui le porte.
 */
export async function enregistrerProfil(
  supabase: Supabase,
  compteId: string,
  posts: Pick<ScrapedPost, "auteur">[],
): Promise<void> {
  const profil = profilDepuisPosts(posts);
  if (!profil) return;
  const { error } = await supabase.from("compte_profils").upsert(
    {
      compte_id: compteId,
      abonnes: profil.abonnes,
      bio_lien: profil.lienBio,
      releve_at: new Date().toISOString(),
    },
    { onConflict: "compte_id" },
  );
  if (error) console.error(`[profil] ${compteId} : ${messageErreur(error)}`);
}
