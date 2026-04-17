ALTER TABLE game_seating
ADD COLUMN IF NOT EXISTS card VARCHAR(10) CHECK (card IN ('none', 'yellow', 'red')) DEFAULT 'none';
