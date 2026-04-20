# Mafia Overlay

Веб-сервис для проведения турниров по спортивной мафии: админ-панель для судьи, красивый оверлей для OBS-трансляции, система подсчёта баллов по правилам ФИИМ.

## Возможности

### Управление турниром
- Создание турниров с автоматической генерацией игр
- Рассадка игроков за стол (10 мест)
- Назначение ролей: мирные, мафия, дон, шериф
- Фиксация кругов: убийства ночью, проверки дона/шерифа, дневное голосование
- ЛХ (лучший ход): выбор первого убитого и тройки подозреваемых
- Выставление на голосование в реальном времени
- Карточки игроков (ЖК/КК), удаление из игры

### Подсчёт баллов
- Автоматический расчёт по правилам ФИИМ:
  - Балл за победу (1.0 / 0.0)
  - Дополнительный балл судьи (от -3.0 до +2.0)
  - ЛХ: +0.5 за 3 угаданных чёрных, +0.3 за 2
  - Компенсационные баллы Ci по формуле (i × 0.4) / B с коэффициентами
- Промежуточная турнирная таблица с сортировкой по правилам 7.8.1–7.8.6

### Оверлей для OBS
- Разрешение 1920×1080 с автомасштабированием
- Карточки игроков с фотографиями и ролями
- Таблица кругов, ЛХ, выставленные на голосование
- Анимированная таблица результатов после игры
- Промежуточный итог турнира с фото лидера
- Обновление в реальном времени через WebSocket

### Система пользователей
- Авторизация по логину/паролю (JWT)
- Роли: суперадмин и пользователь
- Управление подписками (срок действия)
- Изоляция данных: пользователь видит только свои турниры
- Общая база игроков для всех пользователей

## Технологии

- **Backend:** Node.js, Express, Socket.IO, JWT, bcrypt
- **База данных:** PostgreSQL
- **Frontend:** HTML/CSS/JS (без фреймворков)
- **Реалтайм:** Socket.IO (админка ↔ оверлей)
- **Загрузка фото:** Multer

## Структура проекта

```text
backend/
  server.js                    # Точка входа
  config/database.js           # Подключение к PostgreSQL
  middleware/auth.js            # JWT авторизация
  routes/
    auth.js                    # Логин, управление пользователями
    tournaments.js             # CRUD турниров
    games.js                   # Управление играми, расчёт баллов
    players.js                 # База игроков
    upload.js                  # Загрузка фотографий
  models/                      # Модели данных
  socket/gameEvents.js         # WebSocket события
  scripts/create-superadmin.js # Создание суперадмина
  database/
    init.sql                   # Схема БД
    migrations/                # Миграции

frontend/
  config.js                    # Автоконфигурация URL
  admin/
    login.html                 # Страница входа
    index.html                 # Список турниров
    tournament.html            # Управление турниром
    game.html                  # Управление игрой
    players.html               # База игроков
    css/admin.css              # Стили админки
    js/
      api.js                   # API-клиент с авторизацией
      ui.js                    # UI-утилиты
      game.js                  # Логика страницы игры
      tournaments.js           # Список турниров
      tournament.js            # Управление турниром
      players.js               # База игроков
  overlay/
    index.html                 # Оверлей для OBS
    icons/                     # SVG-иконки
  uploads/                     # Фотографии игроков


Установка и запуск локально
Требования
Node.js 18+
PostgreSQL 14+
1. Клонировать репозиторий
Copygit clone https://github.com/username/mafia-overlay.git
cd mafia-overlay
2. Установить зависимости
Copycd backend
npm install
3. Создать и настроить БД
Copypsql -U postgres
CREATE DATABASE mafia_overlay;
\q

psql -U postgres -d mafia_overlay -f backend/database/init.sql
psql -U postgres -d mafia_overlay -f backend/database/migrations/001_add_position_to_voting_nominees.sql
psql -U postgres -d mafia_overlay -f backend/database/migrations/002_add_cards_to_game_seating.sql
psql -U postgres -d mafia_overlay -f backend/database/migrations/003_game_results_and_scores.sql
psql -U postgres -d mafia_overlay -f backend/database/migrations/004_auth_system.sql
Copy-- В psql:
ALTER TABLE game_player_scores ALTER COLUMN judge_bonus TYPE NUMERIC(4,2);
ALTER TABLE game_player_scores ALTER COLUMN total_score TYPE NUMERIC(5,2);
ALTER TABLE game_player_scores ALTER COLUMN ci_score TYPE NUMERIC(4,2);
ALTER TABLE game_player_scores ALTER COLUMN lh_score TYPE NUMERIC(4,2);
ALTER TABLE game_player_scores ALTER COLUMN win_score TYPE NUMERIC(4,2);
4. Настроить .env
CopyDB_HOST=localhost
DB_PORT=5432
DB_NAME=mafia_overlay
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*
JWT_SECRET=your-secret-key-change-me
UPLOAD_DIR=../frontend/uploads
MAX_FILE_SIZE=5242880
BASE_URL=http://192.168.0.121:3000
5. Создать суперадмина
Copynode scripts/create-superadmin.js admin your_password
6. Запустить
Copynpm start
Доступ
Страница	URL
Логин	http://<IP>:3000/admin/login.html
Админка	http://<IP>:3000/admin/index.html
Оверлей	http://<IP>:3000/overlay/index.html?tournament=<id>&game=<num>
Использование с OBS
Добавьте Browser Source в OBS
URL: http://<IP>:3000/overlay/index.html?tournament=<id>&game=<num>
Размер: 1920 × 1080
Оверлей автоматически масштабируется
Деплой на Render.com
Залейте проект на GitHub
На Render создайте PostgreSQL Database (Free)
Создайте Web Service, подключите репозиторий
Build Command: cd backend && npm install
Start Command: node backend/server.js
Добавьте переменные окружения: DATABASE_URL, JWT_SECRET, BASE_URL, PORT, NODE_ENV=production
Инициализируйте БД через PSQL-консоль Render
Создайте суперадмина через Shell: node backend/scripts/create-superadmin.js admin password
Лицензия
Проект разработан для организации турниров по спортивной мафии. Коммерческое использование — с разрешения автора.

Copy