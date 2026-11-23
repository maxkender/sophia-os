/**
 * Bio d'un compte : courte, à la première personne, comme celle d'une vraie
 * personne (jamais « abonne-toi »). Elle se compose d'un prénom, d'un âge ou
 * d'une année de naissance, d'un emoji et d'une phrase dans la langue du
 * compte, assemblés selon une forme tirée au hasard.
 *
 * Les phrases n'accordent ni adjectif ni verbe au genre : la même sert aux
 * comptes homme et femme.
 */
import type { ThemeMots } from "./label_theme.ts";

export type FamilleBio = "savoir" | "discipline" | "etude" | "carriere" | "running" | "art" | "quotidien";

/** TikTok coupe une bio à 80 caractères. */
export const BIO_MAX = 80;

/** Part des bios de running qui parlent vraiment de course ; les autres parlent de tout et de rien. */
const PART_BIO_RUNNING = 0.35;

/**
 * Les bios d'art (23/11) : une sur deux parle d'art, une sur trois de la vie
 * de tous les jours, le reste de curiosité (`savoir`). Trente comptes Artura
 * qui disent tous « un tableau par jour » se reconnaîtraient.
 */
const PART_BIO_ART = 0.5;
const PART_BIO_ART_QUOTIDIEN = 0.33;

/**
 * La famille de phrases d'une bio. Le running est le seul thème partagé en
 * deux (19/11) : une bio sur trois parle de course, les autres de la vie de
 * tous les jours (`quotidien`), pour que les comptes Atala ne récitent pas
 * tous « un kilomètre à la fois ». Sans `hasard`, la famille du thème.
 */
export function familleBio(theme: ThemeMots, hasard?: () => number): FamilleBio {
  if (theme === "alpha_male") return "discipline";
  if (theme === "etude") return "etude";
  if (theme === "carriere") return "carriere";
  if (theme === "running") return !hasard || hasard() < PART_BIO_RUNNING ? "running" : "quotidien";
  if (theme === "art") {
    if (!hasard) return "art";
    const r = hasard();
    if (r < PART_BIO_ART) return "art";
    return r < PART_BIO_ART + PART_BIO_ART_QUOTIDIEN ? "quotidien" : "savoir";
  }
  return "savoir";
}

export const EMOJIS_BIO: Record<FamilleBio, string[]> = {
  savoir: ["📚", "🧠", "✨", "📖", "☕", "🕯️", "🖋️", "🌙", "🤍", "🎧"],
  discipline: ["⚡", "🔥", "🏔️", "♟️", "🖤", "⏳", "🥊", "🧠", "📈", "🌑"],
  etude: ["📚", "✏️", "☕", "🎧", "📝", "🤍", "🌷", "💻", "🧸", "📓"],
  carriere: ["💼", "☕", "📈", "💻", "🗂️", "✨", "🤍", "📌", "🧠", "🖇️"],
  running: ["🏃", "👟", "🌅", "⏱️", "🏁", "💨", "🤍", "☀️", "🎧", "🌿"],
  art: ["🎨", "🖼️", "🏛️", "🖌️", "✨", "🤍", "☕", "🕯️", "🌙", "🌻"],
  quotidien: ["☕", "🌿", "🤍", "✨", "🎧", "🌙", "☀️", "📸", "🫶", "🍋"],
};

export const PHRASES_BIO: Record<string, Record<FamilleBio, string[]>> = {
  fr: {
    savoir: ["j'apprends un truc par jour", "toujours un livre dans le sac", "curiosité sans limite", "je lis plus que je ne dors", "un jour, une idée"],
    discipline: ["un peu mieux chaque jour", "la discipline avant la motivation", "5h du mat, pas d'excuses", "en construction"],
    etude: ["team bibliothèque", "café, fiches, on recommence", "en révisions permanentes", "objectif : mention"],
    carriere: ["le boulot, sans langue de bois", "ce qu'on ne te dit pas en entretien", "la vie de bureau, la vraie"],
    running: ["un kilomètre à la fois", "je cours pour respirer", "en prépa semi", "sorties longues du dimanche"],
    art: ["un tableau par jour", "musées le dimanche", "j'apprends à regarder", "l'histoire derrière chaque tableau", "team impressionnistes", "un musée, un café, une idée", "les détails qu'on ne voit pas"],
    quotidien: ["un peu de tout", "ici c'est ma vie", "café glacé toute l'année", "je poste ce que j'aime", "team dimanche matin"],
  },
  en: {
    savoir: ["learning one thing a day", "always a book in my bag", "curious about everything", "reading more than sleeping", "one idea a day"],
    discipline: ["1% better every day", "discipline over motivation", "5am, no excuses", "work in progress"],
    etude: ["library regular", "coffee, flashcards, repeat", "permanently revising", "romanticising my study life"],
    carriere: ["work life, no sugarcoating", "what they don't tell you in interviews", "office life, the real one"],
    running: ["one mile at a time", "running to clear my head", "training for my first half", "sunday long runs"],
    art: ["one painting a day", "museums on sundays", "learning to really look", "the story behind the painting", "impressionism enjoyer", "museum, coffee, repeat", "art history, the fun way"],
    quotidien: ["a bit of everything", "just my life", "iced coffee all year", "posting what i like", "sunday morning person"],
  },
  de: {
    savoir: ["jeden tag etwas neues lernen", "immer ein buch in der tasche", "neugierig auf alles", "lese mehr als ich schlafe", "eine idee pro tag"],
    discipline: ["jeden tag 1% besser", "disziplin schlägt motivation", "5 uhr, keine ausreden", "work in progress"],
    etude: ["stammgast in der bib", "kaffee, karteikarten, repeat", "dauerhaft am lernen", "ziel: bestehen"],
    carriere: ["arbeitsleben, ungeschönt", "was dir im vorstellungsgespräch keiner sagt", "büroalltag, ganz ehrlich"],
    running: ["ein kilometer nach dem anderen", "laufen macht den kopf frei", "training für den ersten halbmarathon", "sonntags lange läufe"],
    art: ["ein gemälde pro tag", "sonntags ins museum", "ich lerne, richtig hinzusehen", "die geschichte hinter dem bild", "team impressionismus", "museum, kaffee, repeat", "kunstgeschichte ohne fachchinesisch"],
    quotidien: ["ein bisschen von allem", "einfach mein leben", "eiskaffee das ganze jahr", "ich poste, was ich mag", "team sonntagmorgen"],
  },
  it: {
    savoir: ["imparo una cosa al giorno", "sempre un libro in borsa", "curiosità senza limiti", "leggo più di quanto dormo", "un'idea al giorno"],
    discipline: ["ogni giorno un po' meglio", "disciplina prima della motivazione", "sveglia alle 5, niente scuse", "lavori in corso"],
    etude: ["vivo in biblioteca", "caffè, appunti, ripeti", "sempre in sessione", "obiettivo: 30 e lode"],
    carriere: ["il lavoro, senza filtri", "quello che non ti dicono ai colloqui", "vita d'ufficio, quella vera"],
    running: ["un chilometro alla volta", "correre per respirare", "mi alleno per la prima mezza", "lunghi della domenica"],
    art: ["un quadro al giorno", "la domenica al museo", "imparo a guardare davvero", "la storia dietro ogni quadro", "team impressionismo", "museo, caffè, ripeti", "storia dell'arte senza paroloni"],
    quotidien: ["un po' di tutto", "semplicemente la mia vita", "caffè freddo tutto l'anno", "posto quello che mi piace", "team domenica mattina"],
  },
  es: {
    savoir: ["aprendo algo nuevo cada día", "siempre con un libro en el bolso", "curiosidad sin límites", "leo más de lo que duermo", "una idea al día"],
    discipline: ["un poco mejor cada día", "disciplina antes que motivación", "5 am, sin excusas", "en construcción"],
    etude: ["vivo en la biblioteca", "café, apuntes y repetir", "siempre de exámenes", "objetivo: matrícula"],
    carriere: ["el trabajo, sin filtros", "lo que no te cuentan en las entrevistas", "vida de oficina, la de verdad"],
    running: ["un kilómetro cada vez", "correr para respirar", "entrenando para mi primera media", "tiradas largas de domingo"],
    art: ["un cuadro al día", "museos los domingos", "aprendiendo a mirar de verdad", "la historia detrás de cada cuadro", "team impresionismo", "museo, café y repetir", "historia del arte sin rollos"],
    quotidien: ["un poco de todo", "simplemente mi vida", "café con hielo todo el año", "subo lo que me gusta", "team domingo por la mañana"],
  },
  "es-419": {
    savoir: ["aprendo algo nuevo cada día", "siempre con un libro en la mochila", "curiosidad sin límites", "leo más de lo que duermo", "una idea al día"],
    discipline: ["un poco mejor cada día", "disciplina antes que motivación", "5 am, sin excusas", "en construcción"],
    etude: ["vivo en la biblioteca", "café, apuntes y repetir", "siempre en exámenes", "objetivo: puro 10"],
    carriere: ["el trabajo, sin filtros", "lo que no te dicen en las entrevistas", "vida de oficina, la real"],
    running: ["un kilómetro a la vez", "correr para respirar", "entrenando para mi primer medio maratón", "fondos de domingo"],
    art: ["un cuadro al día", "museos los domingos", "aprendiendo a mirar de verdad", "la historia detrás de cada cuadro", "team impresionismo", "museo, cafecito y repetir", "historia del arte sin complicarse"],
    quotidien: ["un poco de todo", "simplemente mi vida", "café helado todo el año", "subo lo que me gusta", "team domingo en la mañana"],
  },
  pt: {
    savoir: ["aprendo uma coisa por dia", "sempre com um livro na mala", "curiosidade sem limites", "leio mais do que durmo", "uma ideia por dia"],
    discipline: ["um pouco melhor a cada dia", "disciplina antes da motivação", "5 da manhã, sem desculpas", "em construção"],
    etude: ["moro na biblioteca", "café, apontamentos, repetir", "sempre em época de exames", "objetivo: 20 valores"],
    carriere: ["o trabalho, sem filtros", "o que não te dizem nas entrevistas", "vida de escritório, a real"],
    running: ["um quilómetro de cada vez", "correr para respirar", "a treinar para a primeira meia", "longos de domingo"],
    art: ["um quadro por dia", "museus ao domingo", "a aprender a olhar a sério", "a história por trás de cada quadro", "team impressionismo", "museu, café, repetir", "história da arte sem complicar"],
    quotidien: ["um pouco de tudo", "simplesmente a minha vida", "café gelado o ano todo", "publico o que gosto", "team domingo de manhã"],
  },
  "pt-BR": {
    savoir: ["aprendo uma coisa por dia", "sempre com um livro na bolsa", "curiosidade sem limites", "leio mais do que durmo", "uma ideia por dia"],
    discipline: ["um pouco melhor a cada dia", "disciplina antes da motivação", "5 da manhã, sem desculpas", "em construção"],
    etude: ["moro na biblioteca", "café, resumos, repete", "sempre em semana de prova", "objetivo: passar em tudo"],
    carriere: ["o trabalho, sem filtro", "o que não te contam nas entrevistas", "vida de escritório, a real"],
    running: ["um quilômetro de cada vez", "correr pra respirar", "treinando pra primeira meia", "longão de domingo"],
    art: ["um quadro por dia", "museu no domingo", "aprendendo a olhar de verdade", "a história por trás de cada quadro", "team impressionismo", "museu, café, repete", "história da arte sem complicação"],
    quotidien: ["um pouco de tudo", "só a minha vida", "café gelado o ano todo", "posto o que eu gosto", "time domingo de manhã"],
  },
  cs: {
    savoir: ["každý den něco nového", "vždycky s knížkou v tašce", "zvědavost bez hranic", "čtu víc než spím", "jeden nápad denně"],
    discipline: ["každý den o kousek líp", "disciplína před motivací", "5 ráno, žádné výmluvy", "na cestě"],
    etude: ["bydlím v knihovně", "káva, poznámky a znovu", "věčně ve zkouškovém", "cíl: samé jedničky"],
    carriere: ["práce bez příkras", "co vám na pohovoru neřeknou", "život v kanclu, ten skutečný"],
    running: ["kilometr po kilometru", "běh mi čistí hlavu", "trénink na první půlmaraton", "nedělní dlouhé běhy"],
    art: ["jeden obraz denně", "v neděli do galerie", "učím se opravdu dívat", "příběh za každým obrazem", "team impresionismus", "galerie, káva, repeat"],
    quotidien: ["od všeho trochu", "prostě můj život", "ledová káva celý rok", "sdílím, co mě baví", "tým nedělní ráno"],
  },
  nl: {
    savoir: ["elke dag iets nieuws leren", "altijd een boek in mijn tas", "nieuwsgierig naar alles", "ik lees meer dan ik slaap", "één idee per dag"],
    discipline: ["elke dag 1% beter", "discipline boven motivatie", "5 uur 's ochtends, geen excuses", "work in progress"],
    etude: ["vaste gast in de bieb", "koffie, samenvatten, repeat", "altijd tentamenweek", "doel: alles halen"],
    carriere: ["werk, zonder filter", "wat ze je niet vertellen bij een sollicitatie", "het echte kantoorleven"],
    running: ["kilometer voor kilometer", "lopen maakt mijn hoofd leeg", "in training voor mijn eerste halve", "lange duurlopen op zondag"],
    art: ["elke dag één schilderij", "zondag naar het museum", "ik leer echt kijken", "het verhaal achter elk schilderij", "team impressionisme", "museum, koffie, repeat"],
    quotidien: ["een beetje van alles", "gewoon mijn leven", "ijskoffie het hele jaar", "ik post wat ik leuk vind", "team zondagochtend"],
  },
  el: {
    savoir: ["μαθαίνω κάτι νέο κάθε μέρα", "πάντα με ένα βιβλίο στην τσάντα", "περιέργεια χωρίς όρια", "διαβάζω πιο πολύ απ' όσο κοιμάμαι", "μια ιδέα τη μέρα"],
    discipline: ["λίγο καλύτερα κάθε μέρα", "πειθαρχία πριν από το κίνητρο", "5 το πρωί, χωρίς δικαιολογίες", "υπό κατασκευή"],
    etude: ["μένω στη βιβλιοθήκη", "καφές, σημειώσεις, ξανά", "μόνιμα σε εξεταστική", "στόχος: πτυχίο"],
    carriere: ["η δουλειά, χωρίς φίλτρα", "όσα δεν σου λένε στις συνεντεύξεις", "η ζωή στο γραφείο, η αληθινή"],
    running: ["ένα χιλιόμετρο τη φορά", "το τρέξιμο αδειάζει το μυαλό", "προπόνηση για τον πρώτο ημιμαραθώνιο", "μεγάλα τρεξίματα την κυριακή"],
    art: ["ένας πίνακας τη μέρα", "κυριακή στο μουσείο", "μαθαίνω να κοιτάζω αληθινά", "η ιστορία πίσω από κάθε πίνακα", "team ιμπρεσιονισμός", "μουσείο, καφές, ξανά"],
    quotidien: ["λίγο απ' όλα", "απλώς η ζωή μου", "φρέντο όλο τον χρόνο", "ανεβάζω ό,τι μου αρέσει", "ομάδα κυριακάτικο πρωινό"],
  },
  hu: {
    savoir: ["minden nap tanulok valami újat", "mindig van nálam egy könyv", "kíváncsiság határok nélkül", "többet olvasok, mint alszom", "napi egy gondolat"],
    discipline: ["minden nap egy kicsit jobb", "fegyelem a motiváció előtt", "reggel 5, nincs kifogás", "folyamatban"],
    etude: ["a könyvtárban lakom", "kávé, jegyzetek, újra", "örök vizsgaidőszak", "cél: csupa ötös"],
    carriere: ["a munka, szépítés nélkül", "amit az állásinterjún nem mondanak el", "irodai élet, az igazi"],
    running: ["egyszerre egy kilométer", "a futás kitisztítja a fejem", "készülök az első félmaratonra", "vasárnapi hosszú futások"],
    art: ["minden nap egy festmény", "vasárnap múzeum", "tanulok igazán nézni", "a történet minden kép mögött", "team impresszionizmus", "múzeum, kávé, repeat"],
    quotidien: ["egy kicsit mindenből", "csak az életem", "jegeskávé egész évben", "azt posztolom, amit szeretek", "vasárnap reggel csapat"],
  },
  pl: {
    savoir: ["codziennie uczę się czegoś nowego", "zawsze z książką w torbie", "ciekawość bez granic", "czytam więcej niż śpię", "jedna myśl dziennie"],
    discipline: ["każdego dnia trochę lepiej", "dyscyplina przed motywacją", "5 rano, zero wymówek", "w budowie"],
    etude: ["mieszkam w bibliotece", "kawa, notatki, powtórka", "wieczna sesja", "cel: same piątki"],
    carriere: ["praca bez ściemy", "czego nie mówią na rozmowach o pracę", "życie w biurze, to prawdziwe"],
    running: ["kilometr po kilometrze", "bieganie czyści głowę", "trening do pierwszego półmaratonu", "niedzielne długie wybiegania"],
    art: ["jeden obraz dziennie", "niedziele w muzeum", "uczę się naprawdę patrzeć", "historia za każdym obrazem", "team impresjonizm", "muzeum, kawa, powtórz"],
    quotidien: ["wszystkiego po trochu", "po prostu moje życie", "mrożona kawa cały rok", "wrzucam to, co lubię", "team niedzielny poranek"],
  },
  ro: {
    savoir: ["învăț ceva nou în fiecare zi", "mereu cu o carte în geantă", "curiozitate fără limite", "citesc mai mult decât dorm", "o idee pe zi"],
    discipline: ["puțin mai bine în fiecare zi", "disciplină înainte de motivație", "5 dimineața, fără scuze", "în construcție"],
    etude: ["locuiesc la bibliotecă", "cafea, notițe, de la capăt", "mereu în sesiune", "obiectiv: nota 10"],
    carriere: ["munca, fără filtre", "ce nu ți se spune la interviu", "viața de birou, cea reală"],
    running: ["câte un kilometru pe rând", "alerg ca să-mi limpezesc mintea", "antrenament pentru primul semimaraton", "alergări lungi de duminică"],
    art: ["un tablou pe zi", "duminica la muzeu", "învăț să privesc cu adevărat", "povestea din spatele fiecărui tablou", "team impresionism", "muzeu, cafea, repeat"],
    quotidien: ["câte puțin din toate", "pur și simplu viața mea", "cafea cu gheață tot anul", "postez ce îmi place", "echipa duminică dimineața"],
  },
  sv: {
    savoir: ["lär mig något nytt varje dag", "alltid en bok i väskan", "nyfiken på allt", "läser mer än jag sover", "en idé om dagen"],
    discipline: ["lite bättre varje dag", "disciplin före motivation", "klockan 5, inga ursäkter", "work in progress"],
    etude: ["bor på biblioteket", "kaffe, anteckningar, repeat", "ständigt i tentaplugg", "mål: klara allt"],
    carriere: ["jobbet, utan filter", "det ingen säger på intervjun", "kontorslivet, på riktigt"],
    running: ["en kilometer i taget", "löpning rensar huvudet", "tränar för min första halvmara", "långpass på söndagar"],
    art: ["en tavla om dagen", "museum på söndagar", "lär mig att verkligen titta", "historien bakom varje tavla", "team impressionism", "museum, kaffe, repeat"],
    quotidien: ["lite av allt", "bara mitt liv", "iskaffe året runt", "lägger upp det jag gillar", "team söndagsmorgon"],
  },
  tr: {
    savoir: ["her gün yeni bir şey öğreniyorum", "çantamda hep bir kitap var", "sınırsız merak", "uyuduğumdan çok okuyorum", "günde bir fikir"],
    discipline: ["her gün biraz daha iyi", "motivasyon değil disiplin", "sabah 5, bahane yok", "yapım aşamasında"],
    etude: ["kütüphanede yaşıyorum", "kahve, notlar, tekrar", "hep sınav haftası", "hedef: tam not"],
    carriere: ["iş hayatı, filtresiz", "mülakatta söylenmeyenler", "ofis hayatı, gerçek hali"],
    running: ["her seferinde bir kilometre", "koşmak kafamı boşaltıyor", "ilk yarı maratonuma hazırlanıyorum", "pazar uzun koşuları"],
    art: ["her gün bir tablo", "pazar günleri müze", "gerçekten bakmayı öğreniyorum", "her tablonun arkasındaki hikaye", "team empresyonizm", "müze, kahve, tekrar"],
    quotidien: ["her şeyden biraz", "sadece hayatım", "yaz kış buzlu kahve", "sevdiğim şeyleri paylaşıyorum", "pazar sabahı takımı"],
  },
  da: {
    savoir: ["lærer noget nyt hver dag", "altid en bog i tasken", "nysgerrig på alt", "læser mere end jeg sover", "én idé om dagen"],
    discipline: ["lidt bedre hver dag", "disciplin før motivation", "klokken 5, ingen undskyldninger", "work in progress"],
    etude: ["bor på biblioteket", "kaffe, noter, repeat", "altid i eksamensperiode", "mål: 12-taller"],
    carriere: ["arbejdslivet, uden filter", "det ingen siger til jobsamtalen", "kontorlivet, det ægte"],
    running: ["en kilometer ad gangen", "løb renser hovedet", "træner til mit første halvmaraton", "lange ture om søndagen"],
    art: ["et maleri om dagen", "museum om søndagen", "lærer at se rigtigt efter", "historien bag hvert maleri", "team impressionisme", "museum, kaffe, repeat"],
    quotidien: ["lidt af det hele", "bare mit liv", "iskaffe hele året", "poster det, jeg kan lide", "team søndag morgen"],
  },
  no: {
    savoir: ["lærer noe nytt hver dag", "alltid en bok i veska", "nysgjerrig på alt", "leser mer enn jeg sover", "én idé om dagen"],
    discipline: ["litt bedre hver dag", "disiplin før motivasjon", "klokka 5, ingen unnskyldninger", "work in progress"],
    etude: ["bor på biblioteket", "kaffe, notater, repeat", "alltid i eksamenstid", "mål: bare a-er"],
    carriere: ["arbeidslivet, uten filter", "det ingen sier på jobbintervjuet", "kontorlivet, det ekte"],
    running: ["en kilometer om gangen", "løping rydder hodet", "trener til min første halvmaraton", "langturer på søndager"],
    art: ["ett maleri om dagen", "museum på søndager", "lærer å virkelig se", "historien bak hvert maleri", "team impresjonisme", "museum, kaffe, repeat"],
    quotidien: ["litt av alt", "bare livet mitt", "iskaffe hele året", "poster det jeg liker", "team søndag morgen"],
  },
  ru: {
    savoir: ["каждый день узнаю что-то новое", "всегда с книгой в сумке", "любопытство без границ", "читаю больше, чем сплю", "одна идея в день"],
    discipline: ["каждый день чуть лучше", "дисциплина важнее мотивации", "5 утра, без оправданий", "в процессе"],
    etude: ["живу в библиотеке", "кофе, конспекты, повтор", "вечная сессия", "цель: красный диплом"],
    carriere: ["работа без прикрас", "о чём молчат на собеседованиях", "офисная жизнь как она есть"],
    running: ["километр за километром", "бег очищает голову", "готовлюсь к первому полумарафону", "длинные пробежки по воскресеньям"],
    art: ["одна картина в день", "по воскресеньям в музей", "учусь по-настоящему смотреть", "история за каждой картиной", "team импрессионизм", "музей, кофе, повторить"],
    quotidien: ["всего понемногу", "просто моя жизнь", "айс-кофе круглый год", "выкладываю то, что люблю", "команда воскресного утра"],
  },
  hr: {
    savoir: ["svaki dan naučim nešto novo", "uvijek s knjigom u torbi", "znatiželja bez granica", "čitam više nego što spavam", "jedna ideja dnevno"],
    discipline: ["svaki dan malo bolje", "disciplina prije motivacije", "5 ujutro, bez izgovora", "u izgradnji"],
    etude: ["živim u knjižnici", "kava, bilješke, ponovi", "vječni ispitni rok", "cilj: same petice"],
    carriere: ["posao, bez filtera", "što ti ne kažu na razgovoru za posao", "uredski život, onaj pravi"],
    running: ["kilometar po kilometar", "trčanje mi čisti glavu", "treniram za prvi polumaraton", "nedjeljne duge dionice"],
    art: ["jedna slika dnevno", "nedjeljom u muzej", "učim stvarno gledati", "priča iza svake slike", "team impresionizam", "muzej, kava, ponovi"],
    quotidien: ["svega pomalo", "jednostavno moj život", "ledena kava cijelu godinu", "objavljujem što volim", "tim nedjeljno jutro"],
  },
  sl: {
    savoir: ["vsak dan se naučim nekaj novega", "vedno s knjigo v torbi", "radovednost brez meja", "berem več kot spim", "ena ideja na dan"],
    discipline: ["vsak dan malo bolje", "disciplina pred motivacijo", "ob petih zjutraj, brez izgovorov", "v izdelavi"],
    etude: ["živim v knjižnici", "kava, zapiski, ponovi", "večno izpitno obdobje", "cilj: same desetke"],
    carriere: ["služba, brez filtra", "česar ti ne povedo na razgovoru", "pisarniško življenje, tisto pravo"],
    running: ["kilometer za kilometrom", "tek mi zbistri glavo", "treniram za prvi polmaraton", "nedeljski dolgi teki"],
    art: ["ena slika na dan", "ob nedeljah v muzej", "učim se zares gledati", "zgodba za vsako sliko", "team impresionizem", "muzej, kava, ponovi"],
    quotidien: ["vsega po malem", "preprosto moje življenje", "ledena kava vse leto", "objavljam, kar mi je všeč", "ekipa nedeljsko jutro"],
  },
  sk: {
    savoir: ["každý deň niečo nové", "vždy s knihou v taške", "zvedavosť bez hraníc", "čítam viac, ako spím", "jedna myšlienka denne"],
    discipline: ["každý deň o kúsok lepšie", "disciplína pred motiváciou", "5 ráno, žiadne výhovorky", "na ceste"],
    etude: ["bývam v knižnici", "káva, poznámky a znova", "večne v skúškovom", "cieľ: samé jednotky"],
    carriere: ["práca bez príkras", "čo vám na pohovore nepovedia", "život v kancli, ten skutočný"],
    running: ["kilometer po kilometri", "beh mi čistí hlavu", "tréning na prvý polmaratón", "nedeľné dlhé behy"],
    art: ["jeden obraz denne", "v nedeľu do galérie", "učím sa naozaj pozerať", "príbeh za každým obrazom", "team impresionizmus", "galéria, káva, repeat"],
    quotidien: ["zo všetkého trochu", "jednoducho môj život", "ľadová káva celý rok", "zdieľam, čo ma baví", "tím nedeľné ráno"],
  },
  sr: {
    savoir: ["svaki dan naučim nešto novo", "uvek sa knjigom u torbi", "radoznalost bez granica", "čitam više nego što spavam", "jedna ideja dnevno"],
    discipline: ["svaki dan malo bolje", "disciplina pre motivacije", "5 ujutru, bez izgovora", "u izgradnji"],
    etude: ["živim u biblioteci", "kafa, beleške, ponovi", "večiti ispitni rok", "cilj: sve desetke"],
    carriere: ["posao, bez filtera", "šta ti ne kažu na razgovoru za posao", "kancelarijski život, onaj pravi"],
    running: ["kilometar po kilometar", "trčanje mi čisti glavu", "treniram za prvi polumaraton", "nedeljne duge deonice"],
    art: ["jedna slika dnevno", "nedeljom u muzej", "učim da zaista gledam", "priča iza svake slike", "team impresionizam", "muzej, kafa, ponovi"],
    quotidien: ["svega pomalo", "jednostavno moj život", "ledena kafa cele godine", "objavljujem šta volim", "tim nedeljno jutro"],
  },
  ar: {
    savoir: ["أتعلم شيئًا جديدًا كل يوم", "دائمًا معي كتاب", "فضول بلا حدود", "أقرأ أكثر مما أنام", "فكرة كل يوم"],
    discipline: ["أفضل قليلًا كل يوم", "الانضباط قبل الحماس", "الخامسة فجرًا، بلا أعذار", "قيد التطوير"],
    etude: ["أعيش في المكتبة", "قهوة، ملخصات، ثم من جديد", "دائمًا في فترة الامتحانات", "الهدف: الدرجة الكاملة"],
    carriere: ["العمل بلا تجميل", "ما لا يقال في مقابلات العمل", "حياة المكتب كما هي"],
    running: ["كيلومتر في كل مرة", "الجري يصفّي ذهني", "أتدرّب لأول نصف ماراثون", "جري طويل كل أحد"],
    art: ["لوحة كل يوم", "متحف وقهوة", "أتعلم كيف أنظر حقاً", "القصة وراء كل لوحة", "team الانطباعية", "متحف، قهوة، ونعيد"],
    quotidien: ["قليل من كل شيء", "حياتي ببساطة", "قهوة مثلجة طوال السنة", "أنشر ما أحب", "فريق صباح الجمعة"],
  },
  he: {
    savoir: ["משהו חדש כל יום", "תמיד עם ספר בתיק", "סקרנות בלי גבולות", "יותר קריאה משינה", "רעיון אחד ביום"],
    discipline: ["כל יום קצת יותר טוב", "משמעת לפני מוטיבציה", "5 בבוקר, בלי תירוצים", "בתהליך"],
    etude: ["הבית השני שלי: הספרייה", "קפה, סיכומים, ושוב", "תמיד בתקופת מבחנים", "המטרה: 100"],
    carriere: ["עבודה, בלי פילטרים", "מה שלא מספרים בראיון עבודה", "החיים במשרד, כמו שהם"],
    running: ["קילומטר אחד בכל פעם", "ריצה מנקה לי את הראש", "באימונים לחצי המרתון הראשון", "ריצות ארוכות בשבת"],
    art: ["ציור אחד ביום", "מוזיאון בשבת", "ללמוד להסתכל באמת", "הסיפור מאחורי כל ציור", "team אימפרסיוניזם", "מוזיאון, קפה, שוב"],
    quotidien: ["קצת מכל דבר", "פשוט החיים שלי", "קפה קר כל השנה", "מעלה מה שעושה לי טוב", "צוות שבת בבוקר"],
  },
  fi: {
    savoir: ["opin joka päivä jotain uutta", "aina kirja laukussa", "utelias kaikesta", "luen enemmän kuin nukun", "yksi idea päivässä"],
    discipline: ["joka päivä vähän parempi", "kuri ennen motivaatiota", "kello 5, ei selityksiä", "työn alla"],
    etude: ["asun kirjastossa", "kahvia, muistiinpanoja, uudestaan", "ikuinen tenttiviikko", "tavoite: vitoset"],
    carriere: ["työelämä ilman suodattimia", "mitä työhaastattelussa ei kerrota", "toimistoelämää, sitä oikeaa"],
    running: ["kilometri kerrallaan", "juoksu tyhjentää pään", "treenaan ekaa puolimaratonia varten", "sunnuntain pitkät lenkit"],
    art: ["yksi maalaus päivässä", "sunnuntaisin museoon", "opettelen katsomaan kunnolla", "tarina jokaisen maalauksen takana", "team impressionismi", "museo, kahvi, toisto"],
    quotidien: ["vähän kaikkea", "ihan vain elämääni", "jääkahvia ympäri vuoden", "postaan sitä mistä tykkään", "tiimi sunnuntaiaamu"],
  },
  et: {
    savoir: ["õpin iga päev midagi uut", "alati raamat kotis", "uudishimu ilma piirideta", "loen rohkem kui magan", "üks mõte päevas"],
    discipline: ["iga päev natuke parem", "distsipliin enne motivatsiooni", "kell 5, ei mingeid vabandusi", "töös"],
    etude: ["elan raamatukogus", "kohv, märkmed, uuesti", "igavene sessiaeg", "eesmärk: ainult viied"],
    carriere: ["tööelu ilma filtrita", "mida töövestlusel ei räägita", "kontorielu, see päris"],
    running: ["kilomeeter korraga", "jooks teeb pea selgeks", "treenin esimeseks poolmaratoniks", "pühapäevased pikad jooksud"],
    art: ["üks maal päevas", "pühapäeviti muuseumisse", "õpin päriselt vaatama", "lugu iga maali taga", "team impressionism", "muuseum, kohv, kordus"],
    quotidien: ["natuke kõike", "lihtsalt minu elu", "jääkohv aasta läbi", "postitan seda, mis mulle meeldib", "tiim pühapäeva hommik"],
  },
  bg: {
    savoir: ["всеки ден научавам нещо ново", "винаги с книга в чантата", "любопитство без граници", "чета повече, отколкото спя", "една идея на ден"],
    discipline: ["всеки ден малко по-добре", "дисциплина преди мотивация", "5 сутринта, без оправдания", "в процес"],
    etude: ["живея в библиотеката", "кафе, записки, отначало", "вечна сесия", "цел: само шестици"],
    carriere: ["работата без филтри", "какво не ти казват на интервю", "офис животът, истинският"],
    running: ["километър по километър", "бягането ми изчиства главата", "тренирам за първия си полумаратон", "дълги бягания в неделя"],
    art: ["по една картина на ден", "неделя в музея", "уча се да гледам истински", "историята зад всяка картина", "team импресионизъм", "музей, кафе, отначало"],
    quotidien: ["по малко от всичко", "просто моят живот", "айс кафе цяла година", "качвам това, което харесвам", "отбор неделна сутрин"],
  },
  lt: {
    savoir: ["kasdien išmokstu ką nors naujo", "visada su knyga rankinėje", "smalsumas be ribų", "skaitau daugiau nei miegu", "viena mintis per dieną"],
    discipline: ["kasdien šiek tiek geriau", "disciplina svarbiau už motyvaciją", "5 ryto, jokių pasiteisinimų", "kuriama"],
    etude: ["gyvenu bibliotekoje", "kava, užrašai, iš naujo", "amžina sesija", "tikslas: vien dešimtukai"],
    carriere: ["darbas be filtrų", "ko nepasako darbo pokalbyje", "biuro gyvenimas, tikrasis"],
    running: ["kilometras po kilometro", "bėgimas išvalo galvą", "ruošiuosi pirmam pusmaratoniui", "ilgi sekmadienio bėgimai"],
    art: ["vienas paveikslas per dieną", "sekmadieniais į muziejų", "mokausi tikrai žiūrėti", "istorija už kiekvieno paveikslo", "team impresionizmas", "muziejus, kava, kartoti"],
    quotidien: ["visko po truputį", "tiesiog mano gyvenimas", "šalta kava visus metus", "keliu tai, kas man patinka", "sekmadienio ryto komanda"],
  },
  lv: {
    savoir: ["katru dienu iemācos ko jaunu", "vienmēr ar grāmatu somā", "zinātkāre bez robežām", "lasu vairāk nekā guļu", "viena ideja dienā"],
    discipline: ["katru dienu mazliet labāk", "disciplīna pirms motivācijas", "5 no rīta, bez atrunām", "procesā"],
    etude: ["dzīvoju bibliotēkā", "kafija, pieraksti, vēlreiz", "mūžīgā sesija", "mērķis: tikai desmitnieki"],
    carriere: ["darbs bez filtriem", "ko nepasaka darba intervijā", "biroja dzīve, īstā"],
    running: ["kilometrs pēc kilometra", "skriešana iztīra galvu", "trenējos pirmajam pusmaratonam", "garie svētdienas skrējieni"],
    art: ["viena glezna dienā", "svētdienās uz muzeju", "mācos patiešām skatīties", "stāsts aiz katras gleznas", "team impresionisms", "muzejs, kafija, atkārtot"],
    quotidien: ["no visa pa druskai", "vienkārši mana dzīve", "ledus kafija visu gadu", "publicēju to, kas man patīk", "svētdienas rīta komanda"],
  },
  ja: {
    savoir: ["毎日ひとつ学ぶ", "カバンにはいつも本", "好奇心は無限", "寝るより読む", "一日一アイデア"],
    discipline: ["毎日少しずつ成長", "やる気より習慣", "朝5時、言い訳なし", "成長中"],
    etude: ["図書館が家", "コーヒー、ノート、もう一回", "万年テスト期間", "目標：全部合格"],
    carriere: ["仕事の本音", "面接で誰も教えてくれないこと", "リアルなオフィスライフ"],
    running: ["1キロずつ", "走ると頭がすっきりする", "初ハーフに向けて練習中", "日曜はロング走"],
    art: ["1日1枚の名画", "日曜は美術館", "ちゃんと見ることを練習中", "絵の裏にある物語", "印象派が好き", "美術館とコーヒー"],
    quotidien: ["いろいろ少しずつ", "ただの日常", "一年中アイスコーヒー", "好きなものを載せるだけ", "日曜の朝が好き"],
  },
  ko: {
    savoir: ["매일 하나씩 배우는 중", "가방엔 항상 책 한 권", "끝없는 호기심", "자는 것보다 읽는 게 좋아", "하루 한 가지 생각"],
    discipline: ["매일 조금씩 더 나아지기", "동기보다 습관", "새벽 5시, 핑계 없음", "성장 중"],
    etude: ["도서관이 집", "커피, 노트, 다시", "만년 시험기간", "목표: 올 A"],
    carriere: ["일 얘기, 필터 없이", "면접에서 아무도 안 알려주는 것", "진짜 오피스 라이프"],
    running: ["1킬로미터씩", "달리면 머리가 맑아져", "첫 하프 마라톤 준비 중", "일요일은 장거리 러닝"],
    art: ["하루 한 점의 명화", "일요일엔 미술관", "제대로 보는 법 배우는 중", "그림 뒤에 숨은 이야기", "인상파 좋아함", "미술관, 커피, 반복"],
    quotidien: ["이것저것 조금씩", "그냥 내 일상", "사계절 아이스 커피", "좋아하는 것만 올려요", "일요일 아침 좋아함"],
  },
};

type Hasard = () => number;

function tirer<T>(liste: T[], hasard: Hasard): T {
  return liste[Math.floor(hasard() * liste.length)]!;
}

function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compose une bio. `annee` est l'année en cours : elle sert à écrire l'année
 * de naissance (« '99 ») à la place de l'âge dans certaines formes.
 */
export function composerBio(
  entree: { prenom: string; langue: string; theme: ThemeMots; annee: number },
  hasard: Hasard = Math.random,
): string {
  const famille = familleBio(entree.theme, hasard);
  const phrases = (PHRASES_BIO[entree.langue] ?? PHRASES_BIO.en!)[famille];
  const N = capitaliser(entree.prenom);
  const n = entree.prenom.toLowerCase();
  const age = Math.floor(hasard() * 11) + 20;
  const A = String(age);
  const Y = `'${String((entree.annee - age) % 100).padStart(2, "0")}`;
  const E = tirer(EMOJIS_BIO[famille], hasard);
  const T = tirer(phrases, hasard);

  const formes = [
    `${N} ${A}`,
    `${n}, ${A}`,
    `${N} · ${A}`,
    `${N} ${E} ${A}`,
    `${n} ✦ ${Y}`,
    `${A} ${E}`,
    `${N} ${E}`,
    T,
    `${T} ${E}`,
    `${E} ${T}`,
    `${A} | ${T}`,
    `${N}, ${A}\n${T}`,
    `${n} · ${A} ${E}\n${T}`,
    `${Y} ${E}\n${T}`,
  ];
  const bio = tirer(formes, hasard);
  return [...bio].length <= BIO_MAX ? bio : `${N} ${A}`;
}
