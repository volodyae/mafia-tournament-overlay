-- 008_round_check_none.sql
-- Разделяем "проверка не введена" (NULL) и "не проверял" (флаг TRUE)
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS don_check_none BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS sheriff_check_none BOOLEAN NOT NULL DEFAULT FALSE;

-- Старые данные: раньше NULL означал "не проверял" — сохраняем вид старых игр,
-- но только для кругов, где ночь уже была введена (отстрел или промах)
UPDATE game_rounds SET don_check_none = TRUE
 WHERE don_check_player_id IS NULL AND (mafia_kill_player_id IS NOT NULL OR mafia_miss = TRUE);
UPDATE game_rounds SET sheriff_check_none = TRUE
 WHERE sheriff_check_player_id IS NULL AND (mafia_kill_player_id IS NOT NULL OR mafia_miss = TRUE);