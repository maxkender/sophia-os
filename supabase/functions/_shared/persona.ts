import { avatarPourCompte } from "./avatar.ts";
import {
  genreDuLabel,
  normaliserLabel,
  themeDuLabel,
  type Genre,
  type ThemeLabel,
} from "./label_theme.ts";

export type { Genre, ThemeLabel };
export { genreDuLabel, themeDuLabel, normaliserLabel };

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

/**
 * Identité d'un compte de publication (pseudo, nom, bio, avatar), déterministe et
 * INSTANTANÉE (aucun appel Gemini).
 *
 * Format du @ : `prenom.mot-theme` + 3 chiffres — ex. « jakob.disziplin473 ».
 * — Prénoms / noms : selon la LANGUE du créateur + GENRE du label
 * — Mot du @ : selon le LABEL (thème) + la langue
 * — Genre : label (alpha_male → H, clean_girl → F) sinon genre de la source
 */

interface JeuDeNoms {
  prenomsH: string[];
  prenomsF: string[];
  noms: string[];
}

/** Prénoms + noms de famille par langue (crédibles localement). */
const NOMS_PAR_LANGUE: Record<string, JeuDeNoms> = {
  fr: {
    prenomsH: ["matteo", "lucas", "nathan", "gabriel", "hugo", "louis", "adam", "raphael", "arthur", "jules", "leo", "ethan", "noah", "paul"],
    prenomsF: ["emma", "lea", "chloe", "manon", "sarah", "camille", "ines", "jade", "louise", "alice", "lina", "anna", "clara", "eva"],
    noms: ["martin", "bernard", "dubois", "moreau", "laurent", "lefevre", "roux", "fournier", "girard", "bonnet"],
  },
  en: {
    prenomsH: ["mark", "james", "jack", "ryan", "ethan", "liam", "noah", "luke", "adam", "ben", "jacob", "dylan", "owen", "sam"],
    prenomsF: ["emily", "olivia", "sophie", "grace", "chloe", "mia", "ava", "ella", "lily", "hannah", "zoe", "ruby", "isla", "erin"],
    noms: ["smith", "jones", "brooks", "carter", "reed", "hayes", "morgan", "bennett", "cole", "ward"],
  },
  de: {
    prenomsH: ["jakob", "felix", "lukas", "jonas", "leon", "paul", "ben", "elias", "finn", "noah", "luca", "tim", "max", "moritz"],
    prenomsF: ["mia", "emma", "hannah", "lena", "lea", "marie", "lina", "clara", "anna", "sophie", "laura", "nele", "ida", "greta"],
    noms: ["mueller", "schmidt", "weber", "wagner", "becker", "hoffmann", "koch", "richter", "klein", "wolf"],
  },
  it: {
    prenomsH: ["matteo", "leonardo", "francesco", "alessandro", "lorenzo", "andrea", "gabriele", "marco", "luca", "davide", "riccardo", "tommaso", "giulio", "pietro"],
    prenomsF: ["giulia", "sofia", "aurora", "alice", "emma", "giorgia", "martina", "chiara", "sara", "beatrice", "gaia", "elisa", "viola", "alessia"],
    noms: ["rossi", "bianchi", "ferrari", "russo", "romano", "gallo", "costa", "conti", "ricci", "marino"],
  },
  es: {
    prenomsH: ["hugo", "mateo", "martin", "lucas", "pablo", "alvaro", "adrian", "diego", "daniel", "alejandro", "marco", "javier", "mario", "leo"],
    prenomsF: ["lucia", "sofia", "martina", "maria", "paula", "julia", "valeria", "alba", "emma", "carla", "daniela", "sara", "vega", "alma"],
    noms: ["garcia", "martinez", "lopez", "sanchez", "romero", "torres", "ramos", "vega", "castro", "iglesias"],
  },
  pt: {
    prenomsH: ["joao", "francisco", "afonso", "tomas", "martim", "guilherme", "rodrigo", "tiago", "miguel", "diogo", "gabriel", "duarte", "santiago", "pedro"],
    prenomsF: ["maria", "matilde", "leonor", "beatriz", "carolina", "ana", "mariana", "ines", "sofia", "margarida", "francisca", "lara", "alice", "clara"],
    noms: ["silva", "santos", "ferreira", "costa", "oliveira", "sousa", "rocha", "martins", "pinto", "carvalho"],
  },
  cs: {
    prenomsH: ["jan", "adam", "tomas", "lukas", "matej", "filip", "david", "jakub", "ondrej", "martin", "petr", "varek", "daniel", "simon"],
    prenomsF: ["elina", "tereza", "anna", "katerina", "natalie", "viktorie", "adela", "nikola", "barbora", "karolina", "julie", "sofie", "emma", "lucie"],
    noms: ["novak", "svoboda", "novotny", "dvorak", "cerny", "prochazka", "kucera", "vesely", "horak", "nemec"],
  },
  nl: {
    prenomsH: ["daan", "sem", "lucas", "levi", "finn", "milan", "noah", "luuk", "jesse", "thijs", "max", "sam", "thomas", "bram"],
    prenomsF: ["emma", "julia", "sophie", "mila", "sara", "lisa", "nova", "liv", "fleur", "anna", "lotte", "isa", "nora", "eva"],
    noms: ["deboer", "jansen", "devries", "bakker", "visser", "smit", "meijer", "mulder", "bos", "vos"],
  },
  el: {
    prenomsH: ["giorgos", "nikos", "dimitris", "giannis", "kostas", "alexandros", "panagiotis", "christos", "antonis", "stefanos", "manolis", "thodoris", "vasilis", "petros"],
    prenomsF: ["maria", "eleni", "katerina", "sofia", "anna", "despoina", "ioanna", "christina", "georgia", "daphne", "irene", "nikoleta", "eva", "alexandra"],
    noms: ["papadopoulos", "nikolaou", "georgiou", "dimitriou", "ioannou", "papadakis", "vasileiou", "antonis", "christou", "markou"],
  },
  hu: {
    prenomsH: ["balint", "mate", "dominik", "levente", "adam", "david", "balazs", "tamas", "gabor", "marton", "zoltan", "peter", "laszlo", "istvan"],
    prenomsF: ["hanna", "anna", "lila", "zsofia", "emma", "nora", "laura", "reka", "vivien", "dora", "kata", "petra", "luca", "sara"],
    noms: ["nagy", "kovacs", "toth", "szabo", "horvath", "varga", "kiss", "molnar", "nemeth", "farkas"],
  },
  pl: {
    prenomsH: ["jakub", "antoni", "jan", "szymon", "franciszek", "filip", "aleksander", "mikolaj", "wojciech", "kacper", "mateusz", "bartek", "adam", "piotr"],
    prenomsF: ["zofia", "zuzanna", "hanna", "julia", "maja", "laura", "olena", "alicia", "lena", "maria", "natalia", "emilia", "pola", "anna"],
    noms: ["nowak", "kowalski", "wisniewski", "wojcik", "kaminski", "lewandowski", "zielinski", "szymanski", "wozniak", "kozlowski"],
  },
  ro: {
    prenomsH: ["andrej", "mihai", "alexandru", "andrei", "david", "stefan", "gabriel", "matei", "cristian", "ionut", "daniel", "razvan", "vlad", "radu"],
    prenomsF: ["maria", "elena", "ioana", "andreea", "sofia", "ana", "daria", "sara", "alexandra", "lara", "emma", "karina", "iris", "teodora"],
    noms: ["popescu", "ionescu", "pop", "stan", "dumitru", "georgescu", "stoica", "ciobanu", "marin", "tureac"],
  },
  sv: {
    prenomsH: ["erik", "lars", "karl", "anders", "johan", "per", "nils", "olof", "gustav", "axel", "hugo", "william", "oskar", "elias"],
    prenomsF: ["emma", "alice", "maja", "ella", "wilma", "alma", "lily", "ebba", "saga", "astrid", "freja", "nova", "clara", "selma"],
    noms: ["andersson", "johansson", "karlsson", "nilsson", "eriksson", "larsson", "olsson", "persson", "svensson", "gustafsson"],
  },
  tr: {
    prenomsH: ["emir", "yusuf", "miraç", "ege", "ali", "can", "burak", "kerem", "mert", "arda", "emre", "deniz", "baran", "onur"],
    prenomsF: ["zeynep", "ela", "defne", "azra", "asya", "miray", "eylul", "derya", "selin", "ece", "melis", "irem", "deniz", "su"],
    noms: ["yilmaz", "kaya", "demir", "celik", "sahin", "yildiz", "yildirim", "ozturk", "aydin", "ozdemir"],
  },
};

/** Mots du @ par thème × langue (sans accents, minuscules). */
const CULTURE_PAR_THEME: Record<ThemeLabel, Record<string, string[]>> = {
  alpha_male: {
    fr: ["discipline", "focus", "ambition", "force", "mental", "progres", "leader", "rigueur", "drive", "niveau"],
    en: ["discipline", "focus", "ambition", "mindset", "grind", "level", "leader", "drive", "strength", "growth"],
    de: ["disziplin", "fokus", "ambition", "mindset", "staerke", "level", "antrieb", "fortschritt", "klarheit", "wille"],
    it: ["disciplina", "focus", "ambizione", "mentalita", "forza", "livello", "drive", "crescita", "rigore", "leader"],
    es: ["disciplina", "enfoque", "ambicion", "mentalidad", "fuerza", "nivel", "drive", "crecimiento", "lider", "progreso"],
    pt: ["disciplina", "foco", "ambicao", "mentalidade", "forca", "nivel", "drive", "crescimento", "lider", "progresso"],
    cs: ["disciplína", "fokus", "ambice", "mysleni", "sila", "uroven", "rust", "vule", "leader", "pokrok"],
    nl: ["discipline", "focus", "ambitie", "mindset", "kracht", "niveau", "drive", "groei", "wil", "leider"],
    el: ["peitharxia", "focus", "filodoxia", "nootropia", "dynami", "epipedo", "anaptyxi", "igetis", "ormi", "proodos"],
    hu: ["fegyelem", "fokus", "ambicio", "mentalitas", "ero", "szint", "novekedes", "vezeto", "akarat", "haladas"],
    pl: ["dyscyplina", "fokus", "ambicja", "mindset", "sila", "poziom", "drive", "rozwoj", "lider", "postep"],
    ro: ["disciplina", "focus", "ambitíe", "mentalitate", "forta", "nivel", "drive", "crestere", "lider", "progres"],
    sv: ["disciplin", "fokus", "ambition", "mindset", "styrka", "niva", "drive", "tillvaxt", "vilja", "ledare"],
    tr: ["disiplin", "odak", "hedef", "zihniyet", "guc", "seviye", "azim", "buyume", "lider", "ilerleme"],
  },
  smart_girl: {
    fr: ["cultive", "savoir", "lit", "apprend", "inspire", "curiosite", "eclaire", "pense", "ideas", "livres"],
    en: ["curious", "reads", "learns", "smart", "books", "ideas", "wisdom", "thinks", "insight", "study"],
    de: ["neugierig", "lernt", "liest", "klug", "wissen", "buecher", "ideen", "denkt", "bildung", "klarheit"],
    it: ["curiosa", "legge", "impara", "sapere", "libri", "idee", "pensa", "cultura", "insight", "studia"],
    es: ["curiosa", "lee", "aprende", "saber", "libros", "ideas", "piensa", "cultura", "insight", "estudia"],
    pt: ["curiosa", "le", "aprende", "saber", "livros", "ideias", "pensa", "cultura", "insight", "estuda"],
    cs: ["zvedava", "cte", "uci", "chytra", "knihy", "napady", "mysli", "vedeni", "studium", "moudrost"],
    nl: ["nieuwsgierig", "leest", "leert", "slim", "boeken", "ideeen", "denkt", "kennis", "studie", "wijsheid"],
    el: ["periergi", "diavazei", "mathainei", "eksypni", "vivlia", "idees", "skeftetai", "gnosi", "meleti", "sofia"],
    hu: ["kivancsi", "olvas", "tanul", "okos", "konyvek", "otletek", "gondol", "tudás", "tanulas", "bolcsesseg"],
    pl: ["ciekawa", "czyta", "uczy", "madrze", "ksiazki", "pomysly", "mysli", "wiedza", "nauka", "madrosc"],
    ro: ["curioasa", "citeste", "invata", "inteligenta", "carti", "idei", "gandeste", "cultura", "studiu", "intelepciune"],
    sv: ["nyfiken", "laser", "lar", "smart", "bocker", "ideer", "tankar", "kunskap", "studier", "visdom"],
    tr: ["merakli", "okur", "ogrenir", "akilli", "kitap", "fikir", "dusunur", "bilgi", "calisir", "bilgelik"],
  },
  clean_girl: {
    fr: ["douce", "naturel", "glow", "simple", "calme", "soft", "pure", "zen", "fresh", "light"],
    en: ["soft", "natural", "glow", "simple", "calm", "fresh", "pure", "light", "gentle", "clean"],
    de: ["sanft", "natuerlich", "glow", "einfach", "ruhe", "frisch", "pur", "leicht", "clean", "klar"],
    it: ["soft", "naturale", "glow", "semplice", "calma", "fresh", "pura", "light", "gentle", "clean"],
    es: ["suave", "natural", "glow", "simple", "calma", "fresh", "pura", "light", "gentle", "clean"],
    pt: ["suave", "natural", "glow", "simples", "calma", "fresh", "pura", "leve", "gentle", "clean"],
    cs: ["jemna", "prirodni", "glow", "jednoducha", "klid", "cista", "lehka", "soft", "fresh", "pure"],
    nl: ["zacht", "natuurlijk", "glow", "simpel", "rust", "fris", "puur", "licht", "soft", "clean"],
    el: ["apali", "fysiki", "glow", "apli", "iremia", "fresc", "kathari", "elafria", "soft", "pure"],
    hu: ["lagy", "termeszetes", "glow", "egyszeru", "nyugodt", "friss", "tiszta", "konnyu", "soft", "clean"],
    pl: ["delikatna", "naturalna", "glow", "prosta", "spokoj", "swieza", "czysta", "lekka", "soft", "clean"],
    ro: ["blanda", "naturala", "glow", "simpla", "liniște", "fresh", "pura", "usoara", "soft", "clean"],
    sv: ["mjuk", "naturlig", "glow", "enkel", "lugn", "frisk", "ren", "latt", "soft", "clean"],
    tr: ["yumusak", "dogal", "glow", "sade", "sakin", "taze", "saf", "hafif", "soft", "clean"],
  },
  cinema: {
    fr: ["cinema", "scene", "film", "plan", "ecran", "cadre", "story", "take", "reel", "cut"],
    en: ["cinema", "scene", "film", "frame", "screen", "story", "take", "reel", "cut", "shot"],
    de: ["kino", "szene", "film", "bild", "leinwand", "story", "take", "schnitt", "shot", "reel"],
    it: ["cinema", "scena", "film", "inquadratura", "schermo", "story", "take", "reel", "cut", "shot"],
    es: ["cine", "escena", "film", "plano", "pantalla", "story", "take", "reel", "cut", "shot"],
    pt: ["cinema", "cena", "filme", "plano", "tela", "story", "take", "reel", "cut", "shot"],
    cs: ["kino", "scena", "film", "zaber", "platno", "story", "take", "strih", "shot", "reel"],
    nl: ["cinema", "scene", "film", "shot", "doek", "story", "take", "reel", "cut", "frame"],
    el: ["kinimatografos", "skini", "tainia", "plano", "othoni", "story", "take", "reel", "cut", "shot"],
    hu: ["mozi", "jelenet", "film", "kepkocka", "vazson", "story", "take", "vagás", "shot", "reel"],
    pl: ["kino", "scena", "film", "klatka", "ekran", "story", "take", "ciecie", "shot", "reel"],
    ro: ["cinema", "scena", "film", "cadru", "ecran", "story", "take", "reel", "cut", "shot"],
    sv: ["bio", "scen", "film", "bild", "duk", "story", "take", "klipp", "shot", "reel"],
    tr: ["sinema", "sahne", "film", "kare", "ekran", "hikaye", "take", "kesit", "shot", "reel"],
  },
  anciens: {
    fr: ["histoire", "antique", "mythe", "legende", "savoir", "epoque", "relique", "ancien", "memoire", "heritage"],
    en: ["history", "ancient", "myth", "legend", "relic", "era", "heritage", "memory", "classic", "past"],
    de: ["geschichte", "antik", "mythos", "legende", "relict", "epoche", "erbe", "erinnerung", "klassik", "vergangen"],
    it: ["storia", "antico", "mito", "leggenda", "reperto", "epoca", "eredita", "memoria", "classico", "passato"],
    es: ["historia", "antiguo", "mito", "leyenda", "relicto", "epoca", "herencia", "memoria", "clasico", "pasado"],
    pt: ["historia", "antigo", "mito", "lenda", "reliquia", "epoca", "heranca", "memoria", "classico", "passado"],
    cs: ["historie", "antika", "mytus", "legenda", "relic", "epocha", "dedictvi", "pamet", "klasika", "minulost"],
    nl: ["geschiedenis", "antiek", "mythe", "legende", "relict", "tijdperk", "erfgoed", "geheugen", "klassiek", "verleden"],
    el: ["istoria", "archaia", "mythos", "thrylos", "relic", "epoxi", "klironomia", "mnimi", "klasiko", "parelthon"],
    hu: ["tortenelem", "okori", "mitosz", "legenda", "ereklye", "korszak", "orokseg", "emlek", "klasszikus", "mult"],
    pl: ["historia", "antyk", "mit", "legenda", "relict", "epoka", "dziedzictwo", "pamiec", "klasyka", "przeszlosc"],
    ro: ["istorie", "antic", "mit", "legenda", "relicva", "epoca", "mostenire", "memorie", "clasic", "trecut"],
    sv: ["historia", "antik", "myt", "legend", "relik", "era", "arv", "minne", "klassisk", "fortid"],
    tr: ["tarih", "antik", "efsane", "mit", "kalinti", "cag", "miras", "bellek", "klasik", "gecmis"],
  },
  default: {
    fr: ["cultive", "savoir", "culture", "evolue", "grandit", "apprend", "progresse", "developpe", "inspire", "eclaire"],
    en: ["culture", "growth", "mindset", "develops", "learns", "evolves", "thrives", "wisdom", "improve", "development"],
    de: ["kultur", "wissen", "wachstum", "entwickelt", "lernt", "klarheit", "staerke", "fortschritt", "inspiriert", "bildung"],
    it: ["cultura", "crescita", "sapere", "evolve", "impara", "mentalita", "sviluppo", "ispira", "migliora", "saggezza"],
    es: ["cultura", "crecimiento", "saber", "evoluciona", "aprende", "mentalidad", "desarrollo", "inspira", "mejora", "sabiduria"],
    pt: ["cultura", "crescimento", "saber", "evolui", "aprende", "mentalidade", "desenvolve", "inspira", "melhora", "sabedoria"],
    cs: ["kultura", "rust", "vedeni", "vyviji", "uci", "mysleni", "rozvoj", "inspiruje", "zlepsuje", "moudrost"],
    nl: ["cultuur", "groei", "kennis", "groeit", "leert", "mindset", "ontwikkeling", "inspireert", "verbetert", "wijsheid"],
    el: ["politismos", "anaptyxi", "gnosi", "exelissetai", "mathainei", "nootropia", "anaptyxi", "empneei", "veltionetai", "sofia"],
    hu: ["kultura", "novekedes", "tudas", "fejlodik", "tanul", "mentalitas", "fejlesztes", "inspirál", "javul", "bolcsesseg"],
    pl: ["kultura", "rozwoj", "wiedza", "ewoluuje", "uczy", "mindset", "rozwoj", "inspiruje", "poprawia", "madrosc"],
    ro: ["cultura", "crestere", "stiinta", "evolueaza", "invata", "mentalitate", "dezvoltare", "inspira", "imbunatateste", "intelepciune"],
    sv: ["kultur", "tillvaxt", "kunskap", "utvecklas", "lar", "mindset", "utveckling", "inspirerar", "forbattrar", "visdom"],
    tr: ["kultur", "buyume", "bilgi", "gelisir", "ogrenir", "zihniyet", "gelisim", "ilham", "gelistirir", "bilgelik"],
  },
};

/** Helper pour initialiser des listes avec accents retirés à la définition. */
function sansAccentsStatic(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Bio par langue (culture générale) — legacy, peu utilisée à la création. */
export const BIO_SECOURS: Record<string, string> = {
  fr: "un peu de culture chaque jour 🧠\nabonne-toi pour apprendre quelque chose de nouveau ✨",
  en: "a little knowledge every day 🧠\nfollow to learn something new ✨",
  de: "jeden tag ein bisschen wissen 🧠\nfolge mir und lerne etwas neues ✨",
  it: "un po' di cultura ogni giorno 🧠\nseguimi per imparare qualcosa di nuovo ✨",
  es: "un poco de cultura cada día 🧠\nsígueme para aprender algo nuevo ✨",
  pt: "um pouco de cultura todo dia 🧠\nsegue para aprender algo novo ✨",
};

export function bioDeSecours(langue: string): string {
  return BIO_SECOURS[langue] ?? BIO_SECOURS.fr;
}

/** Charge le label principal d'un compte (sans embed fragile). */
export async function labelDuCompte(
  supabase: Supabase,
  compteId: string,
): Promise<{ labelId: string; labelNom: string } | null> {
  const { data: cl } = await supabase
    .from("compte_labels")
    .select("label_id")
    .eq("compte_id", compteId)
    .limit(1)
    .maybeSingle();
  const labelId = (cl?.label_id as string | undefined) ?? null;
  if (!labelId) return null;
  const { data: lab } = await supabase
    .from("labels")
    .select("nom, slug")
    .eq("id", labelId)
    .maybeSingle();
  const labelNom = (lab?.nom as string | undefined) ?? (lab?.slug as string | undefined) ?? null;
  if (!labelNom) return { labelId, labelNom: labelId };
  return { labelId, labelNom };
}

function motsCulture(theme: ThemeLabel, langue: string): string[] {
  const parLangue = CULTURE_PAR_THEME[theme] ?? CULTURE_PAR_THEME.default;
  const mots = parLangue[langue] ?? parLangue.en ?? CULTURE_PAR_THEME.default.en;
  return (mots ?? []).filter(Boolean);
}

/** Retire accents et casse : « Raphaël » → « raphael » (pour le @). */
function sansAccents(s: string): string {
  return sansAccentsStatic(s);
}

function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mélange une copie du tableau (Fisher-Yates). */
function melanger<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Génère une identité pour une langue + genre + label (thème du @).
 * 100 % local, aucune IA.
 */
export async function genererIdentite(
  supabase: Supabase,
  langue: string,
  genre: Genre,
  labelNom?: string | null,
): Promise<{ handle: string; nom: string; bio: string }> {
  const jeu = NOMS_PAR_LANGUE[langue] ?? NOMS_PAR_LANGUE.en;
  const prenoms = genre === "homme" ? jeu.prenomsH : jeu.prenomsF;
  const theme = themeDuLabel(labelNom);
  const culture = motsCulture(theme, langue);

  const { data: pris } = await supabase.from("comptes").select("handle_tiktok, persona_nom");
  const sansChiffres = (s: string) => s.replace(/\d+$/, "").toLowerCase();
  const rootsPris = new Set<string>();
  const nomsPris = new Set<string>();
  for (const c of pris ?? []) {
    if (c.handle_tiktok) rootsPris.add(sansChiffres(c.handle_tiktok));
    if (c.persona_nom) nomsPris.add(c.persona_nom.toLowerCase());
  }

  let prenom = prenoms[0] ?? "alex";
  let root = "";
  for (const p of melanger(prenoms)) {
    for (const mot of melanger(culture)) {
      const r = `${sansAccents(p)}.${mot}`;
      if (!rootsPris.has(r)) {
        prenom = p;
        root = r;
        break;
      }
    }
    if (root) break;
  }
  if (!root) {
    prenom = melanger(prenoms)[0] ?? "alex";
    root = `${sansAccents(prenom)}.${melanger(culture)[0] ?? "culture"}`;
  }

  let nomAffiche = `${capitaliser(prenom)} ${capitaliser(jeu.noms[0] ?? "martin")}`;
  for (const nf of melanger(jeu.noms)) {
    const candidat = `${capitaliser(prenom)} ${capitaliser(nf)}`;
    if (!nomsPris.has(candidat.toLowerCase())) {
      nomAffiche = candidat;
      break;
    }
  }

  const handle = `${root}${Math.floor(Math.random() * 900) + 100}`;
  const age = Math.floor(Math.random() * 11) + 20;
  const bio = `${capitaliser(prenom)} ${age}`;
  return { handle, nom: nomAffiche, bio };
}

/**
 * Pose une identité complète (pseudo + nom + bio + avatar) sur un compte.
 * Label → genre (H/F) + thème du @ + PDP ; langue → prénoms/mots.
 * `labelHint` évite une relecture juste après l'insert compte_labels.
 */
export async function appliquerIdentiteInstantanee(
  supabase: Supabase,
  compteId: string,
  labelHint?: { labelId: string | null; labelNom?: string | null },
): Promise<{ applique: boolean; handle: string | null }> {
  const { data: compte, error } = await supabase
    .from("comptes")
    .select("*, comptes_reference(genre)")
    .eq("id", compteId)
    .single();
  if (error || !compte) return { applique: false, handle: null };

  let labelId = labelHint?.labelId ?? null;
  let labelNom = labelHint?.labelNom ?? null;
  if (!labelId || !labelNom) {
    const lab = await labelDuCompte(supabase, compteId);
    labelId = labelId ?? lab?.labelId ?? null;
    labelNom = labelNom ?? lab?.labelNom ?? null;
  } else if (labelId && !labelNom) {
    const { data: lab } = await supabase
      .from("labels")
      .select("nom, slug")
      .eq("id", labelId)
      .maybeSingle();
    labelNom = (lab?.nom as string | undefined) ?? (lab?.slug as string | undefined) ?? null;
  }

  // deno-lint-ignore no-explicit-any
  const genreSource: Genre =
    (compte as any).comptes_reference?.genre === "homme" ? "homme" : "femme";
  // Label genré gagne TOUJOURS (alpha_male → homme, clean_girl → femme).
  const genre = genreDuLabel(labelNom) ?? genreSource;

  const identite = await genererIdentite(supabase, compte.langue, genre, labelNom);
  const avatar = await avatarPourCompte(supabase, {
    compteReferenceId: compte.compte_reference_id,
    labelId,
    labelNom,
  });

  await supabase
    .from("comptes")
    .update({
      handle_tiktok: compte.handle_tiktok ?? identite.handle,
      persona_nom: compte.persona_nom ?? identite.nom,
      persona_bio: compte.persona_bio ?? identite.bio,
      avatar_url: compte.avatar_url ?? avatar?.url ?? null,
      avatar_source: compte.avatar_url ? compte.avatar_source : avatar ? "bibliotheque" : null,
    })
    .eq("id", compteId);

  if (avatar?.id && !compte.avatar_url) {
    await supabase
      .from("media_library")
      .update({ used_count: avatar.used_count + 1 })
      .eq("id", avatar.id);
  }

  return { applique: true, handle: identite.handle };
}
