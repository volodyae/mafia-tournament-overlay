-- 004_auth_system.sql

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'user')),
    subscription_until TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Привязка турниров к владельцу
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

-- Индекс
CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments(owner_id);

-- Создаём суперадмина (пароль: admin123 — сменишь после первого входа)
-- Хеш пароля будет вставлен через сервер при первом запуске
