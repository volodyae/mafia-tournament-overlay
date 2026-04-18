// Скрипт для создания суперадмина
// Запуск: node scripts/create-superadmin.js

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const SUPERADMIN_USERNAME = process.argv[2] || 'admin';
const SUPERADMIN_PASSWORD = process.argv[3] || 'admin123';

async function createSuperadmin() {
  try {
    // Проверяем, есть ли уже суперадмин
    const existing = await pool.query(
      "SELECT id FROM users WHERE role = 'superadmin' LIMIT 1"
    );

    if (existing.rows.length > 0) {
      console.log('⚠️  Суперадмин уже существует. Обновляем пароль...');
      const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
      await pool.query(
        'UPDATE users SET password_hash = $1, username = $2 WHERE role = $3',
        [hash, SUPERADMIN_USERNAME, 'superadmin']
      );
      console.log(`✅ Пароль суперадмина обновлён`);
    } else {
      const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
      await pool.query(
        `INSERT INTO users (id, username, password_hash, role, is_active)
         VALUES ($1, $2, $3, 'superadmin', TRUE)`,
        [uuidv4(), SUPERADMIN_USERNAME, hash]
      );
      console.log(`✅ Суперадмин создан`);
    }

    console.log(`   Логин: ${SUPERADMIN_USERNAME}`);
    console.log(`   Пароль: ${SUPERADMIN_PASSWORD}`);
    console.log(`   ⚠️  Смените пароль после первого входа!`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

createSuperadmin();
