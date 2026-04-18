// frontend/admin/js/ui.js

window.UI = window.UI || {};

// Проверка авторизации на всех страницах кроме login
UI.checkAuth = function() {
  // Не проверяем на странице логина
  if (window.location.pathname.includes('login.html')) return;

  const token = localStorage.getItem('auth_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
};

// Вызываем при загрузке
UI.checkAuth();

// Тосты
UI.showToast = UI.showToast || function (message, type = 'info') {
  console.log(`[${type}] ${message}`);

  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
};

UI.showEmpty = UI.showEmpty || function (container, message) {
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
};

UI.formatDate = UI.formatDate || function (dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

UI.showLoading = UI.showLoading || function (container) {
  if (!container) return;
  container.innerHTML = `<div class="loading-state"><p>Загрузка...</p></div>`;
};

UI.hideLoading = UI.hideLoading || function (container) {};

UI.confirm = UI.confirm || function (message) {
  return window.confirm(message);
};
