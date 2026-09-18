-- A user's own picture: the uploaded image (kept so the circle can be chosen again), the circle
-- chosen from it as fractions of the image, and the id of the rendition shown everywhere.
ALTER TABLE users
  ADD COLUMN avatar_source_key text,
  ADD COLUMN avatar_crop jsonb,
  ADD COLUMN avatar_id uuid;
ALTER TABLE users ADD CONSTRAINT users_avatar_all_or_none CHECK (
  (avatar_source_key IS NULL) = (avatar_crop IS NULL) AND (avatar_crop IS NULL) = (avatar_id IS NULL)
);
