// c:\mafia-overlay\backend\socket\gameEvents.js
module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    
    let currentGameRoom = null;
    
    // Подключение к комнате игры
    socket.on('join_game', (gameId) => {
      // Выйти из предыдущей комнаты
      if (currentGameRoom) {
        socket.leave(currentGameRoom);
        console.log(`📤 Client ${socket.id} left ${currentGameRoom}`);
      }
      
      // Войти в новую комнату
      const roomName = `game_${gameId}`;
      socket.join(roomName);
      currentGameRoom = roomName;
      console.log(`📺 Client ${socket.id} joined game ${gameId}`);
      
      socket.emit('joined_game', { gameId, roomName });
    });
    
    // 🔁 Единый канал обновления игры
    socket.on('game_updated', (data) => {
      if (!data || !data.gameId) return;
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'full_update',
        data
      });
    });

    // Обновление ролей (старый вариант, оставляем для совместимости)
    socket.on('roles_updated', (data) => {
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'roles_updated',
        data: data
      });
    });

    // Новый вариант: отдельное событие roles_changed,
    // чтобы админка и оверлей могли анимировать смену ролей
    socket.on('roles_changed', (data) => {
      if (!data || !data.gameId) return;
      io.to(`game_${data.gameId}`).emit('roles_changed', {
        gameId: data.gameId,
        positions: data.positions || []
      });
    });
    
    // Установка ЛХ
    socket.on('best_move_set', (data) => {
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'best_move_set',
        data: data
      });
    });
    
    // Обновление выставленных
    socket.on('nominees_updated', (data) => {
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'nominees_updated',
        data: data
      });
    });
    
    // Добавление круга
    socket.on('round_added', (data) => {
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'round_added',
        data: data
      });
    });
    
    // Выбытие игрока
    socket.on('player_eliminated', (data) => {
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'player_eliminated',
        data: data
      });
    });
    
    // Отключение
    socket.on('disconnect', () => {
      if (currentGameRoom) {
        console.log(`📤 Client ${socket.id} disconnected from ${currentGameRoom}`);
      }
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });
};
