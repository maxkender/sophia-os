# Reverse-engineering — hooks « How to become disgustingly educated »

Corpus : 30 TikToks du même schéma que [@diane.ellsworthh](https://www.tiktok.com/@diane.ellsworthh/photo/7677671175090081056) (24 août 2026, **383k vues / 85k likes / 37k saves**). Scraping Apify Clockworks + lecture visuelle de chaque slide (157 fichiers). Aucun post n’est `isAd` / TikTok Shop. Les pubs sont **dans le carrousel, la bio, ou la caption**.

---

## 1. Comment marche le hook

### Formule

```
How to [become | be | get] + [INTENSIFIEUR] + [TRAIT DE STATUT]
```

| Slot | Valeurs qui marchent | Effet |
|---|---|---|
| Verbe | become (le plus fort), be, get, you become, I became | « Become » = transformation. « Be » = état. « Get » = moins premium. |
| Intensifieur | **disgustingly**, dangerously, terrifyingly, extremely, ridiculously, stupidly, exceedingly | Mot « trop » qui choque. *Disgustingly* = le plus viral parce qu’il est oxymore (dégoût + éducation). |
| Trait | **educated / well educated**, intelligent, smart, that girl, unrecognizable, attractive, intellectual, elegant & educated, well spoken | Statut social, pas une compétence scolaire. |

Le hook **n’est presque jamais dans la caption des posts qui explosent**. Il est **à l’écran, slide 1, centré, 2–4 lignes**. La caption sert au SEO (hashtags) ou au funnel.

### Pourquoi ça arrête le scroll

1. **Promesse de statut, pas de méthode.** « Educated » ici = paraître lettré / dangerous / that girl, pas réussir un exam.
2. **Oxymore.** Disgustingly × educated. Dangerously × intelligent. Le cerveau veut résoudre le choc.
3. **How-to = swipe obligatoire.** Le format slideshow convertit le hook en « liste à sauver ».
4. **Identité projetée.** L’image dit déjà qui tu seras (Emma Watson ONU, Dead Poets, Rory Gilmore, penthouse). Le texte n’a plus qu’à nommer le désir.
5. **Série / FOMO.** `13/15`, `part 2?`, `Lmk if I should start a series` transforment un post en univers.

### Variantes du même moteur

| Type | Exemple | Force |
|---|---|---|
| Intensifieur + educated | disgustingly / dangerously / terrifyingly / extremely well educated | **Le cluster le plus proche de Diane** |
| Intensifieur + intelligence | dangerously / stupidly / extremely intellectual | Même famille, plus « homme / lifemaxxing » |
| That girl | how to become THAT GIRL | Le plus gros volume (4,2M) — autre niche, même squelette |
| Glow-up | unrecognizable / more attractive | Même how-to, autre désir |
| Anti-hook / essay | « Everyone talks about disgustingly educated BUT… » (Lexi) | Surfe le mot viral pour vendre Substack |

---

## 2. Comment c’est amené (architecture)

Le post viral de ce type a **toujours** cette colonne vertébrale :

```
SLIDE 1  Hook visuel (identité) + texte hook
SLIDE 2–N  Une action impérative par slide (ou par bandeau)
DERNIÈRE   Soft close (curiosité / follow / pub / « part 2 »)
```

### Slide 1 — le contrat

- Photo **pleine** (ou collage 3 bandes) qui **montre déjà le statut**.
- Texte **court**, lowercase ou Title Case, **blanc ou jaune pâle**, sans boîte (sauf exception pills).
- Aucune pub. Aucun hashtag à l’écran.
- Le visage du créateur est souvent **absent** (Pinterest / film / célébrité).

### Slides 2–N — le « faux programme »

Toujours des **micro-habitudes réalisables aujourd’hui**, jamais un curriculum :

- Read 10 pages a day
- Learn a new word every day
- Watch documentaries
- Journal everyday
- Learn a language
- Look things up

Chaque slide = **1 ordre + 1 image qui prouve l’esthétique de l’ordre**.  
Les posts qui pondent 8–12 slides de texte dense (Punam, Sparkandhustle caption-novella) **ne viralisent pas**.

### Combien de slides

| Slides | Posts | Lecture |
|---|---|---|
| 4 | Diane 383k, Rosie 360k | **Sweet spot esthétique feminine** |
| 6–7 | Rocky 858k, Lukas 654k, Speakbetter 319k | Sweet spot « liste lifemaxxing » |
| 8–10 | That girl / glowlarp / attractive 3,2M | Plus long OK si **une idée par slide** et visuel fort |
| 1 photo + caption roman | Twasam 239k, Spark 2,5k | La liste est dans la **caption**. Ça marche si le hook cover est fort ; Spark (fond bleu Canva) floppe. |
| 12 | Punam 16k | Trop, amateur, CTAs partout |

### Rythme interne d’une slide (les 3 templates qui marchent)

**A. Collage 3 bandes verticales (Diane, le gold standard de ce hook)**  
Une slide = 3 photos empilées, 3 overlays. Le viewer a l’impression de 12 contenus pour 4 slides. Save rate énorme.

**B. Pleine page + 1 overlay** (Rocky, Speakbetter, Lukas, Wlis.e)  
Une photo cinéma, 1–6 lignes de texte. Plus « editorial ».

**C. Même photo, texte qui change** (Lulu / Emma Watson)  
7 slides, **une seule image**. Très faible effort. 26k vues — le hook porte, l’image unique fatigue.

---

## 3. Quelles images prendre

### Taxonomie (ce qui est réellement dans le corpus)

**1. Dark academia / quiet luxury — le look « disgustingly educated »**

À copier pour coller à Diane :

| Sujet | Détail observé | Où |
|---|---|---|
| Échecs bois, vue dessus | Mains, pièces, plateau marqué A–H | Diane s1 haut |
| Fille de dos, café, lampe, carnet | Pas de visage, trench beige | Diane s1 milieu = **le hook** |
| Flat lay bureau | Tasse, AirPods, stylo, lunettes, bague, **Penguin Classics / Wuthering Heights** | Diane s1 bas |
| Lecture au lit, peignoir blanc, livre français | *Correspondance* à l’envers | Diane s2 |
| Notes manuscrites + docu laptop (Iran/Chine) | « Watch documentaries » | Diane s2 |
| Canapé cuir + talon, musée portraits 18e, journal sur banc | Art + news | Diane s3 |
| Lecture philo canapé crème, cabas + **VOGUE**, pull blanc texture | Luxe calme | Diane s4 |

**Recette visuels Diane :** Pinterest « dark academia girl », « quiet luxury morning », « museum girl », « chess aesthetic ». **Pas de selfie. Pas de logo. Pas de visage frontal.** Crop dos / mains / objets. Palette bois, beige, blanc cassé, noir.

**2. Icône de « smart girl » (célébrité = preuve sociale)**

- Emma Watson ONU, carnet noir, robe noire (Lulu) — **une photo × 7 textes**.
- Rory Gilmore / Alexis Bledel, 6 stills *Gilmore Girls* (Coco).
- IVE / Wonyoung school uniform (Cloudi.woni).
- Christian Bale *American Psycho*, Daniel Craig Bond, Jon Hamm Don Draper, Matthew McConaughey tribunal, Dead Poets Society chapel (Rocky / Guildstone / Cowboy).

La célébrité **est** le hook visuel. Le texte n’a plus à convaincre que « educated » = désirable.

**3. Lifestyle that-girl / coquette (pas educated, mais même how-to)**

Produits en dur dans les slides qui font des millions :

- Chanel N°5 L’Eau, Sol de Janeiro 68, Diptyque Vanille, UGG, lululemon, Five Minute Journal, MacBook, TNF backpack (Chloexci)
- Rhode Peptide Lip Tint, La Roche-Posay Effaclar, Olaplex N°7, Byredo Vanille Antique (Thatgirl_guide0)
- Victoria’s Secret Bare Vanilla, Philosophy French Vanilla Bean, Dove, Denman (Cloudi)

Ce ne sont **pas** des pubs sponsorisées (`isAd=false`). C’est de l’**aspiration merch** : le produit *est* l’esthétique.

**4. Homme lifemaxxing / cinéma N&B**

- Dead Poets (garçon éveillé au milieu des endormis) = **858k**, meilleur slideshow « educated » du corpus.
- Bond / Draper / Bateman / Zuckerberg *Social Network*.
- Penthouse Tokyo, infinity pool, mall de nuit (Lukas) — luxe architectural **sans visage**.
- Street leather jacket + clope + café (Rocky #24).

**5. Ce qui floppe visuellement**

- Fond Canva bleu + emoji toque (Spark, 2,5k).
- Manga/illustration stock sans photo réelle (1certified_von, 1,3k).
- 12 photos study-with-me amateur (Punam, 16k).
- Même still 7 fois (Lulu, 26k — le hook sauve, le format plafonne).

### Où sourcer (pratique)

1. Pinterest boards : `dark academia`, `quiet luxury`, `museum date`, `chess`, `penguin classics`, `old money study`.
2. Stills films : Dead Poets, *American Psycho*, Bond casino, *Mad Men*, *Social Network*, *Gilmore Girls*.
3. Tes propres photos **sans visage** : flat lays livres + café, musée, journal, tote + magazine.
4. Éviter : selfies random, screenshots Canva, photos trop « école / highlighter / iPad notes » ( Punam).

---

## 4. Captions — 5 écoles

| École | Pattern | Exemple | Quand |
|---|---|---|---|
| **Hashtags only** | Hook 100% on-slide | Diane : `#glowup #fyp #intelligence #brainmaxxing #productivity` | **Le plus premium / le plus save** |
| **Hook + pipe + tags** | Hook répété en caption | `how to become extremely well educated \| lifemaxx this summer #selfimprovement…` | SEO + FYP self-improvement |
| **Hook enterré après tags** | Tags d’abord, hook à la fin | Speakbetter : tags puis `how to be disgustingly educated and incredibly well spoken` | Funnel app, le hook reste cherchable |
| **Roman / comment bait** | Toute la liste dans la caption | Twasam 10 points ; Rory `comment Substack` | Vues OK, saves plus faibles, funnel |
| **Anti-hook essay** | Cite le trend puis pivote | Lexi : « Everyone keeps talking about disgustingly educated… » + `#substack` | Convertir le trafic vers newsletter |

Hashtags qui reviennent : `selfimprovement`, `learnontiktok`, `studytok`, `thatgirl`, `glowup`, `niche`, `growthmindset`, `fyp`.  
Les viraux **n’utilisent pas** `#howtobecomedisgustinglyeducated` (Lulu l’a mis, 26k). Le mot va **à l’écran**, pas en tag.

CTA caption qui convertit :

- `Save this for staying focused` (Lukas, 37k saves / 654k plays ≈ **5,7%**)
- Diane sans CTA save explicite mais **9,7% save rate** (37k/383k) — le format liste + collage suffit.
- `comment Substack` (Rory) = funnel, pas viralité.

---

## 5. Musiques

| Post | Track | Original ? | Rôle |
|---|---|---|---|
| **Diane 383k** | **Destroy it All / YUJI! (Slowed)** — Ryutqc & NORWXXD REAPER & SMAIL | Non | Phonk/rage **slowed** : tension + esthétique « dangerous ». C’est *le* son du trend glow-up 2026. |
| Rocky 858k | original sound — maczz | Oui | Sound déjà en circulation sur du lifemaxxing. |
| Rocky #24 219k | with insomnia nothing is real — Sam★ | Oui | Dark, insomnia, match visuel cuir/clope. |
| Lukas 654k | neverending cycle — Arimasen & trapeia | Non | Electronica hypnotique, match penthouse. |
| Rosie 360k | original sound | Oui | Soft, that-girl. |
| Speakbetter 107k | Originalton — whitelinesprettybabyy | Oui | Soft girl. |
| Speakbetter 319k | original sound — quintessa | Oui | Idem. |
| Wlis.e 404k | original sound | Oui | Soft. |
| Glowlarp 497k | win again - slowed — trucky | Non | Slowed encore. |
| Attractive 3,2M | original sound | Oui | Neutre. |
| Chloexci 4,2M | original sound | Oui | Série, le son n’est pas le levier. |
| WhyYvess | The Path Less Travelled — Vegyn | Non | Indie expérimental, pose « cool ». |
| Lexi | Beloved Mirage — Joshua Kyan Aalampour | Non | Piano cinématique dark academia. |
| Nora | Piano Version — 夹夹虫 | Non | Piano stock. |
| Cowboy | mike tyson motivational | Oui | Motivational male. |
| Hallo | Classy saxophone jazz in the hotel lounge | Non | Jazz hôtel = old money parody. |
| Spark | Inner Light — Belinda Grey | Non | Gospel/hustle, mismatch du visuel Canva. |

**Règle musique pour un clone Diane :** prendre un **slowed phonk / dark electronic déjà viral**, pas un original sound mort, pas un piano stock, pas un gospel. Le slowed crée le sentiment « dangerous » que le texte promet.

---

## 6. Pubs déguisées — carte complète

Aucun des 30 n’est un Spark Ad (`isAd=false`, `hasTikTokShopProduct=false`). Les funnels sont **dissimulés dans le format how-to**.

### Hard funnels (le how-to est un prétexte)

| Compte | Où c’est caché | Produit | Comment c’est amené |
|---|---|---|---|
| **@speakbetter14** | Bio `elqo.app` + « dm me for a discount code ». **Dans la slide** : « practice removing filler words (i use elqo.app its free) » / « communicate… (improve… with Elqo, its free) » | App élocution Elqo | 3 slides lifestyle gratuites, **1 slide produit au milieu** comme si c’était un tip. Le hook educated/well spoken = ICP de l’app. **Pub déguisée la plus propre du corpus.** |
| **@nora.selfimprovement6** | Slide 6 nomme Wellspoken ; **slide 7 badge App Store** « Wellspoken: Articulation Coach / Open » | App Wellspoken | Même playbook Elqo, plus agressif (badge store). 6,1k vues : le badge casse l’illusion. |
| **@glowlarp** | Slide 4 = **pub Snipd full-screen** (AI haircut, « search 'Snipd' »). Slide 9 Vaseline. Bio `usemonetize.co`. Autres posts Trimr. | Snipd + Vaseline + affiliate | Hook « more attractive » → 3 tips meme → **pub app** → folk remedies → follow. 497k : le hook + 2×2 visages portent la pub. |
| **@rory.bingethinking** | Caption : **« comment Substack and I’ll send you the link »**. Overlay « This substack article got 82,000 likes ». Bio Beehiiv. | Newsletter | Talking-head. Le hook est un **titre d’article déjà performant**. Comment bait classique. |
| **@goldenhourwithlexi** | Hashtag `#substack`, bio « The Muse and the Melody », Linktree. 9 slides essai = extraits d’article. | Substack | Surfe le mot *disgustingly educated* pour convertir les lectrices dark academia. |
| **@whyyvess** | Caption : `Oliveyoung code :: WHYYVESS3` + mention `@OLIVE YOUNG Global` | Code affilié K-beauty | Hook educated + **code cosmétique**. Les slides n’ont rien à voir avec Olive Young (sacs, livres Ali Smith). |
| **@levelup.withliam** | Bio : Search « MyFutureSelf » on the App Store | App | Talking-head. Hook stupide intelligent → app habits. |
| **@fbinegotiator** | Bio « Author of Never Split the Difference ». Cover podcast Drasanvi. | Livre Chris Voss | Autorité. Pas un ad tag, c’est de la **marque auteur**. |

### Soft / pages faceless

| Compte | Signal |
|---|---|
| @rockyjune00 / @thcowboyproject | Linktree `davidJune`. Même réseau « lifemaxxing ». Slideshow farm. |
| @guildstone | Bio « Lifestyle Niche Start-up Maxxing ». End card `guildstone.` |
| @twasam2 | « DM for business ». Autres posts « COMMENT X IN THE COMMENTS ». Digital skills / affiliate. |
| @romanticizedlifestyle | Bio « Pictures from Pinterest! ». Posts « Substacks of the week ». |
| @mavereuer | Mentions **Maldon Salt** dans une recette talking-head. Pas `isAd` ici. Le compte a **d’autres** Spark Ads skincare. |

### Pas une pub (même si ça vend une identité)

Diane, Lulu, Chloexci, Rosie, Lukas, Wlis.e, Lifechangerforlife, Coco, Hermes : **collab email ou rien**. Ils vendent une *persona*. C’est le format à cloner pour de l’organique.

---

## 7. Playbook — faire un post viral avec ce hook

### Recette prioritaire (clone Diane, le plus proche du brief)

1. **Hook on-slide uniquement**  
   `How to become disgustingly educated`  
   Variantes FR à tester : *comment devenir dangereusement cultivé(e)* / *how to become terrifyingly well read*.

2. **4 slides, 3 photos par slide** (12 images au total). Overlay blanc, 3–6 mots, centré.

3. **Slide 1 = collage identité**  
   - Haut : objet « intelligent » (échecs, vinyle, partition).  
   - Milieu : personne de dos + **le hook**.  
   - Bas : flat lay Penguin Classics + café + lunettes.

4. **Slides 2–4 = 9 micro-ordres** (ceux qui reviennent dans *tous* les viraux) :
   - Read 10 pages a day  
   - Learn about history  
   - Watch documentaries  
   - Learn a new word every day  
   - Study art  
   - Follow the news  
   - Learn basic philosophy  
   - Pick a random topic every week  
   - Learn to question everything  

5. **Caption = 4–5 hashtags, zéro phrase.**  
   `#glowup #intelligence #brainmaxxing #productivity #fyp`

6. **Musique :** slowed phonk du moment (type *Destroy it All / YUJI! (Slowed)*), pas un original.

7. **Pas de pub, pas de visages frontaux, pas de logo app, pas de « follow for more ».**

8. **Images :** Pinterest dark academia / quiet luxury. Livres **classiques identifiables** (Penguin, Vogue, journaux) = preuve. Éviter stock Canva.

### Ce que les chiffres disent de prioriser

| Levier | Preuve |
|---|---|
| Hook on-slide + collage 3 bandes | Diane 383k, save **9,7%** |
| Film still mythique + overlay jaune | Dead Poets 858k |
| Série numérotée (13/15) | Chloexci 4,2M |
| How to be attractive + visages | 3,2M |
| Liste penthouse masculine | Lukas 654k, 37k saves |
| App au milieu du carrousel | Speakbetter 107k–319k (marche, mais ce n’est plus du pur contenu) |
| 1 image × N textes | Lulu 26k |
| Canva / manga / 12 slides étude | < 20k |

### Images à prendre (checklist)

**Oui**

- Dos / nuque / mains, jamais un selfie « créateur »
- Livres Penguin, journaux, musées, échecs, cabas + magazine
- Peignoir, café, AirPods, lunettes, carnet
- Stills films « intelligent » (Dead Poets, Bond, Bateman) **si tu assumes le copyright visuel**
- Penthouse / musée / bouquiniste Paris (Lexi slide 1)

**Non**

- Badge App Store
- Fond uni Canva
- 7 fois la même photo
- Produit au slide 4 si tu veux de l’organique « éducation »
- Photos d’idoles K-pop si tu n’es pas dans wonyoungism (copyright + hors niche)

### Structure caption selon l’objectif

- **Portée / saves :** hashtags only.  
- **Cherchabilité du hook :** hook en clair + `|` + 5 tags selfimprovement.  
- **Funnel :** 3 slides value → 1 slide produit « (j’utilise X, c’est gratuit) » → 1 slide curiosity. Jamais le produit en slide 1.

---

## 8. Fiches des 30 posts

Légende funnel : **Organique** / **Soft page** / **Hard pub déguisée**.

---

### 1. @diane.ellsworthh — RÉFÉRENCE

- URL : https://www.tiktok.com/@diane.ellsworthh/photo/7677671175090081056  
- 383k plays · 85k likes · 154 com · 4,1k shares · **37k saves** · FR · 24 août 2026  
- **Organique.** Bio emoji only. 3,5k followers.  
- **Hook (on-slide, pas en caption) :** `How to become disgustingly educated`  
- **Caption :** `#glowup #fyp #intelligence #brainmaxxing #productivity`  
- **Musique :** Destroy it All / YUJI! (Slowed) — **pas original**  
- **Format :** 4 slides × **3 photos** = 12 visuels. Overlay blanc, serif/sans léger, sparkle sur le hook.

**Slide 1 (hook)**  
1. Échecs bois, mains, tasses.  
2. Fille de dos, trench beige, café, lampe, **texte hook + vagues décoratives**.  
3. Flat lay : café, AirPods, crayon, lunettes, bague, **Wuthering Heights Penguin Classics**.

**Slide 2** `Read 10 pages a day` (lit, peignoir, livre FR) / `Learn about history` (notes + bouquin) / `Watch documentaries` (Acer + docu géopolitique + carnet).

**Slide 3** `Learn a new word every day` (canapé cuir, talon) / `Study art` (musée portraits) / `Follow the news` (journal sur banc, trench).

**Slide 4** `Learn basic philosophy` (lecture canapé crème) / `Pick a random topic every week` (cabas crème + **VOGUE** + lunettes) / `Learn to question everything` (pull blanc, canapé bouclé).

**Pourquoi ça marche :** identité > conseil. Le viewer swipe pour **collecter l’esthétique**, les tips sont prétextes. Save rate de slideshow listicle.

---

### 2. @luluslogic — copie mot-à-mot, 1 image

- https://www.tiktok.com/@luluslogic/photo/7658994382665780482  
- 26k · 4,5k likes · 1,6k saves · IE · 5 juil. 2026  
- **Organique.** Bio « fifteen / digital diary ». 196 followers.  
- **Caption :** `how to become disgustingly educated. || #fyp #disgustinglyeductaed #howtobecomedisgustinglyeducated #emmawatson #darkacademiaaesthetic`  
- **Musique :** Mystery of love instrumental (original)  
- **Format :** **la même photo Emma Watson ONU × 7 overlays** (outline blanc TikTok).

Textes : hook → 1. Read in pairs (fiction + nonfiction) → 2. Learn another language (Netflix audio) → 3. Films outside your taste → 4. Be curious, look up words → 5. Listen more than you speak → 6. Watch debates.

**Funnel :** aucun. **Limite :** zéro travail visuel. Le still Watson *est* le produit.

---

### 3. @rockyjune00 — Dead Poets, 858k

- https://www.tiktok.com/@rockyjune00/photo/7641276451442019617  
- **858k · 160k likes · 7,2k shares · 72k saves** · DE · 18 mai 2026  
- **Soft page.** Bio lifemaxxing. Linktree `davidJune`. Slideshow farm.  
- Caption : `how to become extremely well educated | become the best version of yourself and lifemaxx this summer #selfimprovement #motivationtok #niche #learnontiktok #growthmindset`  
- **Hook on-slide différent de la caption :** `how to be dangerously well educated`  
- Musique : original sound — maczz  
- Overlay **jaune pâle**, lowercase, photo pleine.

1. **Dead Poets Society** — un garçon éveillé, les autres dorment.  
2. Homme au bureau, fenêtre ogive : lire des **vrais** livres (classics/philo), pas romance.  
3. Homme au sol + partitions : chess / crossword / langue / instrument.  
4. Journal ouvert, falaise : journaling.  
5. Peinture : dopamine detox, pas doomscroll.  
6. Mac + mug + papiers : exercise and diet, neurogenesis.

**Le mismatch caption/slide (extremely vs dangerously) n’empêche pas le hit.** L’image Dead Poets fait le travail.

---

### 4. @speakbetter14 — Elqo, pub déguisée #1

- https://www.tiktok.com/@speakbetter14/photo/7621904127877991700  
- 107k · 24k likes · 7k saves · US · 27 mars 2026  
- **Hard funnel.** Bio : elqo.app + DM discount.  
- Caption tags puis `how to be disgustingly educated and incredibly well spoken`  
- Musique : Originalton — whitelinesprettybabyy  
- 6 slides candids, overlay blanc lowercase.

1. Crop épaule, cardigan ajouré, bijoux : hook.  
2. Journal + café café, vue dessus : `journal everyday`.  
3. Tasse céramique + carnet : `build your vocabulary through reading`.  
4. **PUB :** Mac + porridge + Vogue — `practice removing your filler words when you speak (i use elqo.app its free)`.  
5. Peignoir + nounours + thé : `study/learn from timeless thinkers`.  
6. Croissants : `look things up… curiosity builds intelligence`.

**Mécanique pub :** le produit est **un item de liste parmi d’autres**, parenthèses, « it’s free ». Pas de badge store.

---

### 5. @whyyvess — Olive Young dans la caption

- https://www.tiktok.com/@whyyvess/photo/7648436145889611029  
- 43k · 6,4k likes · 3k saves · PH  
- **Hard affilié.** `Oliveyoung code :: WHYYVESS3` + @OLIVE YOUNG Global.  
- Musique : Vegyn — The Path Less Travelled  
- Hook on-slide : `How To Be Terrifyingly Well Educated` — mannequin studio (bandeau, pantalon large), typo serif camel **à gauche**, photo à droite.

Puis 4 stills « sac / livre » + pavé de texte outline :

- Build a second brain (sac + livre David)  
- Learn argumentation (panier vélo, matcha, sac cuir)  
- Mistakes database (sac ouvert, iPhone)  
- Read above your level (**Ali Smith, The Accidental**)

**Le code cosmétique n’apparaît pas dans les slides.** Hook educated = trafic, conversion K-beauty en caption.

---

### 6. @romanticizedlifestyle — Pinterest graphic, 360k

- https://www.tiktok.com/@romanticizedlifestyle/photo/7516650729868692758  
- 360k · 71k likes · **35k saves** · NL · 16 juin 2025  
- Bio : « Pictures from Pinterest! » · Soft Substack ailleurs.  
- Caption : `How to become smart (and therefore the best version of yourself) #smartgirl #academicweapon…`  
- Hook on-slide : `HOW TO BECOME SMARTER` + `Actually becoming smarter, and coming across as smart`  
- 4 slides **fond blanc**, rose poudré, Vivienne Westwood orb, fleurs, Notion screenshots.

S2 ENVIRONMENT (people / be mature) + photo bureau haussmannien.  
S3 colonnes Activities / Gain knowledge (chess, langues, Harvard/Yale free courses).  
S4 `I HOPE THIS HELPED` + mock Notion academic.

**C’est un carrousel Pinterest/Notion, pas une photo TikTok.** Save rate élevé parce que ça ressemble à un **guide à screenshot**.

---

### 7. @hermesblueeyes — instead of this / do this

- https://www.tiktok.com/@hermesblueeyes/photo/7321033825897762081  
- 181k · 11,6k likes · AT · janv. 2024  
- Caption = hook + 10 hashtags thatgirl.  
- 2 slides : (1) carte rose `how to become more intelligent` (2) tableau **instead of this | do this** : musique→podcast, film→documentary (*The Devil All the Time*), scroll→livre (*101 Essays* Brianna Wiest).

Format **contraste**. Très copiable. Court.

---

### 8. @nora.selfimprovement6 — Wellspoken, pub déguisée

- https://www.tiktok.com/@nora.selfimprovement6/photo/7672192774040587521  
- 6,1k · MY · **Hard app** Wellspoken.  
- Overlay jaune pâle, candids that-girl (mug, sacs, De’Longhi, Oatly, muffins).  
- Tips : read 30 min, skill every quarter, conversations above your level, write, **practice speaking with precision / tools like wellspoken**, puis **badge App Store**.

Le badge slide 7 **tue** l’illusion. Même playbook qu’Elqo, moins bien intégré.

---

### 9. @thcowboyproject — même farm que Rocky

- https://www.tiktok.com/@thcowboyproject/photo/7645190030499122464  
- 125k · 16k likes · 6,6k saves · DE  
- Bio tag @DAVID JUNE. N&B cinéma, overlay jaune.  
- Hook : `how you become dangerously intelligent`  
- McConaughey tribunal, **Don Draper**, auditorium, **Bond tuxedo**.  
- Tips : obsess over understanding, explanation walks, explain simply, mental models.

Cinéma masculin = preuve de « dangerous ». Même overlay que Rocky.

---

### 10. @i.am.lukas — unrecognizable, 654k

- https://www.tiktok.com/@i.am.lukas/photo/7539586976568118550  
- 654k · 67k likes · **37k saves** · DE  
- Caption : hook + `Save this for staying focused.`  
- Musique : neverending cycle  
- 6 slides 9:16 luxe **sans visage** : bust grec lobby marbre → penthouse Tokyo Tower → mall nuit → salon Tom Ford book → infinity pool → villa mer.

Chaque slide = `For your body/mind/habits/soul/future:` + 7 puces.  
**Liste + architecture de luxe.** Le save CTA est dans la caption.

---

### 11. @chloexci — 4,2M, série 13/15

- https://www.tiktok.com/@chloexci/photo/7329148203889200417  
- **4,2M · 288k likes · 81k saves** · NL · janv. 2024  
- Organique, email collab.  
- Cover rose : `how to become THAT GIRL 13/15`.  
- Puis `part 13: ROUTINES` + 5 routines horaires collages produits (Chanel, Sol de Janeiro, Diptyque, UGG, lululemon, Five Minute Journal).  
- **Le levier n’est pas educated, c’est la série.** Le how-to est un *épisode*.

---

### 12. @cloudi.woni — Wonyoungism

- https://www.tiktok.com/@cloudi.woni/photo/7627895166698917141  
- 203k · ZA  
- 7 slides : Wonyoung/IVE + overlay outline + grilles 2×2.  
- Comportement scolaire (mind your business, study, don’t curse, smell vanilla, ignore haters, be polite).  
- Produits vanilla girl non sponsorisés.

---

### 13. @thatgirl_guide0 — Pinterest collage + follow

- https://www.tiktok.com/@thatgirl_guide0/photo/7530961010623106326  
- 87k · AT  
- 8 slides scrapbook blanc. Alarmes 5am, La Roche-Posay, Rhode, Olaplex, Byredo.  
- Close : `Thanks for swiping! Follow to become the best version of urself`.

---

### 14. @wlis.e — charisma 101, 404k

- https://www.tiktok.com/@wlis.e/photo/7668759044810607903  
- 404k · 74k likes · **25k saves** · US  
- Full-bleed luxe (yoga villa, safari, Côte d’Azur, fur elevator, paparazzi).  
- Hook `How to be THAT girl` → Lesson one charismatic → 3 skills (targeted attention, warm confidence, unbothered) → recap → **`Lmk if I should start a series`**.  
- Comment bait série. Pas de produit.

---

### 15. @glowlarp — 497k, pub Snipd au milieu

- https://www.tiktok.com/@glowlarp/photo/7645782823911148820  
- 497k · 18k likes · 355 com · NG  
- **Hard affiliate.**  
- Grilles 2×2 mecs. Hook `How to become More attractive`.  
- Ice method (blague), haircut, **SLIDE 4 PUB SNIPD** (AI face scan, search 'Snipd'), ginger skin, onion hair, accessories, detox water, **Vaseline**, Miles Morales `Follow for more`.

Le how-to attractive **finance** l’app coiffure. Le viewer swipe la pub comme un tip.

---

### 16. @lifechangerforlife — 3,2M attractive

- https://www.tiktok.com/@lifechangerforlife/photo/7527416352030706966  
- **3,2M · 420k likes · 108k saves** · DK  
- Organique. 6 vidéos au total.  
- Caption minimale : `How to be attractive? #lifegoal`  
- Selfie hook puis 8 slides : eye contact, posture, smiling (Chanel bag), being nice, knowing what you want, confidence, self respect, respecting people.  
- Overlay blanc, une idée, photos de la même femme.  
- **Preuve :** how-to + visage désirable + tips comportementaux simples = ceiling du format. Pas besoin d’educated.

---

### 17. @speakbetter14 — dangerously elegant, Elqo encore

- https://www.tiktok.com/@speakbetter14/photo/7611505253502012692  
- 319k · 55k likes · 22k saves · AU  
- Hook `how to become dangerously elegant & educated`  
- Podcasts (Hormozi, Mel Robbins, In Our Time), body, posture, **Elqo parenthèses**, curiosity.  
- Même playbook que #4, plus de vues (visage + Madeline Argy cité en caption).

---

### 18. @twasam2 — 1 photo, roman en caption

- https://www.tiktok.com/@twasam2/photo/7649521125742923028  
- 239k · 13k likes · 203 com · 5,6k saves · GH  
- Soft funnel (DM business ; comment-CTA ailleurs).  
- **1 slide** : homme en costume, 3 pills blanches `How To Become Dangerously Educated In Your 20s`.  
- Les 10 points (read beyond school, human behavior, money, skills…) sont **dans la caption**.  
- Musique original.  
- Ça marche parce que le cover est un **titre d’article** + costume = autorité. Pas un carrousel.

---

### 19. @guildstone — Bateman / Bond, niche page

- https://www.tiktok.com/@guildstone/photo/7661653796270918934  
- 44k · GB  
- Bio « Lifestyle Niche Start-up Maxxing ».  
- Hook : `How To Become Ridiculously Well Educated.` sur **Patrick Bateman**.  
- Surf, Bond casino, Bateman driving, end card **Zuckerberg** `guildstone.`  
- Overlay jaune clone Rocky. Faceless niche.

---

### 20. @punam7880 — 12 slides étude, 16k

- https://www.tiktok.com/@punam7880/photo/7641948912466562324  
- 16k · NP · YouTube in bio.  
- Cover : pills `DANGEROUSLY educated` + `SAVE this` + `Follow for more`.  
- 10 tips study-with-me (HP laptop, Indian Contract Act, gratitude journal, Murakami).  
- **Trop de CTA, trop de slides, visuels étudiants.** Le hook ne suffit pas.

---

### 21. @coco.teii — Rory Gilmore, 5,8k

- https://www.tiktok.com/@coco.teii/photo/7607495909504584982  
- 5,8k · GB  
- Hook : `how to seem like the smartest person in the room` (not *become*).  
- 5 tips scolaires (confidence, teachers, don’t flex grades, don’t spam answers) + `part 2?`  
- **Seem > become** : c’est de la performance sociale, plus honnête que le cluster educated. Faible portée (compte petit, typos).

---

### 22. @1certified_von — manga, 1,3k

- https://www.tiktok.com/@1certified_von/photo/7667479424492702989  
- 1,3k · US  
- Caption LinkedIn (`Curious about how to get disgustingly educated?`).  
- 6 slides manga + ALL CAPS. Typos (`Techonolgy`).  
- **Anti-recette.**

---

### 23. @sparkandhustle3 — Canva + Bible, 2,5k

- https://www.tiktok.com/@sparkandhustle3/photo/7650121701711269140  
- 2,5k  
- 1 slide fond bleu + toque. Toute la valeur (Proverbs, 48 Laws, 75 Hard) est en **caption**.  
- Musique Inner Light.  
- Le visuel ne tient pas le hook.

---

### 24. @rockyjune00 — extremely intellectual, 219k

- https://www.tiktok.com/@rockyjune00/photo/7640803931685178656  
- 219k · 43k likes · **16k saves** · veille du post Dead Poets.  
- Hook : `how to become extremely intellectual` — street, leather, clope, café, gants.  
- Bureau Mac, article académique + mug (même photo que s6 du post Dead Poets), journal bordeaux + café, allée mouillée, lecture au lit + chat.  
- Overlay jaune. Même farm, même son dark.

---

### 25. @goldenhourwithlexi — essai Substack

- https://www.tiktok.com/@goldenhourwithlexi/photo/7614931217921625375  
- 16,5k · US · **Hard Substack** `#substack`  
- Cover : bouquiniste Paris, béret, trench, `How to be DISGUSTINGLY EDUCATED (Without going back to school)`  
- Slides 2–9 : **cartes essai** (bloc blanc serif sur bibliothèque / café / journal) — vocabulary journal, research your street, museums, historical sites, reread classics (*Gatsby*, *Beloved*, *Odyssey*).  
- Musique piano Aalampour.  
- Caption = l’article. Le TikTok est un **extrait paywall**.

---

### 26. @mavereuer — talking-head + Maldon, 421k

- https://www.tiktok.com/@mavereuer/video/7604388666378571021  
- 421k · 77k likes · **37k saves** · 8,3k shares  
- **Pas un slideshow.** Talking-head.  
- Overlay : `how to become dangerously educated on things that can actually improve your life`  
- Elle tient une boîte **Maldon Salt** au-dessus d’une salade mozzarella. Caption tag @Maldon Salt.  
- Original sound.  
- Hook how-to + **objet concret** (sel) = twist « educated on useful things ». Produit visible, pas `isAd`. Le compte a d’autres ads skincare.

---

### 27. @rory.bingethinking — comment Substack

- https://www.tiktok.com/@rory.bingethinking/video/7662159441545923854  
- 17k · 218k followers  
- Talking-head, overlay jaune TikTok `How To Be Disgustingly Educated`, screenshot article 83k likes, `This substack article got 82,000 likes`.  
- Caption : **comment Substack**.  
- Livres *The Power of One*, *The Prophet* en prop.  
- **Le contenu n’est pas le carrousel : c’est une pub pour un article.**

---

### 28. @hallo.ubermesch — jazz + livres

- https://www.tiktok.com/@hallo.ubermesch/video/7670570494130752799  
- 28k · caption typo `exeedibgly`  
- Overlay serif bleu `how to become exceedingly well educated`  
- Fille casquette, cable-knit, bras chargés de livres (Homère visible).  
- Jazz lounge. Talking-head old-money. Organique.

---

### 29. @levelup.withliam — Tony Stark, app bio

- https://www.tiktok.com/@levelup.withliam/video/7664792926471376142  
- 66k · caption = hook only  
- Overlay outline `How to become stupidly intelligent` + green screens Bale / Tony Stark.  
- Bio App Store MyFutureSelf.  
- Talking-head hustle. Hook = titre, le corps est un listicle parlé.

---

### 30. @fbinegotiator — Chris Voss, livre

- https://www.tiktok.com/@fbinegotiator/video/7615660905459682574  
- 21k · 168k followers  
- Cover podcast, casque Audio-Technica, lower-third `How To Be The Smartest Person In ANY Room`.  
- Original sound Chris Voss.  
- Autorité livre *Never Split the Difference*. Pas un slideshow, pas un ad tag : **personal brand**.

---

## 9. Synthèse opératoire

Si tu dois n’en retenir qu’une chose :

**Le hook vit à l’écran, pas dans la caption. L’image vend le statut. Les tips sont interchangeables. La musique slowed ancre le « dangerous ». 4–7 slides. Zéro pub sur le clone organique. Les pubs déguisées (Elqo, Snipd, Substack, Olive Young) mettent le produit au milieu de la liste, jamais en slide 1.**

Les 9 micro-tips qui apparaissent partout (à recycler) :

1. Lire un peu chaque jour (10 pages / 30 min)  
2. Un mot nouveau / vocabulary journal  
3. Documentaires > films  
4. Art / musée  
5. News / histoire  
6. Philosophie / « vrais » livres  
7. Langue  
8. Journaling  
9. Curiosity : look everything up / question everything  

Les images à shooter ou pinner en priorité : **échecs, Penguin Classics, musée, fille de dos + café, Vogue dans un cabas, Dead Poets, bouquiniste, penthouse sans visage.**
