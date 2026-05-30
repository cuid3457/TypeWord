-- Add 8 more pastel backgrounds (5 solids + 3 gradients) so the picker
-- catalog feels generously stocked. All hues remain low-saturation pastels
-- so the avatar's dark initial letter stays legible on every swatch.
--
-- Distribution after this migration: 20 total backgrounds
--   common (10): cream, sky, mint, sand, sage, blush, rose, clay, mauve, olive
--   rare    (5): lavender, peach, butter, periwinkle, slate
--   epic    (5): aurora, sunset, ocean, berry, honey

INSERT INTO mystery_box_items (id, kind, rarity, weight, direct_price, payload) VALUES
  -- Solids
  ('bg_color_rose',   'background', 'common', 1, 100,
    '{"type":"solid","color":"#ECB7C2"}'::jsonb),
  ('bg_color_clay',   'background', 'common', 1, 100,
    '{"type":"solid","color":"#D9B89E"}'::jsonb),
  ('bg_color_mauve',  'background', 'common', 1, 100,
    '{"type":"solid","color":"#C8B0C0"}'::jsonb),
  ('bg_color_olive',  'background', 'common', 1, 100,
    '{"type":"solid","color":"#C8CBA0"}'::jsonb),
  ('bg_color_slate',  'background', 'rare',   1, 100,
    '{"type":"solid","color":"#B8C2CC"}'::jsonb),
  -- Gradients
  ('bg_color_ocean',  'background', 'epic',   1, 100,
    '{"type":"gradient","from":"#CBE3D5","to":"#C7DBEC","direction":"diagonal"}'::jsonb),
  ('bg_color_berry',  'background', 'epic',   1, 100,
    '{"type":"gradient","from":"#ECB7C2","to":"#DDD2EB","direction":"vertical"}'::jsonb),
  ('bg_color_honey',  'background', 'epic',   1, 100,
    '{"type":"gradient","from":"#F4F1EA","to":"#F2E5C0","direction":"diagonal"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
