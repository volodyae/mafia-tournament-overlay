// c:\mafia-overlay\backend\socket\gameEvents.js
module.exports = (io) => {

  // ID сокета OBS-моста (один на сервер)
  let obsBridgeSocketId = null;

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    
    let currentGameRoom = null;
    
    // Подключение к комнате игры
    socket.on('join_game', (gameId) => {
      if (currentGameRoom) {
        socket.leave(currentGameRoom);
        console.log(`📤 Client ${socket.id} left ${currentGameRoom}`);
      }
      
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
    
    // Результаты игры подтверждены — показать таблицу на оверлее
    socket.on('game_scores_confirmed', (data) => {
      if (!data || !data.gameId) return;
      io.to(`game_${data.gameId}`).emit('game_scores_confirmed', {
        gameId: data.gameId,
        tournamentId: data.tournamentId
      });
    });

    // Показ промежуточного итога турнира
    socket.on('show_tournament_standings', (data) => {
      if (!data || !data.gameId || !data.tournamentId) return;
      io.to(`game_${data.gameId}`).emit('show_tournament_standings', {
        gameId: data.gameId,
        tournamentId: data.tournamentId
      });
    });

    // Скрыть таблицу результатов / вернуть обычный оверлей
    socket.on('hide_results_overlay', (data) => {
      if (!data || !data.gameId) return;
      io.to(`game_${data.gameId}`).emit('hide_results_overlay', {
        gameId: data.gameId
      });
    });

    // Переключение оверлея на следующую игру
    socket.on('switch_overlay_game', (data) => {
      if (!data || !data.currentGameId || !data.nextGameNumber) return;
      io.to(`game_${data.currentGameId}`).emit('switch_overlay_game', {
        tournamentId: data.tournamentId,
        currentGameId: data.currentGameId,
        nextGameNumber: data.nextGameNumber
      });
    });

    // ========== OBS BRIDGE ==========

    // Мост регистрируется
    socket.on('obs_bridge_register', () => {
      obsBridgeSocketId = socket.id;
      console.log(`🔗 OBS Bridge registered: ${socket.id}`);
    });

    // Админка отправляет команду OBS (switch_scene, get_scenes)
    socket.on('obs_command', (data) => {
      if (obsBridgeSocketId) {
        io.to(obsBridgeSocketId).emit('obs_command', data);
      } else {
        socket.emit('obs_status', { connected: false });
      }
    });

    // Мост сообщает статус OBS (connected, scenes, currentScene)
    socket.on('obs_status', (data) => {
      // Отправляем всем кроме моста
      socket.broadcast.emit('obs_status', data);
    });

    // Мост сообщает об изменении сцены
    socket.on('obs_scene_changed', (data) => {
      socket.broadcast.emit('obs_scene_changed', data);
    });

    // ========== /OBS BRIDGE ==========

    // Отключение
    socket.on('disconnect', () => {
      if (currentGameRoom) {
        console.log(`📤 Client ${socket.id} disconnected from ${currentGameRoom}`);
      }
      // Если отключился мост — сбрасываем
      if (socket.id === obsBridgeSocketId) {
        obsBridgeSocketId = null;
        console.log(`🔗 OBS Bridge disconnected`);
        io.emit('obs_status', { connected: false });
      }
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });
};
