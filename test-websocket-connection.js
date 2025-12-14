// Тест подключения WebSocket
const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3001';
const CONNECTION_TIMEOUT = 5000;

function testWebSocketConnection() {
  return new Promise((resolve, reject) => {
    console.log('=== Тест подключения WebSocket ===');
    console.log(`Подключение к ${WS_URL}...`);
    
    const ws = new WebSocket(WS_URL);
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error('Таймаут подключения WebSocket'));
      }
    }, CONNECTION_TIMEOUT);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        console.log('✓ WebSocket подключен успешно');
        console.log('  ReadyState:', ws.readyState);
        console.log('  Protocol:', ws.protocol);
        
        // Отправляем тестовое сообщение
        const testMessage = {
          type: 'submit',
          code: 'console.log("test");',
          input: '1\n',
          expected: 'test'
        };
        
        ws.send(JSON.stringify(testMessage));
        console.log('✓ Тестовое сообщение отправлено');
        
        // Закрываем соединение через 2 секунды
        setTimeout(() => {
          ws.close();
          resolve({
            success: true,
            message: 'WebSocket подключение работает'
          });
        }, 2000);
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        console.error('✗ Ошибка WebSocket:', error.message);
        reject(error);
      }
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('✓ Получено сообщение:', message.type);
        if (message.type === 'status') {
          console.log('  Статус:', message.status);
        } else if (message.type === 'results') {
          console.log('  Результаты получены');
          console.log('  Summary:', message.summary ? '✓' : '✗');
        } else if (message.type === 'error') {
          console.log('  Ошибка:', message.message);
        }
      } catch (err) {
        console.error('Ошибка парсинга сообщения:', err);
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`Соединение закрыто (код: ${code}, причина: ${reason || 'нет'})`);
      if (!resolved) {
        resolved = true;
        if (code === 1000) {
          resolve({
            success: true,
            message: 'WebSocket соединение закрыто нормально'
          });
        } else {
          reject(new Error(`WebSocket закрыт с ошибкой: код ${code}`));
        }
      }
    });
  });
}

function testWebSocketReconnection() {
  return new Promise((resolve, reject) => {
    console.log('\n=== Тест переподключения WebSocket ===');
    
    let connectionCount = 0;
    const maxConnections = 3;
    
    function connect() {
      connectionCount++;
      console.log(`Попытка подключения #${connectionCount}...`);
      
      const ws = new WebSocket(WS_URL);
      let connected = false;
      
      const timeout = setTimeout(() => {
        if (!connected) {
          ws.close();
          if (connectionCount < maxConnections) {
            console.log('Таймаут, переподключение через 1 секунду...');
            setTimeout(connect, 1000);
          } else {
            reject(new Error('Достигнуто максимальное количество попыток подключения'));
          }
        }
      }, 3000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        connected = true;
        console.log(`✓ Подключение #${connectionCount} успешно`);
        
        // Закрываем соединение для теста переподключения
        setTimeout(() => {
          console.log('Закрываем соединение для теста переподключения...');
          ws.close();
        }, 1000);
      });
      
      ws.on('close', (code) => {
        if (code !== 1000 && connectionCount < maxConnections) {
          console.log(`Соединение закрыто (код: ${code}), переподключение...`);
          setTimeout(connect, 1000);
        } else if (connectionCount >= maxConnections) {
          resolve({
            success: true,
            message: `Переподключение протестировано (${connectionCount} попыток)`
          });
        }
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        if (connectionCount < maxConnections) {
          console.log(`Ошибка подключения: ${error.message}, переподключение...`);
          setTimeout(connect, 1000);
        } else {
          reject(error);
        }
      });
    }
    
    connect();
  });
}

async function runTests() {
  try {
    console.log('Запуск тестов WebSocket...\n');
    
    // Тест 1: Простое подключение
    await testWebSocketConnection();
    
    // Тест 2: Переподключение
    await testWebSocketReconnection();
    
    console.log('\n=== ВСЕ ТЕСТЫ ПРОЙДЕНЫ ===');
    process.exit(0);
  } catch (error) {
    console.error('\n=== ТЕСТЫ ПРОВАЛЕНЫ ===');
    console.error('Ошибка:', error.message);
    process.exit(1);
  }
}

// Запускаем тесты
runTests();




