-- Создание базы данных (выполнить отдельно)
CREATE DATABASE mafia_overlay;

-- Подключиться к базе: \c mafia_overlay

-- Расширение для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Таблица игроков
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nickname VARCHAR(50) NOT NULL,
    photo_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица турниров
CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    total_games INTEGER NOT NULL,
    total_tables INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'finished'))
);

-- Участники турнира (связь многие-ко-многим)
CREATE TABLE tournament_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    UNIQUE(tournament_id, player_id)
);

-- Таблица игр
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
    game_number INTEGER NOT NULL,
    table_number INTEGER NOT NULL DEFAULT 1,
    series_name VARCHAR(50),
    status VARCHAR(20) DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'finished')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Рассадка игры (10 игроков)
CREATE TABLE game_seating (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
    player_id UUID REFERENCES players(id),
    role VARCHAR(20) CHECK (role IN ('civilian', 'mafia', 'don', 'sheriff')),
    team VARCHAR(10) CHECK (team IN ('red', 'black')),
    is_eliminated BOOLEAN DEFAULT FALSE,
    elimination_reason VARCHAR(20) CHECK (elimination_reason IN ('voted', 'killed', 'mafia', 'don')),
    UNIQUE(game_id, position)
);

-- Круги игры
CREATE TABLE game_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    mafia_kill_player_id UUID REFERENCES players(id),
    mafia_miss BOOLEAN DEFAULT FALSE,
    don_check_player_id UUID REFERENCES players(id),
    sheriff_check_player_id UUID REFERENCES players(id),
    voted_out_players JSONB,
    nobody_voted_out BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, round_number)
);

-- Лучший ход
CREATE TABLE best_move (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE UNIQUE,
    first_killed_player_id UUID REFERENCES players(id),
    suspect_1 UUID REFERENCES players(id),
    suspect_2 UUID REFERENCES players(id),
    suspect_3 UUID REFERENCES players(id)
);

-- Текущие кандидаты на голосование
CREATE TABLE voting_nominees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, player_id)
);

-- Индексы для производительности
CREATE INDEX idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX idx_tournament_players_player ON tournament_players(player_id);
CREATE INDEX idx_games_tournament ON games(tournament_id);
CREATE INDEX idx_game_seating_game ON game_seating(game_id);
CREATE INDEX idx_game_rounds_game ON game_rounds(game_id);
CREATE INDEX idx_voting_nominees_game ON voting_nominees(game_id);
