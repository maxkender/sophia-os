-- 0833 : les réponses officielles aux problèmes de contenu (22/11, Max). Additif.
-- Les 4 réponses (aussi dans les règles du bot : _shared/support_situations.ts), validées ; une consigne ; Quality
-- Control peut marquer un signalement traité.
insert into public.reponses_officielles (question, reponse, ordre, actif, portee, niveau, formulations)
select q, r, o, true, 'tous', 'bot', f
from (values
  ('Content: the text makes no sense, wrong language or mixed languages',
   'Translate it into your language as best you can and post it.', 71,
   array['the text makes no sense', 'the text is in the wrong language', 'the post mixes two languages']),
  ('Content: text far too long, images unrelated to the text, broken image, or a real TikTok problem',
   'Please post an old TikTok you already posted. Today counts as done.', 72,
   array['the text is too long', 'the images do not match the text', 'an image is broken', 'TikTok will not let me post it']),
  ('Content: the text is already on the images (no text to paste)',
   'That''s normal, the text is already on the images, just post the photos.', 73,
   array['there is no text to paste', 'the text is already written on the images']),
  ('Content: I changed the font or the colour so the text is readable',
   'That''s fine.', 74,
   array['I used white instead of black', 'I changed the font so the text is visible'])
) v(q, r, o, f)
where not exists (select 1 from public.reponses_officielles x where x.question = v.q);
update public.reponses_officielles set valide_at = now()
 where question like 'Content: %' and valide_at is null;

insert into public.support_consignes (texte, actif)
select x, true from unnest(array[
  'Problèmes de contenu : réponds tout de suite avec la réponse officielle (texte sans sens ou mauvaise langue → traduire et poster ; texte trop long, images sans rapport, image cassée ou problème TikTok → poster un ancien TikTok, le jour compte ; texte déjà sur les images → poster les photos ; police ou couleur changée → That''s fine). Jamais « we''re checking » ni ticket ; le contenu est signalé à Quality Control. Si la même question revient, redonne la réponse.'
]) x
where not exists (select 1 from public.support_consignes c where c.texte = x);

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'contenu_signalements' and policyname = 'contenu_signalements_admin_maj') then
    create policy contenu_signalements_admin_maj on public.contenu_signalements for update to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
