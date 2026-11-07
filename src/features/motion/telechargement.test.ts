import { describe, expect, it } from "vitest";
import { lienTelechargement, nomFichierMotion } from "./telechargement";

describe("téléchargement Motion", () => {
  it("nomme le fichier d'après le sujet et la langue", () => {
    expect(nomFichierMotion("What would happen if a supervolcano woke up?", "en")).toBe(
      "what-would-happen-if-a-supervolcano-woke-up-en.mp4",
    );
    expect(nomFichierMotion("Pourquoi la Suisse n'est-elle jamais en guerre ?", "fr", "sans-sous-titres")).toBe(
      "pourquoi-la-suisse-n-est-elle-jamais-en-guerre-fr-sans-sous-titres.mp4",
    );
    expect(nomFichierMotion("???", "de")).toBe("video-de.mp4");
  });

  it("ajoute ?download= à l'URL publique", () => {
    expect(lienTelechargement("https://x.supabase.co/storage/v1/object/public/medias/motion/a/en/v.mp4", "f.mp4")).toBe(
      "https://x.supabase.co/storage/v1/object/public/medias/motion/a/en/v.mp4?download=f.mp4",
    );
    expect(lienTelechargement("pas une url", "f.mp4")).toBe("pas une url");
  });
});
