-- Миграция: добавление колонки position в voting_nominees

-- Добавить колонку position
ALTER TABLE voting_nominees ADD COLUMN IF NOT EXISTS position INTEGER;

-- Создать индекс для быстрой сортировки
CREATE INDEX IF NOT EXISTS idx_voting_nominees_position ON voting_nominees(game_id, position);

-- Комментарий
COMMENT ON COLUMN voting_nominees.position IS 'Порядок выставления кандидата (1, 2, 3...)';
