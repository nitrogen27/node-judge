// test-watch.js - Watch-режим для автоматического запуска тестов
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const path = require('path');

const WATCH_PATTERNS = [
  'server.js',
  'judge.js',
  'test-health.js',
  'test-*.js',
  'solution.js'
];

const DELAY_BEFORE_TEST = 2000; // Задержка перед запуском теста (2 секунды)

let testTimeout = null;
let testProcess = null;

function runHealthCheck() {
  // Отменяем предыдущий запланированный запуск
  if (testTimeout) {
    clearTimeout(testTimeout);
  }
  
  // Завершаем предыдущий процесс теста, если он еще запущен
  if (testProcess) {
    console.log('[Watch] Завершение предыдущего теста...');
    testProcess.kill();
    testProcess = null;
  }
  
  // Планируем новый запуск теста через задержку
  testTimeout = setTimeout(() => {
    console.log('\n[Watch] ========================================');
    console.log('[Watch] Запуск тестов доступности...');
    console.log('[Watch] ========================================\n');
    
    testProcess = spawn('npm', ['run', 'test:health'], {
      stdio: 'inherit',
      shell: true
    });
    
    testProcess.on('close', (code) => {
      testProcess = null;
      if (code === 0) {
        console.log('\n[Watch] ✓ Тесты пройдены успешно');
      } else {
        console.log('\n[Watch] ✗ Тесты завершились с ошибкой');
      }
      console.log('[Watch] Ожидание изменений в файлах...\n');
    });
    
    testProcess.on('error', (err) => {
      console.error('[Watch] Ошибка запуска тестов:', err);
      testProcess = null;
    });
  }, DELAY_BEFORE_TEST);
}

function setupWatcher() {
  console.log('[Watch] Инициализация watch-режима...');
  console.log('[Watch] Отслеживаемые файлы:', WATCH_PATTERNS.join(', '));
  console.log('[Watch] Задержка перед запуском теста:', DELAY_BEFORE_TEST / 1000, 'секунд\n');
  
  const watcher = chokidar.watch(WATCH_PATTERNS, {
    ignored: /node_modules|\.git/,
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('change', (filePath) => {
    const fileName = path.basename(filePath);
    console.log(`[Watch] Обнаружено изменение: ${fileName}`);
    runHealthCheck();
  });
  
  watcher.on('add', (filePath) => {
    const fileName = path.basename(filePath);
    console.log(`[Watch] Добавлен новый файл: ${fileName}`);
    runHealthCheck();
  });
  
  watcher.on('error', (error) => {
    console.error('[Watch] Ошибка watcher:', error);
  });
  
  // Запускаем тест при старте
  console.log('[Watch] Запуск начального теста...\n');
  runHealthCheck();
  
  // Обработка завершения процесса
  process.on('SIGINT', () => {
    console.log('\n[Watch] Завершение watch-режима...');
    if (testProcess) {
      testProcess.kill();
    }
    if (testTimeout) {
      clearTimeout(testTimeout);
    }
    watcher.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[Watch] Завершение watch-режима...');
    if (testProcess) {
      testProcess.kill();
    }
    if (testTimeout) {
      clearTimeout(testTimeout);
    }
    watcher.close();
    process.exit(0);
  });
  
  console.log('[Watch] Watch-режим активен. Нажмите Ctrl+C для выхода.\n');
}

setupWatcher();



