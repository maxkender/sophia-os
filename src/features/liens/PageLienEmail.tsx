import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";

/**
 * 0696 (Max, 13/11) : les liens des emails aux posteurs (/r/done, /r/password, /r/stop) restent sur
 * sophia-marketing-orga.vercel.app. Jeton à usage unique (14 jours) ; la page appelle la fonction ruul en
 * JSON. Textes en anglais (posteurs).
 */
type Action = "done" | "password" | "stop";
type Etat =
  | { phase: "chargement" }
  | { phase: "confirmer" }
  | { phase: "fait"; login?: string; motDePasse?: string; dashboard?: string }
  | { phase: "erreur"; raison: string };

const URL_FONCTION = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ruul`;

const TEXTES: Record<Action, { titre: string; question: string; bouton: string; fait: string }> = {
  done: {
    titre: "Ruul account ready",
    question: "Confirm that your Ruul account is created, your ID is verified and your bank account is added.",
    bouton: "It's done",
    fait: "Thank you! Your Ruul account is ready. You'll be paid there every Monday.",
  },
  password: {
    titre: "Get a new password",
    question: "Your password will be replaced by a new one, shown on this page.",
    bouton: "Get a new password",
    fait: "Here is your new password. Keep it somewhere safe.",
  },
  stop: {
    titre: "Are you sure?",
    question: "If you confirm, your access is closed and you won't receive any more emails from us. If you posted this week, that week is still paid.",
    bouton: "Yes, stop",
    fait: "Your access is closed. You won't receive any more emails from us. Thank you for your time with Vik Studios.",
  },
};

const RAISONS: Record<string, string> = {
  utilise: "This link has already been used.",
  expire: "This link has expired. Click Help on your dashboard if you need anything.",
  introuvable: "This link is not valid.",
  erreur: "Something went wrong. Please try again later, or click Help on your dashboard.",
};

async function appelerLien(t: string, a: Action, confirme: boolean, f: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const r = await f(`${URL_FONCTION}?lien=${encodeURIComponent(t)}&a=${a}${confirme ? "&confirme=1" : ""}`);
  return (await r.json().catch(() => ({ ok: false, raison: "erreur" }))) as Record<string, unknown>;
}

export function PageLienEmail() {
  const { action } = useParams();
  const [params] = useSearchParams();
  const t = params.get("t") ?? "";
  const a = (["done", "password", "stop"].includes(action ?? "") ? action : null) as Action | null;
  const [etat, setEtat] = React.useState<Etat>({ phase: "chargement" });
  const [envoi, setEnvoi] = React.useState(false);

  React.useEffect(() => {
    if (!a || !t) {
      setEtat({ phase: "erreur", raison: "introuvable" });
      return;
    }
    void appelerLien(t, a, false).then((r) => setEtat(r.ok ? { phase: "confirmer" } : { phase: "erreur", raison: String(r.raison ?? "erreur") }));
  }, [a, t]);

  const confirmer = async () => {
    if (!a) return;
    setEnvoi(true);
    const r = await appelerLien(t, a, true);
    setEnvoi(false);
    setEtat(r.ok
      ? { phase: "fait", login: r.login as string | undefined, motDePasse: r.mot_de_passe as string | undefined, dashboard: r.dashboard as string | undefined }
      : { phase: "erreur", raison: String(r.raison ?? "erreur") });
  };

  const x = a ? TEXTES[a] : null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12" data-testid="page-lien-email">
      <div className="w-full max-w-md rounded-xl bg-white p-7 text-center shadow-sm">
        <p className="mb-4 text-lg font-bold">Vik Studios</p>
        {etat.phase === "chargement" && <p className="text-sm text-zinc-500">Loading…</p>}
        {etat.phase === "erreur" && <p className="text-sm text-zinc-600">{RAISONS[etat.raison] ?? RAISONS.erreur}</p>}
        {etat.phase === "confirmer" && x && (
          <>
            <h1 className="mb-3 text-xl font-semibold">{x.titre}</h1>
            <p className="mb-6 text-sm leading-relaxed text-zinc-600">{x.question}</p>
            <button type="button" disabled={envoi} onClick={() => void confirmer()}
              className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {x.bouton}
            </button>
          </>
        )}
        {etat.phase === "fait" && x && (
          <>
            <h1 className="mb-3 text-xl font-semibold">{a === "stop" ? "Done" : x.titre}</h1>
            <p className="text-sm leading-relaxed text-zinc-600">{x.fait}</p>
            {etat.motDePasse && (
              <div className="mt-5 space-y-1 rounded-lg bg-zinc-50 p-4 text-left text-sm" data-testid="nouveau-mot-de-passe">
                <p>Dashboard: <a className="font-semibold underline" href={etat.dashboard}>{etat.dashboard}</a></p>
                <p>Login: <b>{etat.login}</b></p>
                <p>Password: <b>{etat.motDePasse}</b></p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
