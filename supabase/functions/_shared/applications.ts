export const SLUG_SOPHIA = "sophia";
export const SLUG_MICABO = "micabo";

export type ApplicationRow = {
  id: string;
  slug: string;
  nom: string;
};

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

export function normaliserSlug(valeur: unknown): string {
  return String(valeur ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function estSlugSophia(slug: string | null | undefined): boolean {
  return (slug ?? SLUG_SOPHIA) === SLUG_SOPHIA;
}

/**
 * Application d'un import : la source l'emporte toujours, puis l'id explicite
 * (lien isolé), puis Sophia. Un compte Micabo ne doit jamais retomber sur Sophia.
 */
export function resoudreApplicationImport(opts: {
  sourceApplicationId?: string | null;
  explicitApplicationId?: string | null;
  fallbackId: string;
}): string {
  const source = String(opts.sourceApplicationId ?? "").trim();
  if (source) return source;
  const explicit = String(opts.explicitApplicationId ?? "").trim();
  if (explicit) return explicit;
  return opts.fallbackId;
}

export function clePromptPertinence(slug: string | null | undefined): string {
  return estSlugSophia(slug) ? "pertinence" : `pertinence_${normaliserSlug(slug)}`;
}

export function clePromptPlacement(slug: string | null | undefined): string {
  return estSlugSophia(slug) ? "placement_sophia" : `placement_${normaliserSlug(slug)}`;
}

export function placementParDefaut(langue: string, slug = SLUG_SOPHIA): string {
  if (slug === SLUG_MICABO) {
    const par: Record<string, string> = {
      fr: "transforme tes cours en flashcards et révise 10 minutes par jour. micabo est top pour ça, il les crée à partir de tes notes.",
      en: "turn your notes into flashcards and review 10 minutes a day. micabo is great for that, it builds them from your notes.",
      de: "mach aus deinen notizen flashcards und wiederhole 10 minuten am tag. micabo ist super dafür, es erstellt sie aus deinen unterlagen.",
      es: "pasa tus apuntes a flashcards y repasa 10 minutos al día. micabo va genial para eso, las crea desde tus notas.",
      it: "trasforma i tuoi appunti in flashcards e ripassa 10 minuti al giorno. micabo è top per questo, le crea dalle tue note.",
    };
    return par[langue] ?? par.en;
  }
  const par: Record<string, string> = {
    fr: "Envie d'en apprendre plus chaque jour ? L'appli Sophia t'apprend une culture générale de dingue en quelques minutes. Teste-la 👀",
    en: "Want to learn something new every day? The Sophia app teaches you wild general knowledge in minutes. Give it a try 👀",
    es: "¿Quieres aprender algo nuevo cada día? La app Sophia te enseña cultura general increíble en minutos. Pruébala 👀",
    de: "Lust, jeden Tag etwas Neues zu lernen? Die Sophia-App bringt dir in wenigen Minuten richtig gutes Allgemeinwissen bei. Probier's aus 👀",
    it: "Vuoi imparare qualcosa di nuovo ogni giorno? L'app Sophia ti insegna una cultura generale pazzesca in pochi minuti. Provala 👀",
    pt: "Queres aprender algo novo todos os dias? A app Sophia ensina-te cultura geral incrível em poucos minutos. Experimenta 👀",
    cs: "Chceš se každý den naučit něco nového? Aplikace Sophia tě naučí skvělé všeobecné znalosti za pár minut. Vyzkoušej ji 👀",
    nl: "Wil je elke dag iets nieuws leren? De Sophia-app leert je in een paar minuten waanzinnige algemene kennis. Probeer het 👀",
    el: "Θέλεις να μαθαίνεις κάτι νέο κάθε μέρα; Η εφαρμογή Sophia σου μαθαίνει απίστευτη γενική γνώση σε λίγα λεπτά. Δοκίμασέ την 👀",
    hu: "Szeretnél minden nap valami újat tanulni? A Sophia app perceken belül vad általános műveltséget ad. Próbáld ki 👀",
    pl: "Chcesz codziennie uczyć się czegoś nowego? Aplikacja Sophia uczy szalonej wiedzy ogólnej w kilka minut. Wypróbuj 👀",
    ro: "Vrei să înveți ceva nou în fiecare zi? Aplicația Sophia te învață cultură generală tare în câteva minute. Încearc-o 👀",
    sv: "Vill du lära dig något nytt varje dag? Sophia-appen lär dig galen allmänbildning på några minuter. Testa den 👀",
    tr: "Her gün yeni bir şey öğrenmek ister misin? Sophia uygulaması dakikalar içinde efsane genel kültür öğretir. Dene 👀",
    da: "Vil du lære noget nyt hver dag? Sophia-appen giver dig vild almen viden på et par minutter. Prøv den 👀",
    no: "Vil du lære noe nytt hver dag? Sophia-appen lærer deg vanvittig allmennkunnskap på noen minutter. Prøv den 👀",
    ru: "Хочешь узнавать что-то новое каждый день? Приложение Sophia даёт бешеную эрудицию за пару минут. Попробуй 👀",
    hr: "Želiš učiti nešto novo svaki dan? Aplikacija Sophia te nauči ludu opću kulturu u par minuta. Isprobaj 👀",
    sl: "Želiš vsak dan izvedeti kaj novega? Aplikacija Sophia te v nekaj minutah nauči noro splošno izobrazbo. Preizkusi 👀",
    sk: "Chceš sa každý deň naučiť niečo nové? Aplikácia Sophia ťa naučí skvelé všeobecné znalosti za pár minút. Vyskúšaj 👀",
    sr: "Želiš da učiš nešto novo svaki dan? Aplikacija Sophia te nauči luda opšta znanja za par minuta. Isprobaj 👀",
    ar: "هل تريد أن تتعلم شيئا جديدا كل يوم؟ تطبيق Sophia يعلمك ثقافة عامة رائعة في دقائق. جربه 👀",
    he: "רוצה ללמוד משהו חדש כל יום? האפליקציה Sophia מלמדת אותך ידע כללי מטורף תוך דקות. נסה אותה 👀",
    fi: "Haluatko oppia jotain uutta joka päivä? Sophia-sovellus opettaa villin yleissivistyksen muutamassa minuutissa. Kokeile 👀",
    et: "Tahad iga päev midagi uut õppida? Sophia äpp õpetab meeletut üldharidust paari minutiga. Proovi 👀",
  };
  return par[langue] ?? par.en;
}

export async function applicationParSlug(
  supabase: Supabase,
  slug: unknown,
): Promise<ApplicationRow | null> {
  const cle = normaliserSlug(slug) || SLUG_SOPHIA;
  const { data } = await supabase
    .from("applications")
    .select("id, slug, nom")
    .eq("slug", cle)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

export async function applicationParId(
  supabase: Supabase,
  id: string | null | undefined,
): Promise<ApplicationRow | null> {
  if (!id) return applicationParSlug(supabase, SLUG_SOPHIA);
  const { data } = await supabase
    .from("applications")
    .select("id, slug, nom")
    .eq("id", id)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

export async function applicationSophia(supabase: Supabase): Promise<ApplicationRow> {
  const app = await applicationParSlug(supabase, SLUG_SOPHIA);
  if (!app) throw new Error("Application Sophia introuvable");
  return app;
}

export async function resoudreApplication(
  supabase: Supabase,
  input: { application_id?: unknown; application_slug?: unknown },
): Promise<ApplicationRow> {
  const id = String(input.application_id ?? "").trim();
  if (id) {
    const parId = await applicationParId(supabase, id);
    if (parId) return parId;
  }
  const slug = normaliserSlug(input.application_slug);
  if (slug) {
    const parSlug = await applicationParSlug(supabase, slug);
    if (parSlug) return parSlug;
  }
  return applicationSophia(supabase);
}
