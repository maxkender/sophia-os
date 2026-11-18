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
  ajouterComptes, type CarteLabel, type CompteBible, creerCarte, handlesDuTexte, LIBELLE_BADGE, nomCarte, rafraichirMiniatures, type Section, SECTIONS,
} from "./moodboard";
import { nomLabelValide } from "./parse";

const CHAMP = "h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900";
const NOUVEAU = "__nouveau__";

/** Le choix d'une carte, groupé par app, avec « + nouveau label ». */
function ChoixCarte({ cartes, valeur, onChange, section }: { cartes: CarteLabel[]; valeur: string; onChange: (v: string) => void; section?: Section | null }) {
  const sections = SECTIONS.filter((s) => s.cle !== "sans" && (!section || s.cle === section));
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

export function DialogueAjout({ ouvert, cartes, onFermer, onFini }: { ouvert: boolean; cartes: CarteLabel[]; onFermer: () => void; onFini: () => void }) {
  const [texte, setTexte] = React.useState("");
  const [section, setSection] = React.useState<Section | "">("");
  const [valeur, setValeur] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [bilan, setBilan] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const lus = handlesDuTexte(texte);
  const ajouter = async () => {
    setOccupe(true);
    setBilan(null);
    try {
      const resolus = lus.courts.length ? await resoudreLiens(lus.courts) : {};
      const handles = [...lus.handles];
      for (const u of lus.courts) {
        const h = resolus[u] ? handlesDuTexte(resolus[u]!).handles[0] : null;
        if (h && !handles.includes(h)) handles.push(h);
      }
      if (!handles.length) throw new Error("Aucun lien TikTok reconnu.");
      const sec = (valeur === NOUVEAU ? section || "sophia" : cartes.find((c) => c.id === valeur)?.section ?? section) || null;
      const carte = valeur === NOUVEAU ? await creerCarte({ nom, section: (section || "sophia") as Section, description }) : cartes.find((c) => c.id === valeur) ?? null;
      const r = await ajouterComptes(handles, carte, sec as Section | null);
      setBilan(`${r.crees.length} ajouté${r.crees.length > 1 ? "s" : ""}${r.deja.length ? `, ${r.deja.length} déjà dans la Bible (rangé${r.deja.length > 1 ? "s" : ""} ici)` : ""}. Les miniatures arrivent dans une minute.`);
      setTexte("");
      onFini();
      // Les 3 derniers TikToks, un compte après l'autre (en arrière-plan).
      void (async () => { for (const id of r.ids) { await rafraichirMiniatures(id).catch(() => null); onFini(); } })();
    } catch (e) {
      setBilan((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Ajouter des comptes</DialogTitle>
          <DialogDescription>Colle plusieurs liens TikTok d'un coup (profils, posts, vm.tiktok.com ou @handle). Ils arrivent dans « À importer ».</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 pb-5">
          <Textarea rows={6} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={"https://www.tiktok.com/@compte1\nhttps://www.tiktok.com/@compte2"} className="font-mono text-xs" />
          <p className="text-xs text-stone-500">
            {lus.handles.length + lus.courts.length} compte{lus.handles.length + lus.courts.length > 1 ? "s" : ""} reconnu{lus.handles.length + lus.courts.length > 1 ? "s" : ""}
            {lus.ignores.length ? ` · ${lus.ignores.length} ligne${lus.ignores.length > 1 ? "s" : ""} ignorée${lus.ignores.length > 1 ? "s" : ""}` : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className={CHAMP} value={section} onChange={(e) => { setSection(e.target.value as Section | ""); setValeur(""); }} aria-label="App">
              <option value="">App…</option>
              {SECTIONS.filter((s) => s.cle !== "sans").map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
            </select>
            <ChoixCarte cartes={cartes} valeur={valeur} onChange={setValeur} section={section || null} />
          </div>
          {valeur === NOUVEAU && <NouveauLabel section={(section || "sophia") as Section} onSection={setSection} nom={nom} onNom={setNom} description={description} onDescription={setDescription} />}
          {bilan && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">{bilan}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFermer}>Fermer</Button>
            <Button onClick={ajouter} disabled={occupe || !(lus.handles.length + lus.courts.length) || (valeur === NOUVEAU && !nomLabelValide(nom))}>
              {occupe ? "Ajout…" : "Ajouter"}
            </Button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
