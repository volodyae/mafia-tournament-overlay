-- 005_penalties_and_draw.sql
-- Штрафы, авто-штраф за карточки, ничья, критичность удаления

-- 1. Ручной штраф судьи (минусы) — отдельно от judge_bonus (плюсы)
ALTER TABLE game_player_scores
  ADD COLUMN IF NOT EXISTS penalty_score NUMERIC(4,2) DEFAULT 0;

-- 2. Авто-штраф за карточки/удаление (считается системой)
ALTER TABLE game_player_scores
  ADD COLUMN IF NOT EXISTS card_penalty NUMERIC(4,2) DEFAULT 0;

-- 3. Критичность удаления игрока (для расчёта -0.5 / -1)
ALTER TABLE game_seating
  ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Разрешаем ничью в результатах игры.
--    Старое ограничение допускало только 'red'/'black'.
ALTER TABLE game_results
  DROP CONSTRAINT IF EXISTS game_results_winner_team_check;

ALTER TABLE game_results
  ADD CONSTRAINT game_results_winner_team_check
  CHECK (winner_team IN ('red', 'black', 'draw'));
