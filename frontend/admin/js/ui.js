// frontend/admin/js/ui.js

window.UI = window.UI || {};

// Тосты
UI.showToast = UI.showToast || function (message, type = 'info') {
  console.log(`[${type}] ${message}`);
  // при желании:
  // alert(message);
};

// Пустое состояние списка
UI.showEmpty = UI.showEmpty || function (container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <p>${message}</p>
    </div>
  `;
};

// Форматирование даты
UI.formatDate = UI.formatDate || function (dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();

  return `${dd}.${mm}.${yyyy}`;
};

// Лоадер для списков (страница турниров и др.)
UI.showLoading = UI.showLoading || function (container) {
  if (!container) return;
  container.innerHTML = `
    <div class="loading-state">
      <p>Загрузка...</p>
    </div>
  `;
};

UI.hideLoading = UI.hideLoading || function (container) {
  // Можно ничего не делать: контейнер всё равно перерисуешь render-функцией
  // оставлено для совместимости, если вдруг где-то вызывается
};

// Диалог подтверждения
UI.confirm = UI.confirm || function (message) {
  return window.confirm(message);
};
