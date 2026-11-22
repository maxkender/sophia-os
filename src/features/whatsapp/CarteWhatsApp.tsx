import { useQuery } from "@tanstack/react-query";

import { IconeWhatsApp } from "@/features/support/IconeWhatsApp";

import { lireStatsWhatsApp, pourcent } from "./api";

const usd = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/**
 * 0839 : la petite carte WhatsApp des pages Ruul et Recruits (admin) : posteurs actifs avec numéro + accord, messages
 * de la semaine (envoyés, livrés, lus, avec réponse dans les 48 h) et coût estimé de la semaine.
 */
export function CarteWhatsApp() {
  const q = useQuery({ queryKey: ["whatsapp-stats"], queryFn: lireStatsWhatsApp, staleTime: 60_000 });
  const s = q.data;
  return (
    <section className="rounded-xl border bg-card p-3 text-sm" data-testid="carte-whatsapp">
      <h2 className="flex items-center gap-1.5 font-semibold">
        <IconeWhatsApp className="size-4" /> WhatsApp
        {s?.mode && s.mode !== "live" && <span className="rounded bg-amber-500/15 px-1.5 text-[11px] font-normal text-amber-800 dark:text-amber-200">mode {s.mode}</span>}
      </h2>
      {q.error && <p className="text-destructive text-xs">{(q.error as Error).message}</p>}
      {!s && !q.error && <p className="text-muted-foreground text-xs">Chargement…</p>}
      {s && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">Numéro + accord</dt>
            <dd data-testid="wa-accord"><b>{pourcent(s.avec_accord, s.posteurs)} %</b> <span className="text-muted-foreground text-xs">({s.avec_accord}/{s.posteurs})</span></dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Envoyés · livrés · lus</dt>
            <dd data-testid="wa-envois">{s.envoyes} · {s.livres} · {s.lus}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Avec réponse (48 h)</dt>
            <dd data-testid="wa-reponses">{s.avec_reponse}{s.envoyes > 0 && <span className="text-muted-foreground text-xs"> ({pourcent(s.avec_reponse, s.envoyes)} %)</span>}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Coût estimé (semaine)</dt>
            <dd data-testid="wa-cout">{usd(Number(s.cout_estime ?? 0))}</dd>
          </div>
          {(s.echecs > 0 || s.bloques > 0) && (
            <p className="col-span-full text-muted-foreground text-xs">{s.echecs} échec(s), {s.bloques} bloqué(s) (mode test ou garde-fous) depuis le {s.depuis}.</p>
          )}
        </dl>
      )}
    </section>
  );
}
