(function() {
<<<<<<< HEAD
  // Базовый URL всегда совпадает с адресом, по которому открыта страница.
  // Бэкенд и фронтенд отдаются одним и тем же сервером, поэтому origin
  // подходит и для локальной сети, и для облачного хостинга.
  // При необходимости можно принудительно задать window.OVERLAY_BASE_URL до подключения этого файла.
  const baseUrl = window.OVERLAY_BASE_URL || window.location.origin;
=======
  // Автоматически определяем URL: если открыт на localhost — локальная версия,
  // иначе — используем текущий домен (для Render и др.)
  const isLocal = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname.startsWith('192.168.');

  const baseUrl = isLocal
    ? (window.OVERLAY_BASE_URL || 'http://192.168.0.121:3000')
    : window.location.origin;
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f

  window.OVERLAY_CONFIG = {
    API_URL: baseUrl + '/api',
    SOCKET_URL: baseUrl,
    BASE_URL: baseUrl
  };
<<<<<<< HEAD
})();
=======
})();
>>>>>>> b97b7072eb7decf4a1da26e2fa7ec060e7c7628f
