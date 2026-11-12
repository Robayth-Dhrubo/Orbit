-- Keep the published booking limits true even for writes through repositories or
-- administrative SQL. Do not rewrite 001: deployed migration checksums are immutable.
-- Existing invalid data makes this migration fail atomically, without truncation.
ALTER TABLE appointments
  ADD CONSTRAINT appointments_topic_bounds
    CHECK (char_length(topic) BETWEEN 1 AND 200 AND topic !~ '^[[:space:]]*$'),
  ADD CONSTRAINT appointments_notes_bounds
    CHECK (notes IS NULL OR char_length(notes) <= 4000);
