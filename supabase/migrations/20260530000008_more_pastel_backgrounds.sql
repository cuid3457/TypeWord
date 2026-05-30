-- Add 6 more pastel backgrounds for the free profile-background picker.
-- All hues tuned to harmonize with the #2EC4A5 mint accent + #F4F1EA cream
-- canvas. Rarity field is retained for schema consistency but has no
-- gameplay effect for backgrounds (they're free, not gacha).
--
-- Distribution after this migration: 12 total backgrounds
--   common (6): cream, sky, mint, sand, sage, blush
--   rare   (4): lavender, peach, butter, periwinkle
--   epic   (2): aurora, sunset

INSERT INTO mystery_box_items (id, kind, rarity, weight, direct_price, payload) VALUES
  ('bg_color_sand',       'background', 'common', 1, 100,
    '{"type":"solid","color":"#EFE9D8"}'::jsonb),
  ('bg_color_sage',       'background', 'common', 1, 100,
    '{"type":"solid","color":"#D8E0C8"}'::jsonb),
  ('bg_color_blush',      'background', 'common', 1, 100,
    '{"type":"solid","color":"#F0D8DC"}'::jsonb),
  ('bg_color_butter',     'background', 'rare',   1, 100,
    '{"type":"solid","color":"#F2E5C0"}'::jsonb),
  ('bg_color_periwinkle', 'background', 'rare',   1, 100,
    '{"type":"solid","color":"#CFD4E8"}'::jsonb),
  ('bg_color_sunset',     'background', 'epic',   1, 100,
    '{"type":"gradient","from":"#F9D5C8","to":"#DDD2EB","direction":"diagonal"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
