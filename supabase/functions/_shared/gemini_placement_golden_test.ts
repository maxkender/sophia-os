/**
 * Prompt de placement Sophia : instantanés OCTET POUR OCTET.
 *
 * Le multi-applications a retiré les branches `marque === "micabo"` de
 * `integrateSophia`. Le texte envoyé au modèle pour Sophia ne devait PAS bouger
 * d'un caractère : c'est lui qui pose la slide pub des ~280 posts quotidiens,
 * et une virgule déplacée change ce que Gemini écrit. Ces instantanés ont été
 * capturés sur le code AVANT nettoyage (3 decks × fr / tr / de, avec la marque
 * « sophia » ET sans marque — les deux chemins historiques), puis le nettoyage
 * a été fait sous ce test.
 *
 * Si l'un d'eux casse, ce n'est pas l'instantané qu'il faut régénérer à la
 * légère : c'est le prompt Sophia de production qui a changé.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { integrateSophia } from "./gemini.ts";

const LANGUES_GOLDEN = ["fr", "tr", "de"] as const;

const DECKS_GOLDEN = {
  // Deck numéroté, corrections avec et sans texte d'origine.
  numerote: {
    masterPrompt: "Tu es le rédacteur des slides Sophia.\nPlace Sophia sans que ça se voie.",
    corrections: [
      { original_text: "télécharge Sophia maintenant", corrected_text: "une appli comme Sophia m'aide" },
      { original_text: null, corrected_text: "j'utilise l'appli Sophia le soir" },
    ],
    slides: [
      { position: 1, text: "5 habitudes qui ont changé ma vie" },
      { position: 2, text: "1. je lis 10 pages par jour" },
      { position: 3, text: "2. je marche 30 minutes" },
      { position: 4, text: "3. je coupe mon téléphone à 21h" },
      { position: 5, text: "4. j'apprends un truc nouveau chaque matin" },
      { position: 6, text: "5. je dors 8 heures" },
    ],
    caption: "mes habitudes #routine",
  },
  // Aucune correction, légende vide, une slide vide.
  sansCorrections: {
    masterPrompt: "Prompt maître minimal.",
    corrections: [],
    slides: [
      { position: 1, text: "Ce que personne ne te dit sur la confiance" },
      { position: 2, text: "Tu n'as pas besoin d'être parfait" },
      { position: 3, text: "" },
      { position: 4, text: "Personne ne te regarde autant que tu crois" },
    ],
    caption: "",
  },
  // Deux slides seulement, prompt maître vide.
  court: {
    masterPrompt: "",
    corrections: [{ original_text: "Sophia est top", corrected_text: "Sophia m'a appris ça" }],
    slides: [
      { position: 1, text: "Le saviez-vous ?" },
      { position: 2, text: "les pieuvres ont trois cœurs 🐙" },
    ],
    caption: "fun fact",
  },
};

/** Capturés sur `integrateSophia` AVANT le retrait de micabo (commit 9483baa). */
const INSTANTANES: Record<string, string> = {
  "numerote:fr": `LANGUE DE SORTIE : FRANÇAIS.
Les variantes que tu écris doivent être en français, quelle que soit la langue
des consignes ci-dessous.

Tu es le rédacteur des slides Sophia.
Place Sophia sans que ça se voie.

--- DONNÉES ---
Légende de la vidéo : mes habitudes #routine
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "5 habitudes qui ont changé ma vie"
Slide 2 : "1. je lis 10 pages par jour"
Slide 3 : "2. je marche 30 minutes"
Slide 4 : "3. je coupe mon téléphone à 21h"
Slide 5 : "4. j'apprends un truc nouveau chaque matin"
Slide 6 : "5. je dors 8 heures"

Corrections passées à respecter :
- Au lieu de : "télécharge Sophia maintenant"
  Écris plutôt : "une appli comme Sophia m'aide"
- Bon exemple : "j'utilise l'appli Sophia le soir"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 4, 5, 6. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en français. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en français).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en français.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "numerote:tr": `LANGUE DE SORTIE : TURC.
Les variantes que tu écris doivent être en turc, quelle que soit la langue
des consignes ci-dessous.

Tu es le rédacteur des slides Sophia.
Place Sophia sans que ça se voie.

--- DONNÉES ---
Légende de la vidéo : mes habitudes #routine
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "5 habitudes qui ont changé ma vie"
Slide 2 : "1. je lis 10 pages par jour"
Slide 3 : "2. je marche 30 minutes"
Slide 4 : "3. je coupe mon téléphone à 21h"
Slide 5 : "4. j'apprends un truc nouveau chaque matin"
Slide 6 : "5. je dors 8 heures"

Corrections passées à respecter :
- Au lieu de : "télécharge Sophia maintenant"
  Écris plutôt : "une appli comme Sophia m'aide"
- Bon exemple : "j'utilise l'appli Sophia le soir"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 4, 5, 6. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en turc. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en turc).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en turc.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "numerote:de": `LANGUE DE SORTIE : ALLEMAND.
Les variantes que tu écris doivent être en allemand, quelle que soit la langue
des consignes ci-dessous.

Tu es le rédacteur des slides Sophia.
Place Sophia sans que ça se voie.

--- DONNÉES ---
Légende de la vidéo : mes habitudes #routine
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "5 habitudes qui ont changé ma vie"
Slide 2 : "1. je lis 10 pages par jour"
Slide 3 : "2. je marche 30 minutes"
Slide 4 : "3. je coupe mon téléphone à 21h"
Slide 5 : "4. j'apprends un truc nouveau chaque matin"
Slide 6 : "5. je dors 8 heures"

Corrections passées à respecter :
- Au lieu de : "télécharge Sophia maintenant"
  Écris plutôt : "une appli comme Sophia m'aide"
- Bon exemple : "j'utilise l'appli Sophia le soir"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 4, 5, 6. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en allemand. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en allemand).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en allemand.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "sansCorrections:fr": `LANGUE DE SORTIE : FRANÇAIS.
Les variantes que tu écris doivent être en français, quelle que soit la langue
des consignes ci-dessous.

Prompt maître minimal.

--- DONNÉES ---
Légende de la vidéo : (aucune)
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "Ce que personne ne te dit sur la confiance"
Slide 2 : "Tu n'as pas besoin d'être parfait"
Slide 3 : "(vide)"
Slide 4 : "Personne ne te regarde autant que tu crois"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 2, 3, 4. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en français. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en français).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en français.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "sansCorrections:tr": `LANGUE DE SORTIE : TURC.
Les variantes que tu écris doivent être en turc, quelle que soit la langue
des consignes ci-dessous.

Prompt maître minimal.

--- DONNÉES ---
Légende de la vidéo : (aucune)
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "Ce que personne ne te dit sur la confiance"
Slide 2 : "Tu n'as pas besoin d'être parfait"
Slide 3 : "(vide)"
Slide 4 : "Personne ne te regarde autant que tu crois"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 2, 3, 4. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en turc. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en turc).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en turc.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "sansCorrections:de": `LANGUE DE SORTIE : ALLEMAND.
Les variantes que tu écris doivent être en allemand, quelle que soit la langue
des consignes ci-dessous.

Prompt maître minimal.

--- DONNÉES ---
Légende de la vidéo : (aucune)
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "Ce que personne ne te dit sur la confiance"
Slide 2 : "Tu n'as pas besoin d'être parfait"
Slide 3 : "(vide)"
Slide 4 : "Personne ne te regarde autant que tu crois"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 2, 3, 4. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en allemand. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en allemand).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en allemand.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "court:fr": `LANGUE DE SORTIE : FRANÇAIS.
Les variantes que tu écris doivent être en français, quelle que soit la langue
des consignes ci-dessous.



--- DONNÉES ---
Légende de la vidéo : fun fact
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "Le saviez-vous ?"
Slide 2 : "les pieuvres ont trois cœurs 🐙"

Corrections passées à respecter :
- Au lieu de : "Sophia est top"
  Écris plutôt : "Sophia m'a appris ça"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 2. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en français. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en français).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en français.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "court:tr": `LANGUE DE SORTIE : TURC.
Les variantes que tu écris doivent être en turc, quelle que soit la langue
des consignes ci-dessous.



--- DONNÉES ---
Légende de la vidéo : fun fact
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "Le saviez-vous ?"
Slide 2 : "les pieuvres ont trois cœurs 🐙"

Corrections passées à respecter :
- Au lieu de : "Sophia est top"
  Écris plutôt : "Sophia m'a appris ça"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 2. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en turc. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en turc).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en turc.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
  "court:de": `LANGUE DE SORTIE : ALLEMAND.
Les variantes que tu écris doivent être en allemand, quelle que soit la langue
des consignes ci-dessous.



--- DONNÉES ---
Légende de la vidéo : fun fact
Slides du slideshow (slide 1 = couverture) :
Slide 1 : "Le saviez-vous ?"
Slide 2 : "les pieuvres ont trois cœurs 🐙"

Corrections passées à respecter :
- Au lieu de : "Sophia est top"
  Écris plutôt : "Sophia m'a appris ça"

--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Le placement de Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : 2. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides. Si elles s'adressent au lecteur à
  la 2e personne du singulier, la mention doit être INDIRECTE : pas d'impératif
  publicitaire du type « utilise / télécharge Sophia », mais une formule du type
  « une appli de micro-apprentissage comme Sophia », rendue en allemand. Si les
  slides sont à la 1re personne, une mention directe de Sophia est parfaitement
  acceptable (« j'utilise l'appli Sophia… », rendue en allemand).
- Le mot « Sophia » ne se traduit pas, mais TOUT ce qui l'entoure, si : le mot
  pour « appli » doit être celui de la langue de sortie (anglais « the Sophia
  app », allemand « die Sophia-App », italien « l'app Sophia », turc « Sophia
  uygulaması », espagnol « la app Sophia »…). N'écris JAMAIS la forme française
  « l'appli » dans une slide qui n'est pas en français.
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en allemand.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`,
};

/**
 * Remplace `fetch` le temps d'un appel : capture le texte envoyé à Gemini et
 * répond un JSON valide du premier coup (aucune reprise, aucune attente).
 */
async function promptEnvoye(appel: () => Promise<unknown>): Promise<string[]> {
  const vraiFetch = globalThis.fetch;
  const avaitCle = Deno.env.get("GEMINI_API_KEY");
  const captures: string[] = [];
  Deno.env.set("GEMINI_API_KEY", avaitCle ?? "cle-de-test");
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const corps = JSON.parse(String(init?.body));
    captures.push(corps.contents[0].parts[0].text);
    const reponse = '{"chosen_position": 99, "mode": "instructif", "variants": ["a"], "best": 0}';
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reponse }] } }] }), {
        status: 200,
      }),
    );
  }) as typeof fetch;
  try {
    await appel();
  } finally {
    globalThis.fetch = vraiFetch;
    if (avaitCle === undefined) Deno.env.delete("GEMINI_API_KEY");
  }
  return captures;
}

for (const [nom, deck] of Object.entries(DECKS_GOLDEN)) {
  for (const langue of LANGUES_GOLDEN) {
    for (const marque of ["sophia", undefined]) {
      Deno.test(`prompt Sophia inchangé : ${nom} × ${langue} × marque ${marque ?? "absente"}`, async () => {
        const captures = await promptEnvoye(() => integrateSophia({ ...deck, langue, marque }));
        assertEquals(captures.length, 1, "un seul appel : la réponse factice est valide");
        assertEquals(captures[0], INSTANTANES[`${nom}:${langue}`]);
      });
    }
  }
}
