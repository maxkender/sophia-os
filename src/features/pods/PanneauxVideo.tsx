// Le podz vidéo (réactions UGC) : personas des comptes et démos de l'appli par langue.
// Déplacé tel quel depuis la page Podz (20/11).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Replie } from "@/components/ui/replie";
import { drapeauLangue } from "@/features/moteur/langues";

import { deciderPersona, enregistrerDemo, listerDemos, listerPersonas } from "./api";
import { PastilleStatut } from "./Livraisons";

/** Personas synthétiques du pod vidéo : 1 compte = 1 persona, validé à la main. */
export function PanneauPersonas({ pod }: { pod: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "personas", pod], queryFn: () => listerPersonas(pod) });
  const decider = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => deciderPersona(id, ok),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods", "personas", pod] }),
  });
  const personas = data ?? [];
  const aValider = personas.filter((p) => p.statut === "a_valider");
  const valides = personas.filter((p) => p.statut === "valide");
  return (
    <Replie
      titre={t("pods.personas", { valides: valides.length, attente: aValider.length })}
      aide={t("pods.personasAide")}
      ouvert={aValider.length > 0}
    >
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[...aValider, ...valides].map((p) => (
          <div key={p.id} className="w-36 shrink-0 space-y-1 text-xs">
            <img src={p.image_url} alt="" loading="lazy" className="h-48 w-full rounded-md border object-cover" />
            <p className="font-medium">
              {drapeauLangue(p.compte?.langue ?? "")} {p.compte?.handle_tiktok ? `@${p.compte.handle_tiktok}` : p.compte?.persona_nom}
            </p>
            {p.statut === "a_valider" ? (
              <div className="flex gap-1">
                <Button size="sm" disabled={decider.isPending} onClick={() => decider.mutate({ id: p.id, ok: true })}>
                  {t("pods.valider")}
                </Button>
                <Button size="sm" variant="outline" disabled={decider.isPending} onClick={() => decider.mutate({ id: p.id, ok: false })}>
                  {t("pods.rejeter")}
                </Button>
              </div>
            ) : (
              <PastilleStatut statut="validee" />
            )}
          </div>
        ))}
      </div>
      {decider.error && <p className="text-sm text-destructive">{(decider.error as Error).message}</p>}
    </Replie>
  );
}

/** Démos Sophia par langue : la vidéo « utilisation » que le poster colle après la réaction. */
export function PanneauDemos() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["pods", "demos"], queryFn: listerDemos });
  const [langue, setLangue] = React.useState("");
  const [fichier, setFichier] = React.useState<File | null>(null);
  const envoyer = useMutation({
    mutationFn: () => enregistrerDemo(langue, fichier!),
    onSuccess: () => {
      setFichier(null);
      setLangue("");
      void qc.invalidateQueries({ queryKey: ["pods", "demos"] });
    },
  });
  return (
    <Replie titre={t("pods.demos", { n: data?.length ?? 0 })} aide={t("pods.demosAide")}>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="flex flex-wrap gap-3">
        {(data ?? []).map((d) => (
          <div key={d.id} className="w-28 space-y-1 text-xs">
            <video src={d.video_url} controls muted playsInline preload="metadata" className="h-48 w-full rounded-md border bg-black object-cover" />
            <p className="text-center font-medium">
              {drapeauLangue(d.langue)} {d.langue}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={langue}
          onChange={(e) => setLangue(e.target.value)}
          placeholder="fr"
          maxLength={2}
          className="h-9 w-16 rounded-md border bg-background px-2 text-sm"
          aria-label={t("pods.demoLangue")}
        />
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="max-w-full text-sm"
        />
        <Button size="sm" disabled={!fichier || langue.length !== 2 || envoyer.isPending} onClick={() => envoyer.mutate()}>
          {envoyer.isPending ? t("pods.demoEnvoi") : t("pods.demoEnvoyer")}
        </Button>
      </div>
      {envoyer.error && <p className="text-sm text-destructive">{(envoyer.error as Error).message}</p>}
    </Replie>
  );
}
