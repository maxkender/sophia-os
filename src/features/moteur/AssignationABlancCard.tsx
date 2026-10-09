import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { demainParis, lancerAssignationABlanc, listerComptes } from "./api";
import {
  iaBloqueeParLaNuit,
  motifBlocageCle,
  motifNuitCle,
  operationCle,
  origineDeckCle,
  type AssignationABlancLog,
  type AssignationABlancResultat,
  type CreneauABlanc,
} from "./assignationABlanc";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Assignation test À BLANC pour UN créateur : le vrai code de minuit, rien
 * d'écrit nulle part (fonction `assignation-a-blanc`). Aucun cache à
 * invalider ensuite — rien n'a changé en base. Les ids de passage / post du
 * résultat sont fictifs : aucun lien n'est proposé.
 */
export function AssignationABlancCard() {
  const { t } = useTranslation();
  const comptes = useQuery({ queryKey: ["comptes"], queryFn: listerComptes });
  const [date, setDate] = React.useState(demainParis());
  const [compteId, setCompteId] = React.useState("");
  const [ia, setIa] = React.useState(false);
  const [logs, setLogs] = React.useState<AssignationABlancLog[]>([]);
  const logsRef = React.useRef<HTMLDivElement>(null);
  const nuit = iaBloqueeParLaNuit();

  React.useEffect(() => {
    if (!logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs.length]);

  const tester = useMutation({
    mutationFn: () => {
      setLogs([]);
      return lancerAssignationABlanc(date, compteId, ia && !nuit, (ligne) => {
        setLogs((prev) => [...prev, ligne]);
      });
    },
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          {t("aBlanc.title")}
        </CardTitle>
        <CardDescription>{t("aBlanc.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>{t("aBlanc.garantie")}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="aBlancDate">{t("aBlanc.date")}</Label>
            <div className="flex gap-2">
              <Input id="aBlancDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setDate(demainParis())}>
                {t("aBlanc.demain")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="aBlancCompte">{t("aBlanc.compte")}</Label>
            <select
              id="aBlancCompte"
              className={selectClass}
              value={compteId}
              onChange={(e) => setCompteId(e.target.value)}
            >
              <option value="">{t("common.none")}</option>
              {(comptes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.persona_nom ?? c.handle_tiktok ?? c.id.slice(0, 8)}
                  {c.langue ? ` · ${c.langue}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={ia && !nuit}
            disabled={nuit || tester.isPending}
            onCheckedChange={(valeur) => setIa(Boolean(valeur))}
          />
          <span>
            {t("aBlanc.ia")}
            <span className="block text-xs text-muted-foreground">
              {nuit ? t("aBlanc.iaNuit") : t("aBlanc.iaAide")}
            </span>
          </span>
        </label>

        <Button type="button" disabled={!compteId || !date || tester.isPending} onClick={() => tester.mutate()}>
          {tester.isPending ? t("aBlanc.enCours") : t("aBlanc.lancer")}
        </Button>

        {(tester.isPending || logs.length > 0) && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("aBlanc.logs")}
              {tester.isPending ? ` — ${t("aBlanc.enCours")}` : ""}
            </p>
            <div
              ref={logsRef}
              className="max-h-56 overflow-y-auto rounded-md border bg-muted/20 p-2 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 && tester.isPending && (
                <p className="text-muted-foreground">{t("aBlanc.logsAttente")}</p>
              )}
              {logs.map((l, i) => (
                <p
                  key={`${l.at}-${i}`}
                  className={cn(
                    l.etape === "a_blanc" && "italic text-muted-foreground",
                    l.statut === "echec" && "text-destructive",
                    l.statut === "ok" && "text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  <span className="text-muted-foreground">{new Date(l.at).toLocaleTimeString()}</span>{" "}
                  {l.detail}
                </p>
              ))}
            </div>
          </div>
        )}

        {tester.isError && <p className="text-sm text-destructive">{(tester.error as Error).message}</p>}
        {tester.isSuccess && <ResultatABlanc r={tester.data} />}
      </CardContent>
    </Card>
  );
}

function ResultatABlanc({ r }: { r: AssignationABlancResultat }) {
  const { t } = useTranslation();
  const crees = r.resultat.crees;
  return (
    <div className="space-y-4" data-testid="resultat-a-blanc">
      {r.erreurRun && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t("aBlanc.erreurRun", { erreur: r.erreurRun })}
        </p>
      )}
      <div
        className={cn(
          "space-y-1 rounded-md p-3 text-sm",
          crees > 0 ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
        )}
      >
        <p className="font-medium">
          {crees > 0 ? t("aBlanc.creneaux", { n: crees }) : (r.resultat.erreur ?? r.resultat.raison ?? t("aBlanc.aucun"))}
        </p>
        {crees > 0 && r.resultat.raison && <p className="text-xs">{r.resultat.raison}</p>}
        {r.resultat.quotaBaisse && (
          <p className="text-xs font-medium">
            {t("aBlanc.quotaBaisse", { avant: r.resultat.quotaBaisse.avant, apres: r.resultat.quotaBaisse.apres })}
          </p>
        )}
        {r.resultat.nonServable && <p className="text-xs">{t("aBlanc.nonServable")}</p>}
      </div>

      {r.laNuit.motifs.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning/40 p-3 text-sm">
          <p>
            {t("aBlanc.nuit", { motifs: r.laNuit.motifs.map((m) => t(motifNuitCle(m))).join(", ") })}
          </p>
          {r.laNuit.postsDuJour !== undefined && r.laNuit.quota !== undefined && (
            <p className="text-xs text-muted-foreground">
              {t("aBlanc.nuitQuota", { posts: r.laNuit.postsDuJour, quota: r.laNuit.quota })}
            </p>
          )}
          {r.compte?.actif && <p className="text-xs text-muted-foreground">{t("aBlanc.nuitSimule")}</p>}
        </div>
      )}

      {r.creneaux.map((c) => (
        <FicheCreneau key={c.passageId} c={c} />
      ))}

      {r.decksEcartes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("aBlanc.ecartes")}</p>
          <ul className="space-y-1 text-xs">
            {r.decksEcartes.map((d, i) => (
              <li key={`${d.contenuId}-${i}`} className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono">{d.contenuId.slice(0, 8)}</span>
                <span>· {d.application} · {d.langue}</span>
                <Badge variant="outline">{t(origineDeckCle(d.origine))}</Badge>
                {d.raison && <span className="text-muted-foreground">{d.raison}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("aBlanc.ecritures")}</p>
        {r.ecrituresEvitees.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("aBlanc.ecrituresVide")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("aBlanc.colTable")}</th>
                  <th className="py-1 pr-3 font-medium">{t("aBlanc.colOperation")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("aBlanc.colRequetes")}</th>
                  <th className="py-1 text-right font-medium">{t("aBlanc.colLignes")}</th>
                </tr>
              </thead>
              <tbody>
                {r.ecrituresEvitees.map((e) => (
                  <tr key={`${e.table}-${e.operation}`} className="border-t">
                    <td className="py-1 pr-3 font-mono">{e.table}</td>
                    <td className="py-1 pr-3">{t(operationCle(e.operation))}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{e.requetes}</td>
                    <td className="py-1 text-right tabular-nums">{e.lignes ?? "?"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("aBlanc.appels")}</p>
        {r.appelsBloques.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("aBlanc.appelsVide")}</p>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {r.appelsBloques.map((b) => (
              <li key={`${b.hote}-${b.motif}`}>
                <span className="font-mono">{b.hote}</span> · {t(motifBlocageCle(b.motif))} ×{b.nombre}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {t("aBlanc.iaCompteur", { autorises: r.appelsIA.autorises, bloques: r.appelsIA.bloques })} ·{" "}
          {t("aBlanc.lectures", { n: r.lectures })} · {t("aBlanc.duree", { s: Math.round(r.dureeMs / 100) / 10 })}
        </p>
      </div>

      <details className="rounded-md border p-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">{t("aBlanc.limites")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {r.limites.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-muted-foreground">{t("aBlanc.aleatoire")}</p>
    </div>
  );
}

function FicheCreneau({ c }: { c: CreneauABlanc }) {
  const { t } = useTranslation();
  const nomApp = c.application.nom ?? c.application.slug ?? c.application.id.slice(0, 8);
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="creneau-a-blanc">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {t("aBlanc.creneau", { rang: c.rang })} · {nomApp}
        </span>
        <Badge variant={c.deck.origine === "a_fabriquer" ? "warning" : "secondary"}>
          {t(origineDeckCle(c.deck.origine))}
        </Badge>
        <Badge variant="outline">{c.langue}</Badge>
      </div>
      {c.visee && (
        <p className="text-xs text-warning">
          {t("aBlanc.repli", { visee: c.visee.nom ?? c.visee.slug ?? c.visee.id.slice(0, 8), motif: c.visee.motif ?? "?" })}
        </p>
      )}
      <p className="text-xs">
        <span className="font-medium">{c.contenu.titre ?? "—"}</span>{" "}
        <span className="font-mono text-muted-foreground">{c.contenu.id.slice(0, 8)}</span>
        {c.contenu.tier && <> · {t("aBlanc.tier", { tier: c.contenu.tier })}</>}
        {c.contenu.tierCycle !== null && <> · {t("aBlanc.cycle", { cycle: c.contenu.tierCycle })}</>}
        {c.contenu.repeche && (
          <Badge variant="info" className="ml-1.5">
            {t("aBlanc.repeche")}
          </Badge>
        )}
      </p>
      {c.deck.besoin && <p className="text-xs text-warning">{t("aBlanc.besoin", { besoin: c.deck.besoin })}</p>}
      <ol className="space-y-1">
        {c.slides.map((s) => (
          <li key={s.position} className="flex items-start gap-2 text-xs">
            {s.mediaUrl ? (
              <img src={s.mediaUrl} alt="" loading="lazy" className="size-10 shrink-0 rounded object-cover" />
            ) : (
              <span className="size-10 shrink-0 rounded bg-muted" />
            )}
            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{s.position}.</span>
            <span className={cn("whitespace-pre-line", s.pub && "font-medium")}>
              {s.texte || "—"}
              {s.position === c.slidePub && (
                <Badge variant="default" className="ml-1.5">
                  {t("aBlanc.pub")}
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs">
        <span className="text-muted-foreground">{t("aBlanc.hashtags")} :</span> {c.hashtags || "—"}
        {c.deck.hashtagsStatiques && (
          <span className="ml-1 text-muted-foreground">({t("aBlanc.hashtagsStatiques")})</span>
        )}
      </p>
      {c.musique && (
        <p className="text-xs">
          <span className="text-muted-foreground">{t("aBlanc.musique")} :</span>{" "}
          {c.musique.titre ?? c.musique.url ?? "—"}
          {c.musique.plateforme ? ` · ${c.musique.plateforme}` : ""}
        </p>
      )}
      {c.faceSwap && <p className="text-xs text-warning">{t("aBlanc.faceSwap", { n: c.faceSwap.appelsBloques })}</p>}
      {c.deck.fabrication && c.deck.fabrication.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t("aBlanc.fabrication")}</summary>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {c.deck.fabrication.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
