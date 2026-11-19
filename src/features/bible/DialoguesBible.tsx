/**
 * 19/11 (Max) : les deux fenêtres de la Bible. « Changer de label » (labels existants et proposés, ou + nouveau label :
 * nom, app, description de la DA → proposition à valider) et « + Ajouter des comptes » (plusieurs liens d'un coup,
 * une app, un label → À importer, puis les 3 derniers TikToks, les miniatures et les stats).
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { resoudreLiens } from "./api";
import {
  ajouterComptes, type CarteLabel, type CompteBible, creerCarte, handlesDuTexte, LIBELLE_BADGE, nomCarte, rafraichirMiniatures, REMARQUE_UGC, type Section, SECTIONS,
} from "./moodboard";
import { nomLabelValide } from "./parse";

const CHAMP = "h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900";
const NOUVEAU = "__nouveau__";

/** Le choix d'une carte, groupé par app, avec « + nouveau label ». */
function ChoixCarte({ cartes, valeur, onChange, sections: filtre }: { cartes: CarteLabel[]; valeur: string; onChange: (v: string) => void; sections?: Section[] }) {
  const sections = SECTIONS.filter((s) => s.cle !== "sans" && (!filtre?.length || filtre.includes(s.cle as Section) || s.cle === "idees"));
  return (
    <select className={CHAMP} value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Label">
      <option value="">Sans label</option>
      {sections.map((s) => (
        <optgroup key={s.cle} label={s.libelle}>
          {cartes.filter((c) => c.section === s.cle).map((c) => <option key={c.id} value={c.id}>{nomCarte(c)} · {LIBELLE_BADGE[c.badge]}</option>)}
        </optgroup>
      ))}
      <option value={NOUVEAU}>+ nouveau label</option>
    </select>
  );
}

function NouveauLabel({ section, onSection, nom, onNom, description, onDescription }: {
  section: Section; onSection: (s: Section) => void; nom: string; onNom: (s: string) => void; description: string; onDescription: (s: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900/40">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={cn(CHAMP, "font-mono")} placeholder="nom_du_label" value={nom} onChange={(e) => onNom(e.target.value.toLowerCase().replace(/\s+/g, "_"))} />
        <select className={CHAMP} value={section} onChange={(e) => onSection(e.target.value as Section)} aria-label="App">
          {SECTIONS.filter((s) => s.cle !== "sans").map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
        </select>
      </div>
      <input className={CHAMP} placeholder="La DA en une ligne (photos, texte, couleur, vibe)" value={description} onChange={(e) => onDescription(e.target.value)} />
      {nom && !nomLabelValide(nom) && <p className="text-xs text-destructive">Le nom : minuscules, chiffres et _ (ex. study_notes).</p>}
      <p className="text-[11px] text-stone-500">Crée une proposition « à valider », jamais un vrai label.</p>
    </div>
  );
}

export function DialogueLabel({ compte, cartes, onFermer, onChoisir }: {
  compte: CompteBible | null; cartes: CarteLabel[]; onFermer: () => void; onChoisir: (carte: CarteLabel) => Promise<void>;
}) {
  const [valeur, setValeur] = React.useState("");
  const [section, setSection] = React.useState<Section>("sophia");
  const [nom, setNom] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  React.useEffect(() => { setValeur(compte?.label_propose_id ?? ""); setErreur(null); setNom(""); setDescription(""); }, [compte]);
  const valider = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      const carte = valeur === NOUVEAU ? await creerCarte({ nom, section, description }) : cartes.find((c) => c.id === valeur);
      if (carte) await onChoisir(carte);
      onFermer();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  return (
    <Dialog open={Boolean(compte)} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Changer de label</DialogTitle>
          <DialogDescription>@{compte?.handle}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 pb-5">
          <ChoixCarte cartes={cartes} valeur={valeur} onChange={setValeur} />
          {valeur === NOUVEAU && <NouveauLabel section={section} onSection={setSection} nom={nom} onNom={setNom} description={description} onDescription={setDescription} />}
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFermer}>Annuler</Button>
            <Button onClick={valider} disabled={occupe || !valeur || (valeur === NOUVEAU && !nomLabelValide(nom))}>Ranger ici</Button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

/** Les apps qu'on peut cocher (plusieurs à la fois). */
const APPS: { cle: Section; libelle: string }[] = [
  { cle: "atala", libelle: "Atala" },
  { cle: "micabo", libelle: "Micabo" },
  { cle: "sophia", libelle: "Sophia" },
];

export function DialogueAjout({ ouvert, cartes, onFermer, onFini }: { ouvert: boolean; cartes: CarteLabel[]; onFermer: () => void; onFini: () => void }) {
  const [texte, setTexte] = React.useState("");
  const [apps, setApps] = React.useState<Section[]>([]);
  const [valeur, setValeur] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [podzer, setPodzer] = React.useState(false);
  const [remarques, setRemarques] = React.useState<Record<string, string>>({});
  const [bilan, setBilan] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const lus = handlesDuTexte(texte);
  const basculer = (a: Section) => { setApps((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a])); setValeur(""); };
  const remarquer = (h: string, r: string) => setRemarques((x) => ({ ...x, [h]: r }));
  const ajouter = async () => {
    setOccupe(true);
    setBilan(null);
    try {
      const resolus = lus.courts.length ? await resoudreLiens(lus.courts) : {};
      const handles = [...lus.handles];
      const rem = { ...remarques };
      for (const u of lus.courts) {
        const h = resolus[u] ? handlesDuTexte(resolus[u]!).handles[0] : null;
        if (h && !handles.includes(h)) { handles.push(h); if (remarques[u]) rem[h] = remarques[u]!; }
      }
      if (!handles.length) throw new Error("Aucun lien TikTok reconnu.");
      const carte = valeur === NOUVEAU ? await creerCarte({ nom, section: apps[0] ?? "sophia", description }) : cartes.find((c) => c.id === valeur) ?? null;
      const sections = apps.length ? apps : carte && carte.section !== "idees" ? [carte.section] : [];
      const r = await ajouterComptes(handles, carte, sections, { a_podzer: podzer, remarques: rem });
      setBilan(`${r.crees.length} ajouté${r.crees.length > 1 ? "s" : ""}${r.deja.length ? `, ${r.deja.length} déjà dans la Bible (rangé${r.deja.length > 1 ? "s" : ""} ici)` : ""}. Les miniatures arrivent dans une minute.`);
      setTexte("");
      setRemarques({});
      onFini();
      // Les 3 derniers TikToks, un compte après l'autre (en arrière-plan).
      void (async () => { for (const id of r.ids) { await rafraichirMiniatures(id).catch(() => null); onFini(); } })();
    } catch (e) {
      setBilan((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  const comptes = [...lus.handles.map((h) => ({ cle: h, libelle: `@${h}` })), ...lus.courts.map((u) => ({ cle: u, libelle: u.replace(/^https?:\/\//, "") }))];
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">Ajouter des comptes</DialogTitle>
          <DialogDescription>Colle plusieurs liens TikTok d'un coup (profils, posts, vm.tiktok.com ou @handle). Ils arrivent dans « À importer ».</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4 pb-5">
          <Textarea rows={4} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={"https://www.tiktok.com/@compte1\nhttps://www.tiktok.com/@compte2"} className="font-mono text-xs" />

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-stone-500">Apps (une ou plusieurs)</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Apps">
              {APPS.map((a) => {
                const on = apps.includes(a.cle);
                return (
                  <button
                    key={a.cle}
                    type="button"
                    aria-pressed={on}
                    onClick={() => basculer(a.cle)}
                    className={cn("rounded-full border px-3 py-1 text-sm transition", on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900")}
                  >
                    {a.libelle}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <ChoixCarte cartes={cartes} valeur={valeur} onChange={setValeur} sections={apps} />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-1.5 text-sm dark:border-stone-700">
              <input type="checkbox" checked={podzer} onChange={(e) => setPodzer(e.target.checked)} className="size-4 accent-teal-600" />
              À podzer
            </label>
          </div>
          {valeur === NOUVEAU && <NouveauLabel section={apps[0] ?? "sophia"} onSection={(s) => setApps([s])} nom={nom} onNom={setNom} description={description} onDescription={setDescription} />}

          {comptes.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-500">
                  {comptes.length} compte{comptes.length > 1 ? "s" : ""} reconnu{comptes.length > 1 ? "s" : ""} · une remarque par compte (facultatif)
                  {lus.ignores.length ? ` · ${lus.ignores.length} ligne${lus.ignores.length > 1 ? "s" : ""} ignorée${lus.ignores.length > 1 ? "s" : ""}` : ""}
                </p>
                <button type="button" className="shrink-0 text-xs text-stone-500 underline-offset-2 hover:underline" onClick={() => setRemarques(Object.fromEntries(comptes.map((c) => [c.cle, REMARQUE_UGC])))}>
                  UGC pour tous
                </button>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-1.5 dark:border-stone-800 dark:bg-stone-900/40">
                {comptes.map((c) => (
                  <li key={c.cle} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 dark:bg-stone-900">
                    <span className="w-36 shrink-0 truncate text-xs font-medium" title={c.libelle}>{c.libelle}</span>
                    <input
                      value={remarques[c.cle] ?? ""}
                      onChange={(e) => remarquer(c.cle, e.target.value)}
                      placeholder="Remarque (ex. changer les images)"
                      aria-label={`Remarque pour ${c.libelle}`}
                      className="h-7 min-w-0 flex-1 rounded-md border border-stone-200 bg-transparent px-2 text-xs dark:border-stone-700"
                    />
                    <button
                      type="button"
                      onClick={() => remarquer(c.cle, REMARQUE_UGC)}
                      title={REMARQUE_UGC}
                      className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      UGC
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {bilan && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">{bilan}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFermer}>Fermer</Button>
            <Button onClick={ajouter} disabled={occupe || !comptes.length || (valeur === NOUVEAU && !nomLabelValide(nom))}>
              {occupe ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
