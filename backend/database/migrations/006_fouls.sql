-- 006_fouls.sql
-- Независимый счётчик фолов у игрока в конкретной игре
ALTER TABLE game_seating ADD COLUMN IF NOT EXISTS fouls INTEGER NOT NULL DEFAULT 0;