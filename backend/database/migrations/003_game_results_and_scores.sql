-- 003_game_results_and_scores.sql

CREATE TABLE IF NOT EXISTS game_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID UNIQUE REFERENCES games(id) ON DELETE CASCADE,
    winner_team VARCHAR(10) NOT NULL CHECK (winner_team IN ('red','black')),
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_player_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),

    judge_bonus NUMERIC(3,1) DEFAULT 0,   -- -3.0 .. 2.0
    lh_score   NUMERIC(2,1) DEFAULT 0,    -- 0 / 0.3 / 0.5
    ci_score   NUMERIC(2,1) DEFAULT 0,    -- 0 .. 0.4
    win_score  NUMERIC(2,1) DEFAULT 0,    -- 1 или 0
    total_score NUMERIC(4,2) DEFAULT 0,

    UNIQUE(game_id, player_id)
);
