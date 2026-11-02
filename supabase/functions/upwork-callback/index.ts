/**
 * upwork-callback — l'URL de retour déclarée dans la clé Upwork (Callback URL).
 *
 * Ne parle jamais à Upwork : elle renvoie la requête telle quelle (code,
 * state, error) vers la fonction `upwork`, par qui passent tous les appels à
 * l'API (prompt 14). Elle existe pour ne pas changer l'URL déclarée dans la
 * clé, ce qui relancerait la revue d'Upwork.
 */
Deno.serve((request) => {
  const entree = new URL(request.url);
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  if (!base) return new Response("SUPABASE_URL absent", { status: 500 });
  const sortie = new URL(`${base}/functions/v1/upwork`);
  for (const cle of ["code", "state", "error", "error_description"]) {
    const valeur = entree.searchParams.get(cle);
    if (valeur !== null) sortie.searchParams.set(cle, valeur);
  }
  return new Response(null, { status: 302, headers: { location: sortie.toString() } });
});
