insert into habit_templates
  (slug, name, description, category, habit_type, icon, default_target, default_unit, default_frequency)
values
  ('no-added-sugar','No added sugar','Choose steady energy today.','diet','avoid','🍬',null,null,'{"kind":"daily"}'),
  ('daily-steps','Daily steps','Keep moving at a pace that feels good.','steps','count','👣',8000,'steps','{"kind":"daily"}'),
  ('read-learn','Read & learn','Make a little room for curiosity.','learning','duration','📚',20,'minutes','{"kind":"daily"}'),
  ('gym-visits','Gym visits','Build a sustainable movement routine.','gym','do','🏋️',4,'sessions','{"kind":"weekly_target","target":4}'),
  ('food-diary','Food diary','Notice what nourishes you.','food','do','🥗',null,null,'{"kind":"daily"}')
on conflict (slug) do nothing;
