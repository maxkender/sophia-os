/**
 * 19/11 (Max) : les fenêtres de la Bible. « Changer de label » (labels existants et proposés, ou + nouveau label :
 * nom, app, description de la DA → proposition à valider) et « + Ajouter des comptes » (plusieurs liens d'un coup,
 * une app, un label → À importer, puis les 3 derniers TikToks, les miniatures et les stats).
 *
 * 19/11 (Adrien) : un compte se range sous N'IMPORTE QUEL label de l'OS (son bloc est créé s'il n'en avait pas), et
 * un bloc dont le label n'existe pas encore se modifie ou se rattache à un label de l'OS (« Modifier ou rattacher »).
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { resoudreLiens } from "./api";
import {
  ajouterComptes, type CarteLabel, carteDuLabel, carteValidable, type CompteBible, creerCarte, detacherCarte, handlesDuTexte, type LabelOs, labelsSansBloc, LIBELLE_BADGE, marquerPodz, modifierCarte,
  nomCarte, PREFIXE_LABEL, rafraichirMiniatures, rattacherCarte, REMARQUE_UGC, type Section, SECTIONS, validerCarte,
} from "./moodboard";
import { lienCompte, nomLabelValide } from "./parse";

const CHAMP = "h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm dark:border-stone-700 dark:bg-stone-900";
const NOUVEAU = "__nouveau__";
/** Un label de l'OS qui n'a pas encore de bloc dans la Bible : « label:<id> ». */
const LABEL = PREFIXE_LABEL;

/** La carte choisie dans la liste : un bloc, un label de l'OS (son bloc est créé), ou rien. */
async function carteChoisie(valeur: string, cartes: CarteLabel[]): Promise<CarteLabel | null> {
  if (valeur.startsWith(LABEL)) return carteDuLabel(valeur.slice(LABEL.length));
  return cartes.find((c) => c.id === valeur) ?? null;
}

/** Le choix d'une carte, groupé par app, puis les labels de l'OS sans bloc, avec « + nouveau label ». */
function ChoixCarte({ cartes, valeur, onChange, sections: filtre, labelsLibres = [] }: {
  cartes: CarteLabel[]; valeur: string; onChange: (v: string) => void; sections?: Section[]; labelsLibres?: LabelOs[];
}) {
  const sections = SECTIONS.filter((s) => s.cle !== "sans" && (!filtre?.length || filtre.includes(s.cle as Section) || s.cle === "idees"));
  return (
    <select className={CHAMP} value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Label">
      <option value="">Sans label</option>
      {sections.map((s) => (
        <optgroup key={s.cle} label={s.libelle}>
          {cartes.filter((c) => c.section === s.cle).map((c) => <option key={c.id} value={c.id}>{nomCarte(c)} · {LIBELLE_BADGE[c.badge]}</option>)}
        </optgroup>
      ))}
      {labelsLibres.length > 0 && (
        <optgroup label="Autres labels de l'OS">
          {labelsLibres.map((l) => <option key={l.id} value={LABEL + l.id}>{l.nom} · existe</option>)}
        </optgroup>
      )}
      <option value={NOUVEAU}>+ nouveau label</option>
    </select>
  );
}

function NouveauLabel({ section, onSection, nom, onNom, description, onDescription, creer, onCreer }: {
  section: Section; onSection: (s: Section) => void; nom: string; onNom: (s: string) => void; description: string; onDescription: (s: string) => void;
  /** Créer le label dans l'OS tout de suite, au lieu de le laisser en proposition (absent : pas d'option). */
  creer?: boolean; onCreer?: (b: boolean) => void;
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
      {onCreer && section !== "idees" ? (
        <label className="flex items-start gap-2 text-xs text-stone-600 dark:text-stone-300">
          <input type="checkbox" checked={Boolean(creer)} onChange={(e) => onCreer(e.target.checked)} className="mt-0.5 size-3.5 accent-stone-900" />
          <span>Créer ce label dans l'OS tout de suite : ses comptes sont alors prêts à importer. Sinon il reste une proposition, à créer plus tard depuis son bloc.</span>
        </label>
      ) : (
        <p className="text-[11px] text-stone-500">Crée une proposition « à valider », jamais un vrai label.</p>
      )}
    </div>
  );
}

/**
 * Le choix du label d'un compte : un bloc existant, un label de l'OS sans bloc (son bloc est créé), ou un nouveau label
 * (une proposition, ou créé tout de suite dans l'OS). `sansLabel` : on peut aussi ne rien choisir.
 */
export function DialogueChoixLabel({ cible, titre, bouton, sansLabel = false, aide, cartes, labels = [], onFermer, onChoisir }: {
  /** Le compte à ranger et la valeur présélectionnée (`null` : fenêtre fermée). */
  cible: { handle: string; valeur: string } | null;
  titre: string; bouton: string; sansLabel?: boolean; aide?: string;
  cartes: CarteLabel[]; labels?: LabelOs[]; onFermer: () => void; onChoisir: (carte: CarteLabel | null) => Promise<void>;
}) {
  const [valeur, setValeur] = React.useState("");
  const [section, setSection] = React.useState<Section>("sophia");
  const [nom, setNom] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creer, setCreer] = React.useState(false);
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const handle = cible?.handle;
  const initiale = cible?.valeur;
  React.useEffect(() => { setValeur(initiale ?? ""); setErreur(null); setNom(""); setDescription(""); setCreer(false); }, [handle, initiale]);
  const valider = async () => {
    setOccupe(true);
    setErreur(null);
    try {
      let carte: CarteLabel | null;
      if (valeur === NOUVEAU) {
        carte = await creerCarte({ nom, section, description });
        // « Créer tout de suite » : la proposition devient un vrai label de l'OS, le bloc passe à « existe ».
        if (creer && carteValidable(carte)) carte = { ...carte, label_id: await validerCarte(carte.id), badge: "existe", statut: "valide" };
      } else {
        carte = await carteChoisie(valeur, cartes);
      }
      if (carte || sansLabel) await onChoisir(carte);
      onFermer();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  return (
    <Dialog open={Boolean(cible)} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{titre}</DialogTitle>
          <DialogDescription>@{cible?.handle}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 pb-5">
          <ChoixCarte cartes={cartes} valeur={valeur} onChange={setValeur} labelsLibres={labelsSansBloc(labels, cartes)} />
          {valeur === NOUVEAU && (
            <NouveauLabel section={section} onSection={setSection} nom={nom} onNom={setNom} description={description} onDescription={setDescription} creer={creer} onCreer={setCreer} />
          )}
          {aide && <p className="text-[11px] text-stone-500">{aide}</p>}
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onFermer}>Annuler</Button>
            <Button onClick={valider} disabled={occupe || (!valeur && !sansLabel) || (valeur === NOUVEAU && !nomLabelValide(nom))}>{bouton}</Button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

/** « Changer de label » d'un compte de la Bible. */
export function DialogueLabel({ compte, cartes, labels = [], onFermer, onChoisir }: {
  compte: CompteBible | null; cartes: CarteLabel[]; labels?: LabelOs[]; onFermer: () => void; onChoisir: (carte: CarteLabel) => Promise<void>;
}) {
  return (
    <DialogueChoixLabel
      cible={compte ? { handle: compte.handle, valeur: compte.label_propose_id ?? "" } : null}
      titre="Changer de label"
      bouton="Ranger ici"
      cartes={cartes}
      labels={labels}
      onFermer={onFermer}
      onChoisir={async (carte) => { if (carte) await onChoisir(carte); }}
    />
  );
}

/**
 * « Modifier ou rattacher » : un bloc dont le label n'existe pas encore dans l'OS. On le rattache à un label de l'OS
 * (ses comptes prennent ce label et deviennent importables ; si le label avait déjà son bloc, ils le rejoignent), ou
 * on corrige son nom, son app et sa DA avant de le créer.
 */
export function DialogueCarte({ carte, labels, cartes, nbComptes, sectionDe, onFermer, onFini }: {
  carte: CarteLabel | null; labels: LabelOs[];
  /** Tous les blocs : pour prévenir quand le label choisi a déjà le sien (les comptes iraient le rejoindre). */
  cartes: CarteLabel[];
  /** Les comptes du bloc. */
  nbComptes: number;
  /** L'app d'un label de l'OS : pour prévenir quand elle n'est pas celle du bloc. */
  sectionDe: (labelId: string) => Section;
  onFermer: () => void;
  /** Ce qui vient d'être fait, et de quoi l'annuler quand c'est un rattachement. */
  onFini: (message: string, annuler?: () => Promise<string>) => void;
}) {
  const [labelId, setLabelId] = React.useState("");
  const [nom, setNom] = React.useState("");
  const [section, setSection] = React.useState<Section>("sophia");
  const [description, setDescription] = React.useState("");
  const [erreur, setErreur] = React.useState<string | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  React.useEffect(() => {
    setLabelId(""); setErreur(null);
    setNom(carte?.nom ?? ""); setSection(carte?.section ?? "sophia"); setDescription(carte?.description_da ?? "");
  }, [carte]);
  const faire = async (f: () => Promise<{ message: string; annuler?: () => Promise<string> }>) => {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await f();
      onFini(r.message, r.annuler);
      onFermer();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  };
  // Ce que le rattachement va faire, dit AVANT : rejoindre un bloc qui existe déjà, ou changer d'app.
  const labelNom = labels.find((l) => l.id === labelId)?.nom ?? "";
  const blocDuLabel = labelId && carte ? cartes.find((c) => c.label_id === labelId && c.id !== carte.id) ?? null : null;
  const appDuLabel = labelId ? sectionDe(labelId) : null;
  const autreApp = Boolean(carte && appDuLabel && carte.section !== "idees" && appDuLabel !== carte.section);
  const nomApp = (s: Section | null) => SECTIONS.find((x) => x.cle === s)?.libelle ?? "";
  const comptes = `${nbComptes} compte${nbComptes > 1 ? "s" : ""}`;
  const rattacher = () => {
    if (!carte) return;
    // Rejoindre un autre bloc ou changer d'app ne se fait pas d'un clic distrait : on le confirme, label nommé.
    if ((blocDuLabel || autreApp) && !window.confirm(
      `Rattacher « ${nomCarte(carte)} » (${comptes}, ${nomApp(carte.section)}) au label ${labelNom} (${nomApp(appDuLabel)}) ?`
      + (blocDuLabel ? `\n\n${labelNom} a déjà son bloc : les comptes iront le rejoindre.` : "")
      + "\n\nTu pourras annuler.",
    )) return;
    void faire(async () => {
      const r = await rattacherCarte(carte.id, labelId);
      return {
        message: r.fusion
          ? `${r.comptes} compte${r.comptes > 1 ? "s" : ""} de « ${nomCarte(carte)} » rangé${r.comptes > 1 ? "s" : ""} sous ${r.label}, qui avait déjà son bloc.`
          : `Le bloc est rattaché à ${r.label} : ${r.comptes} compte${r.comptes > 1 ? "s" : ""} importable${r.comptes > 1 ? "s" : ""}.`,
        annuler: async () => {
          const d = await detacherCarte(carte.id);
          return `Rattachement annulé : ${d.comptes} compte${d.comptes > 1 ? "s" : ""} de retour sous « ${nomCarte(carte)} ».`;
        },
      };
    });
  };
  const enregistrer = () => faire(async () => {
    await modifierCarte(carte!.id, { nom, section, description });
    return { message: `Le label proposé s'appelle ${nom}.` };
  });
  return (
    <Dialog open={Boolean(carte)} onOpenChange={(o) => !o && onFermer()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Modifier ou rattacher</DialogTitle>
          <DialogDescription>Le bloc « {carte ? nomCarte(carte) : ""} » : son label n'existe pas encore dans l'OS.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4 pb-5">
          <div className="space-y-2">
            <p className="text-xs font-medium text-stone-500">Le rattacher à un label de l'OS</p>
            <div className="flex gap-2">
              <select className={CHAMP} value={labelId} onChange={(e) => setLabelId(e.target.value)} aria-label="Label de l'OS">
                <option value="">Choisir un label…</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
              <Button onClick={rattacher} disabled={occupe || !labelId}>Rattacher</Button>
            </div>
            {(blocDuLabel || autreApp) && (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" data-testid="alerte-rattachement">
                {autreApp && <>Ce bloc est rangé sous {nomApp(carte?.section ?? null)}, et {labelNom} est un label {nomApp(appDuLabel)}. </>}
                {blocDuLabel && <>{labelNom} a déjà son bloc : les {comptes} de ce bloc iront le rejoindre. </>}
                Tu pourras annuler.
              </p>
            )}
            <p className="text-[11px] text-stone-500">Les comptes du bloc prennent ce label et deviennent importables. Le rattachement s'annule depuis le bloc.</p>
          </div>
          <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-stone-800">
            <p className="text-xs font-medium text-stone-500">Ou corriger le label proposé</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={cn(CHAMP, "font-mono")} aria-label="Nom du label" value={nom} onChange={(e) => setNom(e.target.value.toLowerCase().replace(/\s+/g, "_"))} />
              <select className={CHAMP} value={section} onChange={(e) => setSection(e.target.value as Section)} aria-label="App du label">
                {SECTIONS.filter((s) => s.cle !== "sans").map((s) => <option key={s.cle} value={s.cle}>{s.libelle}</option>)}
              </select>
            </div>
            <input className={CHAMP} aria-label="DA du label" placeholder="La DA en une ligne (photos, texte, couleur, vibe)" value={description} onChange={(e) => setDescription(e.target.value)} />
            {nom && !nomLabelValide(nom) && <p className="text-xs text-destructive">Le nom : minuscules, chiffres et _ (ex. study_notes).</p>}
            <div className="flex justify-end">
              <Button variant="outline" onClick={enregistrer} disabled={occupe || !nomLabelValide(nom)}>Enregistrer</Button>
            </div>
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
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

export function DialogueAjout({ ouvert, cartes, labels = [], onFermer, onFini }: { ouvert: boolean; cartes: CarteLabel[]; labels?: LabelOs[]; onFermer: () => void; onFini: () => void }) {
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
      const carte = valeur === NOUVEAU ? await creerCarte({ nom, section: apps[0] ?? "sophia", description }) : await carteChoisie(valeur, cartes);
      const sections = apps.length ? apps : carte && carte.section !== "idees" ? [carte.section] : [];
      const r = await ajouterComptes(handles, carte, sections, { remarques: rem });
      // « À podzer » se marque sur le label choisi (0786), plus sur chaque compte.
      if (podzer && carte && !carte.a_podzer) await marquerPodz(carte.id, true);
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
          <Textarea rows={4} value={texte} onChange={(e) => setTexte(lienCompte(e.target.value))} placeholder={"https://www.tiktok.com/@compte1\nhttps://www.tiktok.com/@compte2"} className="font-mono text-xs" aria-label="Liens TikTok" />

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
            <ChoixCarte cartes={cartes} valeur={valeur} onChange={setValeur} sections={apps} labelsLibres={labelsSansBloc(labels, cartes)} />
            <label
              className={cn("flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-1.5 text-sm dark:border-stone-700", valeur ? "cursor-pointer" : "cursor-not-allowed text-stone-400")}
              title={valeur ? "Ce label est à faire en podz : ses comptes ne seront pas importés." : "Choisis d'abord un label : « à podzer » se marque sur le label, pas sur le compte."}
            >
              <input type="checkbox" checked={podzer && Boolean(valeur)} disabled={!valeur} onChange={(e) => setPodzer(e.target.checked)} className="size-4 accent-teal-600" />
              Label à podzer
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
