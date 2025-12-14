// test-health.js - Тесты доступности сервера
const WebSocket = require('ws');
const http = require('http');

const WS_URL = 'ws://localhost:3001';
const HTTP_URL = 'http://localhost:3001';
const CONNECTION_TIMEOUT = 5000;
const RETRY_DELAY = 1000;
const MAX_RETRIES = 5;

// Проверка доступности HTTP сервера
function checkHttpServer() {
  return new Promise((resolve, reject) => {
    const req = http.get(HTTP_URL, { timeout: CONNECTION_TIMEOUT }, (res) => {
      resolve({
        success: true,
        statusCode: res.statusCode,
        message: 'HTTP сервер доступен'
      });
      res.resume(); // Освобождаем память
    });

    req.on('error', (err) => {
      reject({
        success: false,
        error: err.message,
        message: 'HTTP сервер недоступен'
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({
        success: false,
        error: 'Timeout',
        message: 'HTTP сервер не отвечает'
      });
    });
  });
}

// Проверка доступности WebSocket сервера
function checkWebSocketServer() {
  return new Promise((resolve, reject) => {
    console.log(`[Health Check] Подключение к ${WS_URL}...`);
    
    const ws = new WebSocket(WS_URL);
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject({
          success: false,
          error: 'Timeout',
          message: 'WebSocket сервер не отвечает в течение 5 секунд'
        });
      }
    }, CONNECTION_TIMEOUT);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        console.log('[Health Check] ✓ WebSocket подключен успешно');
        ws.close(1000, 'Health check complete');
        resolve({
          success: true,
          readyState: ws.readyState,
          message: 'WebSocket сервер доступен'
        });
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        console.error('[Health Check] ✗ Ошибка WebSocket:', error.message);
        reject({
          success: false,
          error: error.message,
          message: 'WebSocket сервер недоступен'
        });
      }
    });
    
    ws.on('close', (code, reason) => {
      if (!resolved && code !== 1000) {
        resolved = true;
        clearTimeout(timeout);
        reject({
          success: false,
          error: `Connection closed with code ${code}`,
          message: `WebSocket соединение закрыто с кодом ${code}`
        });
      }
    });
  });
}

// Проверка функциональности WebSocket (отправка тестового сообщения)
function checkWebSocketFunctionality() {
  return new Promise((resolve, reject) => {
    console.log('[Health Check] Проверка функциональности WebSocket...');
    
    const ws = new WebSocket(WS_URL);
    let resolved = false;
    let messageReceived = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        if (!messageReceived) {
          reject({
            success: false,
            error: 'Timeout',
            message: 'Сервер не ответил на тестовое сообщение'
          });
        }
      }
    }, CONNECTION_TIMEOUT);
    
    ws.on('open', () => {
      console.log('[Health Check] Отправка тестового сообщения...');
      const testMessage = {
        type: 'submit',
        code: 'const readline = require("readline");\nconst rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: false});\nrl.on("line", (line) => {console.log(line); rl.close();});',
        input: '42\n',
        expected: '42'
      };
      ws.send(JSON.stringify(testMessage));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[Health Check] ✓ Получен ответ: ${message.type}`);
        messageReceived = true;
        
        if (message.type === 'error') {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            reject({
              success: false,
              error: message.message,
              message: 'Сервер вернул ошибку'
            });
          }
        } else if (message.type === 'results' || message.type === 'status') {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({
              success: true,
              message: 'WebSocket функционален - сервер обрабатывает сообщения'
            });
          }
        }
      } catch (err) {
        console.error('[Health Check] Ошибка парсинга сообщения:', err);
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject({
          success: false,
          error: error.message,
          message: 'Ошибка при проверке функциональности'
        });
      }
    });
    
    ws.on('close', (code) => {
      if (!resolved && code !== 1000) {
        clearTimeout(timeout);
        resolved = true;
        reject({
          success: false,
          error: `Connection closed with code ${code}`,
          message: 'Соединение закрыто во время проверки'
        });
      }
    });
  });
}

// Основная функция проверки здоровья
async function runHealthCheck() {
  console.log('=== Health Check - Проверка доступности сервера ===\n');
  
  const results = {
    http: null,
    websocket: null,
    functionality: null,
    overall: false
  };
  
  // Проверка HTTP сервера
  try {
    results.http = await checkHttpServer();
    console.log(`[Health Check] ✓ HTTP: ${results.http.message} (${results.http.statusCode})`);
  } catch (error) {
    results.http = error;
    console.error(`[Health Check] ✗ HTTP: ${error.message}`);
  }
  
  // Небольшая задержка между проверками
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Проверка WebSocket сервера
  try {
    results.websocket = await checkWebSocketServer();
    console.log(`[Health Check] ✓ WebSocket: ${results.websocket.message}`);
  } catch (error) {
    results.websocket = error;
    console.error(`[Health Check] ✗ WebSocket: ${error.message}`);
  }
  
  // Небольшая задержка между проверками
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Проверка функциональности WebSocket
  try {
    results.functionality = await checkWebSocketFunctionality();
    console.log(`[Health Check] ✓ Функциональность: ${results.functionality.message}`);
  } catch (error) {
    results.functionality = error;
    console.error(`[Health Check] ✗ Функциональность: ${error.message}`);
  }
  
  // Определяем общий статус
  results.overall = 
    results.http?.success && 
    results.websocket?.success && 
    results.functionality?.success;
  
  console.log('\n=== Результаты Health Check ===');
  console.log(`HTTP сервер: ${results.http?.success ? '✓' : '✗'}`);
  console.log(`WebSocket сервер: ${results.websocket?.success ? '✓' : '✗'}`);
  console.log(`Функциональность: ${results.functionality?.success ? '✓' : '✗'}`);
  console.log(`Общий статус: ${results.overall ? '✓ ЗДОРОВ' : '✗ НЕЗДОРОВ'}`);
  
  return results;
}

// Функция с повторными попытками
async function runHealthCheckWithRetries() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`\n[Попытка ${attempt}/${MAX_RETRIES}]`);
    const results = await runHealthCheck();
    
    if (results.overall) {
      console.log('\n✓ Все проверки пройдены успешно!');
      return results;
    }
    
    if (attempt < MAX_RETRIES) {
      console.log(`\nПовторная попытка через ${RETRY_DELAY / 1000} секунд...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  console.error('\n✗ Проверки не пройдены после всех попыток');
  process.exit(1);
}

// Если запущен напрямую
if (require.main === module) {
  runHealthCheckWithRetries().catch((error) => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });
}

module.exports = { runHealthCheck, runHealthCheckWithRetries };



