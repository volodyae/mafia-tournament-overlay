(function() {
  // Автоматически определяем URL: если открыт на localhost — локальная версия,
  // иначе — используем текущий домен (для Render и др.)
  const isLocal = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname.startsWith('192.168.');

  const baseUrl = isLocal
    ? (window.OVERLAY_BASE_URL || 'http://192.168.0.121:3000')
    : window.location.origin;

  window.OVERLAY_CONFIG = {
    API_URL: baseUrl + '/api',
    SOCKET_URL: baseUrl,
    BASE_URL: baseUrl
  };
})();
