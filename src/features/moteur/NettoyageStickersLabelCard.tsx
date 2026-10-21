import * as React from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, LifeBuoy, ScanSearch, Square, Sticker, Trash2, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  actionNettoyageStickers,
  compteursNettoyageStickers,
  dernierNettoyageStickers,
  journalNettoyageStickers,
  lancerNettoyageStickers,
  listerLabels,
  repecherSlideshowStickers,
  slideshowsNettoyageStickers,
} from "./api";
import {
  avancement,
  formatDuree,
  tempsRestant,
  tonLigne,
  tourne,
  type LigneJournalNettoyage,
  type NettoyageStickers,
  type SlideshowNettoyage,
  type StatutSlideshowNettoyage,
} from "./nettoyageStickers";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Lignes gardées à l'écran (les plus anciennes partent au-delà ; la base garde tout). */
const JOURNAL_MAX = 5000;
/** Relecture de l'avancement tant que le serveur travaille. */
const RAFRAICHISSEMENT_MS = 3000;

const RANG_LISTE: Record<string, number> = { pub: 0, retrait: 1, repeche: 2, retire: 3, garde: 4 };

const CLE = "nettoyageStickers";

/**
 * Nettoyage stickers d'un label, mené par le serveur : le bouton lance la
 * tâche, la carte relit l'avancement, la liste et le journal en base. La page
 * peut être fermée ; en revenant, on retrouve le dernier nettoyage du label.
 */
export function NettoyageStickersLabelCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const labels = useQuery({ queryKey: ["labels"], queryFn: () => listerLabels(), staleTime: 60_000 });
  const [labelId, setLabelId] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [envoi, setEnvoi] = React.useState(false);
  const [occupes, setOccupes] = React.useState<ReadonlySet<string>>(new Set());
  const [maintenant, setMaintenant] = React.useState(() => Date.now());

  // En arrivant : le label du dernier nettoyage, pour retrouver celui qui tourne.
  const dernier = useQuery({
    queryKey: [CLE, "dernier"],
    queryFn: () => dernierNettoyageStickers(),
    staleTime: Infinity,
  });
  React.useEffect(() => {
    if (!labelId && dernier.data?.label_id) setLabelId(dernier.data.label_id);
  }, [labelId, dernier.data]);

  const tache = useQuery({
    queryKey: [CLE, "tache", labelId],
    queryFn: () => dernierNettoyageStickers(labelId),
    enabled: !!labelId,
    refetchInterval: (q) => (tourne(q.state.data?.statut) ? RAFRAICHISSEMENT_MS : false),
  });
  const nettoyage = tache.data ?? null;
  const id = nettoyage?.id ?? null;
  const enMarche = tourne(nettoyage?.statut);

  const compteurs = useQuery({
    queryKey: [CLE, "compteurs", id],
    queryFn: () => compteursNettoyageStickers(id!),
    enabled: !!id,
    refetchInterval: enMarche ? RAFRAICHISSEMENT_MS : false,
  });
  const av = avancement(compteurs.data);

  // La liste se relit quand un compteur qui la concerne bouge.
  const empreinte = `${av.pubs}-${av.repeches}-${av.retires}-${av.gardes}`;
  const liste = useQuery({
    queryKey: [CLE, "liste", id, empreinte],
    queryFn: () => slideshowsNettoyageStickers(id!),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

  const journal = useJournal(id, enMarche);

  React.useEffect(() => {
    if (!enMarche) return;
    const iv = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [enMarche]);

  const rafraichir = async () => {
    await qc.invalidateQueries({ queryKey: [CLE] });
    await journal.lire();
  };

  const executer = async (fn: () => Promise<unknown>) => {
    setErreur(null);
    setEnvoi(true);
    try {
      await fn();
      await rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  const label = (labels.data ?? []).find((l) => l.id === labelId) ?? null;

  const lancer = () => void executer(() => lancerNettoyageStickers(labelId));
  const toutJeter = () => {
    if (!id) return;
    if (!window.confirm(t("nettoyageStickers.confirmer", { n: av.pubs, label: nettoyage?.label_nom ?? "" }))) return;
    void executer(() => actionNettoyageStickers("confirmer", id));
  };
  const arreter = () => {
    if (!id || !window.confirm(t("nettoyageStickers.confirmerArret"))) return;
    void executer(() => actionNettoyageStickers("annuler", id));
  };
  const basculer = async (s: SlideshowNettoyage, action: "repecher" | "rejeter") => {
    if (!id) return;
    setErreur(null);
    setOccupes((o) => new Set(o).add(s.contenu_id));
    try {
      await repecherSlideshowStickers(action, id, s.contenu_id);
      await rafraichir();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupes((o) => {
        const n = new Set(o);
        n.delete(s.contenu_id);
        return n;
      });
    }
  };

  const depuis = nettoyage
    ? new Date(
        nettoyage.statut === "retrait" && nettoyage.retrait_lance_at ? nettoyage.retrait_lance_at : nettoyage.created_at,
      ).getTime()
    : 0;
  const ecoule = enMarche ? Math.max(0, maintenant - depuis) : 0;
  const reste =
    nettoyage?.statut === "scan"
      ? tempsRestant(av.analyses, av.total, ecoule)
      : nettoyage?.statut === "retrait" && av.posts.total > 0
        ? tempsRestant(av.posts.faits, av.posts.total, ecoule)
        : null;

  const slideshows = [...(liste.data ?? [])].sort((a, b) => (RANG_LISTE[a.statut] ?? 9) - (RANG_LISTE[b.statut] ?? 9));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sticker className="size-4 text-primary" />
          {t("nettoyageStickers.titre")}
        </CardTitle>
        <CardDescription>{t("nettoyageStickers.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1">
            <Label htmlFor="nettoyageLabel">{t("nettoyageStickers.label")}</Label>
            <select
              id="nettoyageLabel"
              className={selectClass}
              value={labelId}
              onChange={(e) => {
                setLabelId(e.target.value);
                setErreur(null);
              }}
            >
              <option value="">{t("nettoyageStickers.choisirLabel")}</option>
              {(labels.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={lancer} disabled={!labelId || envoi || enMarche}>
            <ScanSearch className="size-4" />
            {nettoyage ? t("nettoyageStickers.relancer") : t("nettoyageStickers.analyser")}
          </Button>
          {nettoyage?.statut === "scan" && (
            <Button variant="outline" onClick={arreter} disabled={envoi}>
              <Square className="size-4" />
              {t("nettoyageStickers.arreter")}
            </Button>
          )}
        </div>

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}

        {labelId && tache.isSuccess && !nettoyage && (
          <p className="text-sm text-muted-foreground">{t("nettoyageStickers.aucun")}</p>
        )}

        {nettoyage && (
          <Avancement
            nettoyage={nettoyage}
            av={av}
            labelNom={label?.nom ?? nettoyage.label_nom}
            ecoule={ecoule}
            reste={reste}
          />
        )}

        {nettoyage?.statut === "a_confirmer" && av.pubs > 0 && (
          <Button variant="destructive" onClick={toutJeter} disabled={envoi}>
            <Trash2 className="size-4" />
            {t("nettoyageStickers.toutJeter", { n: av.pubs })}
          </Button>
        )}

        {journal.lignes.length > 0 && <Journal lignes={journal.lignes} />}

        {slideshows.length > 0 && nettoyage && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("nettoyageStickers.liste", { n: slideshows.length })}</p>
            {slideshows.map((s) => (
              <LigneSlideshow
                key={s.contenu_id}
                slideshow={s}
                nettoyage={nettoyage}
                occupe={occupes.has(s.contenu_id)}
                onBasculer={(action) => void basculer(s, action)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Journal du nettoyage : lu par morceaux (id croissant), relu toutes les 3 s tant que ça tourne. */
function useJournal(id: string | null, enMarche: boolean) {
  const [lignes, setLignes] = React.useState<LigneJournalNettoyage[]>([]);
  const dernierId = React.useRef(0);
  const enLecture = React.useRef(false);
  const courant = React.useRef(id);

  const lire = React.useCallback(async () => {
    const cible = courant.current;
    if (!cible || enLecture.current) return;
    enLecture.current = true;
    try {
      for (;;) {
        const morceau = await journalNettoyageStickers(cible, dernierId.current);
        if (courant.current !== cible || morceau.length === 0) return;
        dernierId.current = morceau[morceau.length - 1].id;
        setLignes((l) => [...l, ...morceau].slice(-JOURNAL_MAX));
        if (morceau.length < 1000) return;
      }
    } finally {
      enLecture.current = false;
    }
  }, []);

  React.useEffect(() => {
    courant.current = id;
    dernierId.current = 0;
    setLignes([]);
  }, [id]);

  React.useEffect(() => {
    if (!id) return;
    void lire().catch(() => undefined);
    if (!enMarche) return;
    const iv = window.setInterval(() => void lire().catch(() => undefined), RAFRAICHISSEMENT_MS);
    return () => window.clearInterval(iv);
  }, [id, enMarche, lire]);

  return { lignes, lire };
}

function Avancement({
  nettoyage,
  av,
  labelNom,
  ecoule,
  reste,
}: {
  nettoyage: NettoyageStickers;
  av: ReturnType<typeof avancement>;
  labelNom: string;
  ecoule: number;
  reste: number | null;
}) {
  const { t } = useTranslation();
  const enMarche = tourne(nettoyage.statut);
  const varianteStatut =
    nettoyage.statut === "a_confirmer"
      ? "warning"
      : nettoyage.statut === "termine"
        ? "success"
        : nettoyage.statut === "annule"
          ? "secondary"
          : "info";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={varianteStatut}>{t(`nettoyageStickers.statuts.${nettoyage.statut}`)}</Badge>
        <span className="font-medium">{labelNom}</span>
        <span className="text-xs text-muted-foreground">
          {t("nettoyageStickers.lance", { date: new Date(nettoyage.created_at).toLocaleString("fr-FR") })}
        </span>
      </div>
      {enMarche && <p className="text-xs text-muted-foreground">{t("nettoyageStickers.serveur")}</p>}
      <Progress value={av.total ? (av.analyses / av.total) * 100 : 100} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">
          {t("nettoyageStickers.analyses", { n: av.analyses, total: av.total, valides: nettoyage.total })}
        </Badge>
        {av.pubs > 0 && <Badge variant="error">{t("nettoyageStickers.aJeter", { n: av.pubs })}</Badge>}
        {av.retires > 0 && <Badge variant="error">{t("nettoyageStickers.jetes", { n: av.retires })}</Badge>}
        {av.repeches > 0 && <Badge variant="info">{t("nettoyageStickers.repeches", { n: av.repeches })}</Badge>}
        {av.gardes > 0 && <Badge variant="secondary">{t("nettoyageStickers.laisses", { n: av.gardes })}</Badge>}
        <Badge variant="success">{t("nettoyageStickers.proteges", { n: nettoyage.proteges })}</Badge>
        <Badge variant="secondary">{t("nettoyageStickers.pods", { n: nettoyage.pods })}</Badge>
        {nettoyage.sans_images > 0 && (
          <Badge variant="secondary">{t("nettoyageStickers.sansImages", { n: nettoyage.sans_images })}</Badge>
        )}
        {av.erreurs > 0 && <Badge variant="warning">{t("nettoyageStickers.erreurs", { n: av.erreurs })}</Badge>}
      </div>
      {av.posts.total > 0 && (
        <div className="space-y-1">
          <Progress value={(av.posts.faits / av.posts.total) * 100} />
          <p className="text-xs text-muted-foreground">
            {t("nettoyageStickers.remplacements", {
              n: av.posts.faits,
              total: av.posts.total,
              remplaces: av.posts.remplaces,
              sans: av.posts.sansRemplacant,
            })}
          </p>
        </div>
      )}
      {enMarche && (
        <p className="text-xs tabular-nums text-muted-foreground">
          {t("nettoyageStickers.chrono", { ecoule: formatDuree(ecoule) })}
          {reste !== null && ` · ${t("nettoyageStickers.reste", { reste: formatDuree(reste) })}`}
        </p>
      )}
    </div>
  );
}

function Journal({ lignes }: { lignes: LigneJournalNettoyage[] }) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lignes]);
  const texte = (l: LigneJournalNettoyage) =>
    `${new Date(l.at).toLocaleTimeString("fr-FR", { hour12: false })}  ${l.ligne}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("nettoyageStickers.journal", { n: lignes.length })}</p>
        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(lignes.map(texte).join("\n"))}>
          <Copy className="size-3.5" />
          {t("nettoyageStickers.copierJournal")}
        </Button>
      </div>
      <div
        ref={ref}
        className="max-h-64 space-y-0.5 overflow-y-auto rounded border bg-muted/30 px-2.5 py-2 font-mono text-[11px] leading-relaxed"
      >
        {lignes.map((l) => {
          const ton = tonLigne(l.ligne);
          return (
            <div
              key={l.id}
              className={cn(
                "break-words",
                ton === "alerte" ? "text-destructive" : ton === "action" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {texte(l)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VARIANTE_LIGNE: Record<string, "error" | "info" | "secondary" | "outline"> = {
  pub: "error",
  retrait: "outline",
  retire: "error",
  repeche: "info",
  garde: "secondary",
};

function LigneSlideshow({
  slideshow,
  nettoyage,
  occupe,
  onBasculer,
}: {
  slideshow: SlideshowNettoyage;
  nettoyage: NettoyageStickers;
  occupe: boolean;
  onBasculer: (action: "repecher" | "rejeter") => void;
}) {
  const { t } = useTranslation();
  const s = slideshow;
  const jetable = s.statut === "pub" || s.statut === "retrait" || s.statut === "retire";
  const peutRepecher = s.statut === "pub" || s.statut === "retire";
  const peutRemettre = s.statut === "repeche" && !s.avant && nettoyage.statut === "a_confirmer";
  return (
    <div className={cn("space-y-2 rounded-lg border p-3", jetable ? "border-destructive/40" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={VARIANTE_LIGNE[s.statut] ?? "outline"} className="text-[10px]">
          {t(`nettoyageStickers.statutLigne.${s.statut as StatutSlideshowNettoyage}`, { defaultValue: s.statut })}
        </Badge>
        <Link className="min-w-0 truncate font-medium hover:underline" to={`/admin/slideshows?id=${s.contenu_id}`}>
          {s.titre?.slice(0, 80) || s.contenu_id.slice(0, 8)}
        </Link>
        {s.tier && (
          <Badge variant="outline" className="text-[10px]">
            {s.tier}
          </Badge>
        )}
        {s.contenu_cree_at && <span className="text-xs text-muted-foreground">{s.contenu_cree_at.slice(0, 10)}</span>}
        {s.raison && <span className="text-xs text-muted-foreground">· {s.raison}</span>}
        <span className="ml-auto flex gap-2">
          {peutRepecher && (
            <Button size="sm" variant="outline" disabled={occupe} onClick={() => onBasculer("repecher")}>
              <LifeBuoy className="size-3.5" />
              {t("nettoyageStickers.repecher")}
            </Button>
          )}
          {peutRemettre && (
            <Button size="sm" variant="ghost" disabled={occupe} onClick={() => onBasculer("rejeter")}>
              <Undo2 className="size-3.5" />
              {t("nettoyageStickers.remettre")}
            </Button>
          )}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(s.slides ?? []).map((slide) => {
          const pub = slide.sticker === "pub";
          return (
            <a
              key={slide.position}
              href={slide.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "relative block shrink-0 overflow-hidden rounded-md border-2",
                pub ? "border-destructive" : "border-transparent",
              )}
            >
              <img src={slide.url} alt="" loading="lazy" className="h-28 w-16 object-cover" />
              {pub && (
                <span className="absolute inset-x-0 bottom-0 bg-destructive py-0.5 text-center text-[9px] font-semibold text-white">
                  PUB
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
