-- 007_tournament_access.sql
-- Доступ пользователей к турнирам (many-to-many)
CREATE TABLE IF NOT EXISTS tournament_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_access_user ON tournament_access(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_access_tournament ON tournament_access(tournament_id);