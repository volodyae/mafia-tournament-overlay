module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Подключение к комнате игры
    socket.on('join_game', (gameId) => {
      socket.join(`game_${gameId}`);
      console.log(`📺 Client ${socket.id} joined game ${gameId}`);
    });

    // Обновление ролей
    socket.on('roles_updated', (data) => {
      io.to(`game_${data.gameId}`).emit('game_updated', {
        type: 'roles_updated',
        data: data
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
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });
};
