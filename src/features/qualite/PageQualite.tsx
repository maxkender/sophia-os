import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { aujourdhuiParis } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import { lireQc, lireSignalementsQc, MOTIFS_QC, type MotifQc, parLabel, type PostQc, preparerQc, signalerQc } from "./api";

const P = "qualite";

function Signaler({ post, jour }: { post: PostQc; jour: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = React.useState(false);
  const [motif, setMotif] = React.useState<MotifQc>("no_cta");
  const [note, setNote] = React.useState("");
  const envoyer = useMutation({
    mutationFn: () => signalerQc(post.id, motif, note),
    onSuccess: () => {
      setOuvert(false);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["qc", jour] });
      void qc.invalidateQueries({ queryKey: ["qc", "signalements"] });
    },
  });
  if (!ouvert) {
    return (
      <Button size="xs" variant="outline" onClick={() => setOuvert(true)}>
        {t(`${P}.signaler`)}
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border p-2" data-testid="form-signaler">
      <select
        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
        aria-label={t(`${P}.motif`)}
        value={motif}
        onChange={(e) => setMotif(e.target.value as MotifQc)}
      >
        {MOTIFS_QC.map((m) => (
          <option key={m} value={m}>
            {t(`${P}.motifs.${m}`)}
          </option>
        ))}
      </select>
      <textarea
        className="min-h-16 w-full rounded-md border bg-background p-2 text-xs"
        placeholder={t(`${P}.note`)}
        aria-label={t(`${P}.note`)}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="xs" loading={envoyer.isPending} onClick={() => envoyer.mutate()}>
          {t(`${P}.envoyer`)}
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setOuvert(false)}>
          {t(`${P}.annuler`)}
        </Button>
      </div>
      {envoyer.error && <p className="text-xs text-destructive">{(envoyer.error as Error).message}</p>}
    </div>
  );
}

function CartePost({ post, jour }: { post: PostQc; jour: string }) {
  const { t } = useTranslation();
  const en = post.textes_en;
  return (
    <Card className={post.signalements.length ? "border-l-4 border-l-destructive" : undefined} data-post-qc={post.id}>
      <CardContent className="space-y-2 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{(post.langue ?? "?").toUpperCase()}</Badge>
          {post.compte_handle && <span className="font-medium">@{post.compte_handle}</span>}
          {post.publie_url && (
            <a className="underline" href={post.publie_url} target="_blank" rel="noreferrer">
              {t(`${P}.ouvrir`)}
            </a>
          )}
          {!en && <span className="text-muted-foreground">{post.erreur ?? t(`${P}.pasTraduit`)}</span>}
        </div>
        <ol className="space-y-1">
          {post.textes_orig.map((s, i) => (
            <li key={i} className="rounded bg-muted/40 px-2 py-1">
              <span className="mr-1 text-xs text-muted-foreground">{i + 1}.</span>
              {s.appli && (
                <Badge variant="warning" className="mr-1">
                  {t(`${P}.slideAppli`)}
                </Badge>
              )}
              <span className="whitespace-pre-line">{en ? en[i] : s.texte}</span>
            </li>
          ))}
        </ol>
        {en && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t(`${P}.original`)}</summary>
            <ol className="mt-1 space-y-1">
              {post.textes_orig.map((s, i) => (
                <li key={i} className="whitespace-pre-line">
                  {i + 1}. {s.texte}
                </li>
              ))}
            </ol>
          </details>
        )}
        {post.signalements.map((s, i) => (
          <p key={i} className="text-xs text-destructive">
            {t(`${P}.signale`, { motif: t(`${P}.motifs.${s.motif}`), par: s.par ?? "?" })}
            {s.note ? ` — ${s.note}` : ""}
          </p>
        ))}
        <Signaler post={post} jour={jour} />
      </CardContent>
    </Card>
  );
}

function Signalements() {
  const { t } = useTranslation();
  const lu = useQuery({ queryKey: ["qc", "signalements"], queryFn: lireSignalementsQc });
  const liste = lu.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(`${P}.recents`, { n: liste.length })}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {lu.error && <p className="text-destructive">{(lu.error as Error).message}</p>}
        {liste.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t(`${P}.aucunSignalement`)}</p>
        ) : (
          <ul className="divide-y rounded-md border text-xs">
            {liste.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-2">
                <span className="text-muted-foreground">{s.jour}</span>
                <span className="font-medium">{s.label_nom ?? "—"}</span>
                <Badge variant="secondary">{(s.langue ?? "?").toUpperCase()}</Badge>
                {s.compte_handle && <span>@{s.compte_handle}</span>}
                <Badge variant="error">{t(`${P}.motifs.${s.motif}`)}</Badge>
                {s.note && <span>{s.note}</span>}
                {s.publie_url && (
                  <a className="underline" href={s.publie_url} target="_blank" rel="noreferrer">
                    {t(`${P}.ouvrir`)}
                  </a>
                )}
                <span className="text-muted-foreground">{s.par ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 31/10 — Tracking → Quality Control : 10 posts au hasard par label parmi
 * ceux publiés la veille, le texte des slides en anglais (pas d'images), et
 * « Report a problem on post » (pas de CTA, mauvaise traduction…).
 */
export function PageQualite() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [jour, setJour] = React.useState(() => ajouterJours(aujourdhuiParis(), -1));
  const lu = useQuery({ queryKey: ["qc", jour], queryFn: () => lireQc(jour) });
  const preparer = useMutation({
    mutationFn: async () => {
      // Tirage puis traduction, en plusieurs appels tant qu'il en reste et que ça avance.
      let r = await preparerQc(jour);
      for (let i = 0; i < 6 && r.restants > 0 && r.traduits > 0; i++) r = await preparerQc(jour);
      return r;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["qc", jour] }),
  });
  const posts = lu.data ?? [];
  const aTraduire = posts.filter((p) => !p.textes_en).length;
  // Une fois par jour affiché : si rien n'est tiré ou traduit, la page le lance.
  const lance = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!lu.isSuccess || lance.current === jour) return;
    if (posts.length === 0 || aTraduire > 0) {
      lance.current = jour;
      preparer.mutate();
    }
  }, [lu.isSuccess, jour, posts.length, aTraduire, preparer]);
  const groupes = parLabel(posts);
  const signales = posts.filter((p) => p.signalements.length > 0).length;
  return (
    <div className="space-y-4" data-testid="page-qualite">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{t(`${P}.titre`)}</h1>
        <p className="text-sm text-muted-foreground">{t(`${P}.sous`)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs">
          {t(`${P}.jour`)}
          <Input type="date" className="h-8 w-40" value={jour} onChange={(e) => e.target.value && setJour(e.target.value)} />
        </label>
        <span className="text-xs text-muted-foreground" data-testid="compteur-qc">
          {t(`${P}.compteur`, { posts: posts.length, labels: groupes.length, signales, aTraduire })}
        </span>
        <Button size="sm" variant="outline" loading={preparer.isPending} onClick={() => preparer.mutate()}>
          {t(`${P}.preparer`)}
        </Button>
        {preparer.error && <span className="text-xs text-destructive">{(preparer.error as Error).message}</span>}
        {preparer.data?.erreurs?.length ? <span className="text-xs text-destructive">{preparer.data.erreurs.join(" · ")}</span> : null}
      </div>
      {lu.error && <p className="text-sm text-destructive">{(lu.error as Error).message}</p>}
      {lu.isSuccess && posts.length === 0 && !preparer.isPending && <p className="text-sm text-muted-foreground">{t(`${P}.vide`)}</p>}
      {groupes.map(([label, liste]) => (
        <section key={label} className="space-y-2" data-label-qc={label}>
          <h2 className="font-medium">{t(`${P}.label`, { label, n: liste.length })}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {liste.map((p) => (
              <CartePost key={p.id} post={p} jour={jour} />
            ))}
          </div>
        </section>
      ))}
      <Signalements />
    </div>
  );
}
