/**
 * ruul-webhook, la logique sans réseau ni base (testable) : signature, environnement, événement.
 * Ruul signe `<t>.<corps brut>` avec le secret du webhook (whsec_…) de chaque environnement ; on essaie la prod
 * puis la sandbox, et l'événement est noté dans l'environnement dont le secret a signé.
 */
import { signatureRuulValide, type EnvRuul } from "../_shared/ruul_api.ts";

export type Recevoir = (id: string, env: EnvRuul, type: string, corps: Record<string, unknown>) => Promise<unknown>;

export async function traiter(
  brut: string,
  entetes: Headers,
  secrets: Partial<Record<EnvRuul, string | null>>,
  recevoir: Recevoir,
  maintenantS = Date.now() / 1000,
): Promise<{ status: number; corps: Record<string, unknown> }> {
  const signature = entetes.get("Ruul-Signature");
  let env: EnvRuul | null = null;
  for (const e of ["prod", "sandbox"] as const) {
    const s = secrets[e];
    if (s && await signatureRuulValide(brut, signature, s, maintenantS)) {
      env = e;
      break;
    }
  }
  // Pas encore de secret : 503, Ruul réessaiera (5 fois, une heure d'écart).
  if (!env) {
    if (!secrets.prod && !secrets.sandbox) return { status: 503, corps: { error: "webhook secret not configured" } };
    return { status: 401, corps: { error: "invalid signature" } };
  }
  let evt: Record<string, unknown>;
  try {
    evt = JSON.parse(brut);
  } catch {
    return { status: 400, corps: { error: "invalid json" } };
  }
  const id = String(evt.id ?? entetes.get("Ruul-Event-Id") ?? "");
  const type = String(evt.type ?? entetes.get("Ruul-Event-Type") ?? "");
  if (!id || !type) return { status: 400, corps: { error: "missing id or type" } };
  const resultat = await recevoir(id, env, type, evt);
  return { status: 200, corps: { ok: true, resultat } };
}
