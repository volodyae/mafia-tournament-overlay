# Mafia Overlay

Веб‑сервис для проведения игр в спортивную мафию: админ‑панель для судьи и красивый оверлей для трансляции (OBS, стримы и т.д.).

## Возможности

- Управление турнирами и играми
- Список игроков турнира и рассадка по столу
- Назначение ролей (мирные, мафия, дон, шериф)
- Фиксация кругов: убийства, проверки дона/шерифа, голосование
- ЛХ (лучший ход) с выбором ПУ и тройки подозреваемых
- Список выставленных на голосование
- Карточки игроков (ЖК/КК), удаление игрока
- Реальный тайм через Socket.IO: админка ↔ оверлей
- Оверлей под OBS (1920×1080, автоскейл под любое окно)

## Технологии

- Backend: Node.js, Express, Socket.IO
- База данных: PostgreSQL
- Миграции/SQL: чистый SQL (`backend/db/migrations/init.sql`)
- Frontend:
  - Админ‑панель: ванильный JS + HTML/CSS
  - Оверлей: чистый HTML/CSS/JS + Socket.IO
- Загрузка фото игроков: Multer, сохранение в `frontend/uploads`

## Структура проекта

```text
backend/
  server.js          # Точка входа backend
  routes/            # REST API (tournaments, games, players, upload и т.д.)
  models/            # Логика работы с БД
  db/
    migrations/
      init.sql       # Схема PostgreSQL
  .env               # Настройки (БД, порты, BASE_URL и др.)

frontend/
  admin/             # Админка (HTML + JS + CSS)
  overlay/           # Оверлей для OBS (index.html + иконки)
  uploads/           # Фото игроков
  config.js          # Конфиг URL'ов API / Socket / Base

Требования
Node.js (LTS)

PostgreSQL

npm или yarn

Установка и запуск локально
Клонировать репозиторий:

bash
git clone https://github.com/username/mafia-overlay.git
cd mafia-overlay
Установить зависимости backend’а:

bash
cd backend
npm install
Настроить базу данных PostgreSQL и создать схему:

Создай БД (например, mafia_overlay)

В файле backend/db/migrations/init.sql лежит вся схема

Применить миграцию:

bash
psql -h localhost -U postgres -d mafia_overlay -f backend/db/migrations/init.sql
(логин/пароль и имя БД подставь свои)

Настроить .env в backend/:

text
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mafia_overlay
DB_USER=postgres
DB_PASSWORD=your_password

PORT=3000
NODE_ENV=development

CORS_ORIGIN=*

UPLOAD_DIR=../frontend/uploads
MAX_FILE_SIZE=5242880

# В локальной сети — IP машины, где крутится сервер
BASE_URL=http://192.168.0.121:3000
Настроить frontend config.js:

frontend/config.js:

js
window.OVERLAY_CONFIG = {
  API_URL: window.OVERLAY_API_URL || 'http://192.168.0.121:3000/api',
  SOCKET_URL: window.OVERLAY_SOCKET_URL || 'http://192.168.0.121:3000',
  BASE_URL: window.OVERLAY_BASE_URL || 'http://192.168.0.121:3000'
};
Если IP компьютера в сети другой — поменяй 192.168.0.121 на актуальный.

Запуск backend’а:

bash
cd backend
npm start
# или
node server.js
По умолчанию сервер поднимется на http://localhost:3000.

Доступ к админке и оверлею
Админ‑панель:
http://<IP_СЕРВЕРА>:3000/admin/index.html

Конкретная игра:
http://<IP_СЕРВЕРА>:3000/admin/game.html?tournament=<tournament_id>&game=<номер_игры>

Оверлей для OBS/браузера:
http://<IP_СЕРВЕРА>:3000/overlay/index.html?tournament=<tournament_id>&game=<номер_игры>

Например, в локальной сети (сервер на 192.168.0.121):

text
Админка: http://192.168.0.121:3000/admin/index.html
Оверлей: http://192.168.0.121:3000/overlay/index.html?tournament=...&game=1
Использование с OBS
В OBS добавь «Browser Source».

В поле URL вставь ссылку на оверлей:
http://<IP_СЕРВЕРА>:3000/overlay/index.html?tournament=...&game=...

Установи размер источника: ширина 1920, высота 1080.

Оверлей сам масштабируется под окно при любых размерах сцены.

Деплой в онлайн (Render)
Проект можно развернуть на Render (есть бесплатный тариф для Node.js + PostgreSQL):

Выложи репозиторий на GitHub.

В Render создай:

Web Service для backend’а (Node.js),

PostgreSQL Database (Free tier).

Пропиши переменные окружения (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, BASE_URL и др.) в панели Render.

В BASE_URL, API_URL, SOCKET_URL используй домен, который выдаст Render, например:

https://your-app.onrender.com

Перезапусти сервис — админка и оверлей будут доступны по публичному URL.

Лицензия
Проект используется автором для личных и коммерческих стримов. Добавь свою лицензию/условия использования здесь.