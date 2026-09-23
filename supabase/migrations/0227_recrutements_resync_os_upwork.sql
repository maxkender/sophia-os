-- Recrutements : resync depuis l'OS (posters orphelins) + ids Upwork Vik Studios.
-- Le seed 0222/0226 ne prenait que poster.manager_id = HM → France = dummy « A A »
-- et 0 vrai pipeline. Les 5 posters FR Sophia n'avaient pas de manager_id.

-- Dummy de test OS (compte clara.culture510, jamais posté).
delete from public.recrutement_createurs
where lower(coalesce(email_os, '')) = 'aa@sophia.com';

-- Rattacher les posters Sophia FR orphelins au HM France (remi).
update public.profiles p
set manager_id = hm.profile_id
from public.recrutement_hms hm
where hm.email_os = 'remim@sophia.com'
  and p.manager_id is null
  and exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p.id
      and ur.role = 'poster'
  )
  and exists (
    select 1
    from public.comptes c
    left join public.applications a on a.id = c.application_id
    where c.poster_id = p.id
      and c.is_active
      and c.langue = 'fr'
      and coalesce(a.slug, 'sophia') = 'sophia'
  )
  and lower(coalesce(p.email, '')) not like 'testt%'
  and lower(coalesce(p.email, '')) <> 'aa@sophia.com';

-- Seed créateurs OS manquants (y compris ceux qu'on vient de rattacher).
insert into public.recrutement_createurs (
  hm_id, profile_id, pays, prenom, nom, nom_affiche, email_os,
  avatar_url, rejoint_os_at, talks_at, codes_envoyes_at,
  warmup_at, premier_post_at
)
select distinct on (hm.id, poster.id, coalesce(c.langue, hm.pays[1], 'fr'))
  hm.id,
  poster.id,
  coalesce(c.langue, hm.pays[1], 'fr'),
  poster.prenom,
  poster.nom,
  coalesce(
    nullif(btrim(concat_ws(' ', poster.prenom, poster.nom)), ''),
    poster.email,
    poster.id::text
  ),
  poster.email,
  c.avatar_url,
  poster.created_at,
  poster.created_at,
  poster.created_at,
  c.warmup_started_at,
  (
    select min(po.publie_at)
    from public.posts po
    join public.comptes cx on cx.id = po.compte_id
    where cx.poster_id = poster.id
      and cx.langue = coalesce(c.langue, hm.pays[1], 'fr')
      and po.est_test is not true
      and po.publie_at is not null
  )
from public.recrutement_hms hm
join public.profiles poster on poster.manager_id = hm.profile_id
join public.user_roles ur on ur.user_id = poster.id and ur.role = 'poster'
left join public.comptes c
  on c.poster_id = poster.id and c.is_active
left join public.applications a on a.id = c.application_id
where lower(coalesce(poster.email, '')) not like 'testt%'
  and lower(coalesce(poster.prenom, '')) <> 'testt'
  and lower(coalesce(poster.email, '')) <> 'aa@sophia.com'
  and (c.id is null or coalesce(a.slug, 'sophia') = 'sophia')
  and not exists (
    select 1
    from public.recrutement_createurs x
    where x.hm_id = hm.id
      and x.profile_id = poster.id
      and x.pays = coalesce(c.langue, hm.pays[1], 'fr')
  )
order by hm.id, poster.id, coalesce(c.langue, hm.pays[1], 'fr'), c.created_at;

-- Ids freelancer Upwork (org Vik Studios, contrats ACTIVE 2026-09-08).
update public.recrutement_hms hm
set
  upwork_freelancer_id = m.uid,
  updated_at = now()
from (
  values
    ('reginan@sophia.com', '1986098203402530246')
) as m(email, uid)
where lower(hm.email_os) = m.email
  and (hm.upwork_freelancer_id is null or hm.upwork_freelancer_id is distinct from m.uid);

update public.recrutement_createurs c
set
  upwork_freelancer_id = m.uid,
  updated_at = now()
from (
  values
    ('amiraa@sophia.com', '2002389284768955639'),
    ('arisoae@sophia.com', '2017646576678524955'),
    ('elodiel@sophia.com', '1648036567291015168'),
    ('mariemes@sophia.com', '1990050905521154643'),
    ('nmesomau@sophia.com', '1635006871765172224'),
    ('patrickk@sophia.com', '2014347215833714688'),
    ('ridas@sophia.com', '1627640148927094784'),
    ('yannickpierrel@sophia.com', '1840410074609219581'),
    ('urszulab@sophia.com', '2092682836387763801'),
    ('dewim@sophia.com', '2087284593644763643'),
    ('sladanav@sophia.com', '1445377697389133824'),
    ('vojtechg@sophia.com', '1578047079456477184'),
    ('agness@sophia.com', '1896545903859487310'),
    ('dorat@sophia.com', '1630216181282414592'),
    ('harrietj@sophia.com', '1500914456195309568'),
    ('lilii@sophia.com', '1560663917186732032'),
    ('angelah@sophia.com', '1396165576007348224'),
    ('samsudeenw@sophia.com', '2028201843002783047'),
    ('rodrigop@sophia.com', '1567888948980658176'),
    ('meryemh@sophia.com', '2078544113065560165'),
    ('yusufd@sophia.com', '2074520398132817123'),
    ('gencaye@sophia.com', '1972301957748135058'),
    ('tugbat@sophia.com', '424167137167048704'),
    ('jesmoonj@sophia.com', '2077389833425426840'),
    ('nereag@sophia.com', '2032361240725337802'),
    ('mikaelae@sophia.com', '2074888423941118360'),
    ('khalilf@sophia.com', '1025495263414026240'),
    ('jessican@sophia.com', '1980765732273304951'),
    ('mariaa@sophia.com', '2082091633446241873'),
    ('yessicah@sophia.com', '1716129603734814720'),
    ('sofiiag@sophia.com', '1956733689509566536'),
    ('olenak@sophia.com', '1795739722921512960'),
    ('krzysztofk@sophia.com', '1726460304322052096'),
    ('pawelk@sophia.com', '2014124632275606973'),
    ('weronikak@sophia.com', '2087168185765492334'),
    ('dariaz@sophia.com', '1884555601146951678'),
    ('michalp@sophia.com', '1875938133166425401'),
    ('tomekb@sophia.com', '2077717799358825478'),
    ('martinb@sophia.com', '2080586260373453079'),
    ('janr@sophia.com', '2053504705620392698'),
    ('katerinai@sophia.com', '2021637573704789746'),
    ('biancab@sophia.com', '1948090981828606829'),
    ('elinas@sophia.com', '2030654831324084802'),
    ('palomap@sophia.com', '2024239319151700279'),
    ('samirak@sophia.com', '1941532991808701512'),
    ('jasmint@sophia.com', '2063348097079303325'),
    ('robinas@sophia.com', '1496549946748096512'),
    ('pedrom@sophia.com', '2092714645129467481'),
    ('komal1@sophia.com', '2053428073435606220'),
    ('sophiem@sophia.com', '2051154089413292665'),
    ('hadeethahs@sophia.com', '2053169818339012267'),
    ('mihala@sophia.com', '2077340934071100509'),
    ('luciad@sophia.com', '424305432865390592'),
    ('mohamedf@sophia.com', '2078176491438998534'),
    ('alicem@sophia.com', '1314858661823217664'),
    ('giannao@sophia.com', '1485935599052398592'),
    ('arencd@sophia.com', '1773437488988139520'),
    ('pantelism@sophia.com', '2021892345091436274'),
    ('roxanac@sophia.com', '1998330582737545352'),
    ('vinnia@sophia.com', '2053477933407320826'),
    ('nadiai@sophia.com', '2079550044776649830'),
    ('dragosp@sophia.com', '2082423745079112597'),
    ('angelb@sophia.com', '1875197252578903512'),
    ('mateip@sophia.com', '2077371773691729662'),
    ('teodorab@sophia.com', '1984687073906759586'),
    ('laurab@sophia.com', '1729092736745598976'),
    ('valentinan@sophia.com', '1876780367819080629'),
    ('dorisd@sophia.com', '2078387828536011599'),
    ('feruzas@sophia.com', '1486225731321229312'),
    ('danieln@sophia.com', '848900154354900992')
) as m(email, uid)
where lower(c.email_os) = m.email
  and (c.upwork_freelancer_id is null or c.upwork_freelancer_id is distinct from m.uid);

create unique index if not exists recrutement_createurs_hm_upwork_pays_idx
  on public.recrutement_createurs (hm_id, upwork_freelancer_id, pays)
  where upwork_freelancer_id is not null;

-- Contrats ACTIVE Vik Studios sans compte OS (pipeline créateur quand même).
insert into public.recrutement_createurs (
  hm_id, pays, prenom, nom, nom_affiche, upwork_freelancer_id, talks_at, contrat_signe_at
)
select hm.id, v.pays, v.prenom, v.nom, v.nom_affiche, v.uid, now(), now()
from (
  values
    ('remim@sophia.com', 'fr', 'Maharani', 'Aliya', 'Maharani Aliya', '2045145507632094107'),
    ('remim@sophia.com', 'fr', 'Maellys', 'Dubourg', 'Maellys Dubourg', '1978472780802906998'),
    ('pelinsue@sophia.com', 'nl', 'Doëlla', 'Kroll', 'Doëlla Kroll', '820982302120898560'),
    ('azzahras@sophia.com', 'pt', 'Claudia', 'Mesquita', 'Claudia Mesquita', '1766826976198131712'),
    ('masoomah@sophia.com', 'en', 'Nick', 'Oldfield', 'Nick Oldfield', '2076748563398763613')
) as v(hm_email, pays, prenom, nom, nom_affiche, uid)
join public.recrutement_hms hm on lower(hm.email_os) = v.hm_email
where not exists (
  select 1
  from public.recrutement_createurs x
  where x.upwork_freelancer_id = v.uid
);

-- Jobs Vik Studios (dernier job pertinent du pays du HM ; pas les jobs cancelled).
update public.recrutement_hms
set
  job_post_id = '2077668028454995122',
  job_post_titre = 'TikTok Creator/Social Media Poster (based in France)',
  job_post_at = '2026-07-16T08:13:54.146Z',
  updated_at = now()
where email_os = 'remim@sophia.com';

update public.recrutement_hms
set
  job_post_id = '2095958894395919557',
  job_post_titre = 'TikTok Content Posting for Slideshows (based in Germany)',
  job_post_at = '2026-09-04T19:35:16.458Z',
  ajoute_upwork_at = coalesce(ajoute_upwork_at, now()),
  updated_at = now()
where email_os = 'reginan@sophia.com';

-- Aram avait un job NL cancelled ; le pipeline réel est IT.
update public.recrutement_hms
set
  job_post_id = '2082487955554148279',
  job_post_titre = 'TikTok Poster in Italy for amazing Knowledge App',
  job_post_at = '2026-07-29T15:26:34.439Z',
  updated_at = now()
where email_os = 'aramh@sophia.com';

update public.recrutement_hms
set
  job_post_id = '2097282688857528047',
  job_post_titre = 'TikTok Content Posting for Slideshows (based in Portugal)',
  job_post_at = '2026-09-08T11:15:33.620Z',
  updated_at = now()
where email_os = 'azzahras@sophia.com';

-- Pays HM = langues déjà posées ∪ pays des créateurs rattachés.
update public.recrutement_hms hm
set pays = coalesce((
  select array_agg(distinct x order by x)
  from (
    select unnest(hm.pays) as x
    union
    select c.pays
    from public.recrutement_createurs c
    where c.hm_id = hm.id
  ) s
  where x is not null and length(btrim(x)) > 0
), hm.pays);
