-- 0687 : deux règles dans Support → Règles (Max, 12/11), lues par le bot et le parcours Ruul.
-- Additif : deux lignes ajoutées si absentes ; aucune ligne existante modifiée.
insert into public.support_infos (cle, titre, valeur, ordre)
select v.cle, v.titre, v.valeur, v.ordre
  from (values
    ('date_limite', 'Date limite avant le début',
     'Deadline: Sunday at midnight (Paris time), the day before your start Monday. Same rule for Upwork and Ruul.', 12),
    ('bonus_parrainage', 'Bonus de parrainage',
     'Referral bonus: $10 to the person who referred a friend, once the friend has finished their first week of posts.', 13)
  ) as v(cle, titre, valeur, ordre)
 where not exists (select 1 from public.support_infos s where s.cle = v.cle);
