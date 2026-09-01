/** Copie Deno de src/features/moteur/papierVoix.ts — garder synchro. */

export const NOM_LOCUTEUR_CM = "locuteur-cm";

export type VoixElevenSource = "library" | "shared" | "catalogue";

export type VoixEleven = {
  id: string;
  name: string;
  languages: string[];
  previewUrl: string | null;
  category: string;
  gender: string | null;
  accent: string | null;
  source: VoixElevenSource;
  ownerId?: string | null;
  custom: boolean;
};

export const LANGUES_VOIX = ["fr", "en", "de", "es", "it", "pt", "pl", "nl", "sv", "tr", "cs", "ro", "hu", "el"] as const;

const LANGUE_ALIAS: Record<string, string> = {
  french: "fr",
  français: "fr",
  francais: "fr",
  english: "en",
  german: "de",
  deutsch: "de",
  spanish: "es",
  español: "es",
  italian: "it",
  portuguese: "pt",
  polish: "pl",
  dutch: "nl",
  swedish: "sv",
  turkish: "tr",
  czech: "cs",
  romanian: "ro",
  hungarian: "hu",
  greek: "el",
};

export function normaliserCodeLangueVoix(brut: string): string {
  const s = brut.trim().toLowerCase().replace("_", "-");
  const base = s.split("-")[0] ?? s;
  return LANGUE_ALIAS[s] ?? LANGUE_ALIAS[base] ?? base;
}

export function estLocuteurCm(voix: Pick<VoixEleven, "name" | "id">): boolean {
  const n = voix.name.trim().toLowerCase();
  const id = voix.id.trim().toLowerCase();
  return n === NOM_LOCUTEUR_CM || n.replace(/\s+/g, "-") === NOM_LOCUTEUR_CM || id === NOM_LOCUTEUR_CM;
}

export function voixParleLangue(voix: VoixEleven, langue: string): boolean {
  const code = normaliserCodeLangueVoix(langue);
  if (!code) return true;
  if (voix.custom || estLocuteurCm(voix)) return true;
  if (voix.languages.length === 0) return voix.source === "library";
  return voix.languages.some((l) => normaliserCodeLangueVoix(l) === code);
}

export function filtrerVoixParLangue(voix: VoixEleven[], langue: string): VoixEleven[] {
  const code = normaliserCodeLangueVoix(langue);
  const filtered = voix.filter((v) => voixParleLangue(v, code));
  return [...filtered].sort((a, b) => {
    const ac = estLocuteurCm(a) ? 0 : a.custom ? 1 : a.source === "library" ? 2 : 3;
    const bc = estLocuteurCm(b) ? 0 : b.custom ? 1 : b.source === "library" ? 2 : 3;
    if (ac !== bc) return ac - bc;
    return a.name.localeCompare(b.name, "fr");
  });
}

export function resoudreVoix(ref: string, voix: VoixEleven[]): VoixEleven | undefined {
  const r = ref.trim();
  if (!r) return undefined;
  const byId = voix.find((v) => v.id === r);
  if (byId) return byId;
  const low = r.toLowerCase();
  return voix.find((v) => v.name.toLowerCase() === low || v.name.toLowerCase().replace(/\s+/g, "-") === low);
}

export function voixDefautDepuisListe(voix: VoixEleven[], langue = "fr"): string {
  const liste = filtrerVoixParLangue(voix, langue);
  const cm = liste.find(estLocuteurCm);
  if (cm) return cm.id;
  const lib = liste.find((v) => v.custom || v.source === "library");
  return lib?.id ?? liste[0]?.id ?? "";
}

export function labelVoixEleven(voix: VoixEleven): string {
  const bits = [voix.name];
  if (estLocuteurCm(voix)) bits.push("CM");
  else if (voix.custom) bits.push("biblio");
  if (voix.gender) bits.push(voix.gender);
  if (voix.accent) bits.push(voix.accent);
  return bits.join(" · ");
}

export function estIdentifiantVoix(nom: string): boolean {
  const n = nom.trim();
  return n.length >= 2 && n.length <= 80;
}

/** Ancien défaut Fal figé dans l’UI. */
export function estVoixLegacyDefaut(ref: string): boolean {
  const n = ref.trim().toLowerCase();
  return !n || n === "george";
}

export function catalogueVersVoixEleven(
  rows: readonly { id: string; label: string; hint: string }[],
): VoixEleven[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.label,
    languages: [normaliserCodeLangueVoix(r.hint)],
    previewUrl: null,
    category: "premade",
    gender: null,
    accent: null,
    source: "catalogue",
    custom: estLocuteurCm({ id: r.id, name: r.label }),
  }));
}

export function voixOrdonneesEleven(favoris: string[], voix: VoixEleven[]): VoixEleven[] {
  const fav = new Set(favoris.map((v) => v.trim().toLowerCase()).filter(Boolean));
  return [...voix].sort((a, b) => {
    const af = fav.has(a.id.toLowerCase()) || fav.has(a.name.toLowerCase()) ? 0 : 1;
    const bf = fav.has(b.id.toLowerCase()) || fav.has(b.name.toLowerCase()) ? 0 : 1;
    if (af !== bf) return af - bf;
    const ac = estLocuteurCm(a) ? 0 : a.custom ? 1 : a.source === "library" ? 2 : 3;
    const bc = estLocuteurCm(b) ? 0 : b.custom ? 1 : b.source === "library" ? 2 : 3;
    if (ac !== bc) return ac - bc;
    return a.name.localeCompare(b.name, "fr");
  });
}

export function assurerVoixSelectionnee(liste: VoixEleven[], value: string): VoixEleven[] {
  const v = value.trim();
  if (!v || liste.some((x) => x.id === v || x.name === v)) return liste;
  return [
    {
      id: v,
      name: v,
      languages: [],
      previewUrl: null,
      category: "unknown",
      gender: null,
      accent: null,
      source: "catalogue",
      custom: estLocuteurCm({ id: v, name: v }),
    },
    ...liste,
  ];
}

/** Aligne les caractères ElevenLabs sur des mots. */
export function motsDepuisAlignement(
  text: string,
  characters: string[],
  starts: number[],
  ends: number[],
): { word: string; start: number; end: number }[] {
  if (!characters.length || characters.length !== starts.length) return [];
  const out: { word: string; start: number; end: number }[] = [];
  let buf = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    const word = buf.trim();
    if (word) out.push({ word, start, end: Math.max(end, start + 0.05) });
    buf = "";
  };
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i] ?? "";
    const s = starts[i] ?? 0;
    const e = ends[i] ?? s;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (!buf) start = s;
    buf += ch;
    end = e;
  }
  flush();
  if (out.length) return out;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.map((word, i) => ({
    word,
    start: i * 0.3,
    end: i * 0.3 + 0.25,
  }));
}
