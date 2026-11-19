/**
 * Base64 → octets, vite.
 *
 * `Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))` parcourt la chaîne par son itérateur et appelle une fonction
 * par caractère : sur le PNG de 4 Mo que rend Fal, c'est environ 300 ms de calcul, contre 10 ms pour la boucle
 * ci-dessous (mêmes octets). Le nettoyage d'une slide faisait cette conversion quatre fois ; avec le reste, il
 * mangeait presque les 2 s de calcul qu'un worker Edge a pour TOUTES les requêtes qu'il sert. Le 19/11, pendant
 * l'import de @mondorunning, un nettoyage sur deux mourait ainsi (« CPU Time exceeded », réponse 546), et chaque
 * mort laissait son slideshow verrouillé 8 minutes.
 */
export function octetsDepuisBase64(base64: string): Uint8Array {
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}
