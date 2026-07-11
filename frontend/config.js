(function() {
  // Базовый URL всегда совпадает с адресом, по которому открыта страница.
  // Бэкенд и фронтенд отдаются одним и тем же сервером, поэтому origin
  // подходит и для локальной сети, и для облачного хостинга.
  // При необходимости можно принудительно задать window.OVERLAY_BASE_URL до подключения этого файла.
  const baseUrl = window.OVERLAY_BASE_URL || window.location.origin;

  window.OVERLAY_CONFIG = {
    API_URL: baseUrl + '/api',
    SOCKET_URL: baseUrl,
    BASE_URL: baseUrl
  };
})();
