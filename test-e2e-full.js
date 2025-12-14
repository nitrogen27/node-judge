// test-e2e-full.js - E2E тесты полного цикла интерфейса
const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');

const WS_URL = 'ws://localhost:3001';
const HTTP_URL = 'http://localhost:3001';
const SERVER_START_TIMEOUT = 10000; // 10 секунд на запуск сервера
const TEST_TIMEOUT = 30000; // 30 секунд на тест

let serverProcess = null;

// Функция для ожидания запуска сервера
function waitForServer(maxAttempts = 20) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        
        const check = () => {
            attempts++;
            const req = http.get(HTTP_URL, { timeout: 1000 }, (res) => {
                res.resume();
                resolve();
            });
            
            req.on('error', () => {
                if (attempts >= maxAttempts) {
                    reject(new Error(`Сервер не запустился за ${maxAttempts} попыток`));
                } else {
                    setTimeout(check, 500);
                }
            });
            
            req.on('timeout', () => {
                req.destroy();
                if (attempts >= maxAttempts) {
                    reject(new Error(`Сервер не запустился за ${maxAttempts} попыток`));
                } else {
                    setTimeout(check, 500);
                }
            });
        };
        
        check();
    });
}

// Проверка, запущен ли сервер
function checkServerRunning() {
    return new Promise((resolve) => {
        const req = http.get(HTTP_URL, { timeout: 1000 }, (res) => {
            res.resume();
            resolve(true);
        });
        
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Запуск сервера
function startServer() {
    return new Promise(async (resolve, reject) => {
        // Проверяем, не запущен ли сервер уже
        const isRunning = await checkServerRunning();
        if (isRunning) {
            console.log('[E2E] Сервер уже запущен, используем существующий');
            resolve();
            return;
        }
        
        console.log('[E2E] Запуск сервера...');
        serverProcess = spawn('node', ['server.js'], {
            cwd: __dirname,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NODE_ENV: 'test' }
        });
        
        let serverOutput = '';
        let serverReady = false;
        
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            serverOutput += output;
            // Не выводим весь вывод сервера, только ключевые сообщения
            
            if ((output.includes('Server running') || output.includes('WebSocket server ready')) && !serverReady) {
                serverReady = true;
                console.log('[E2E] Сервер запущен');
                // Даем серверу немного времени на полный запуск
                setTimeout(() => {
                    waitForServer()
                        .then(resolve)
                        .catch(reject);
                }, 2000);
            }
        });
        
        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Игнорируем ошибку EADDRINUSE, если сервер уже запущен
            if (!output.includes('EADDRINUSE')) {
                process.stderr.write(`[Server] ${output}`);
            }
        });
        
        serverProcess.on('error', (err) => {
            reject(err);
        });
        
        // Таймаут на запуск
        setTimeout(() => {
            if (!serverReady) {
                // Проверяем еще раз, может сервер уже запущен
                checkServerRunning().then(isRunning => {
                    if (isRunning) {
                        console.log('[E2E] Сервер доступен');
                        resolve();
                    } else {
                        reject(new Error('Таймаут запуска сервера'));
                    }
                });
            }
        }, SERVER_START_TIMEOUT);
    });
}

// Остановка сервера
function stopServer() {
    return new Promise((resolve) => {
        if (serverProcess) {
            console.log('[E2E] Остановка запущенного сервера...');
            serverProcess.kill();
            serverProcess.on('exit', () => {
                console.log('[E2E] Сервер остановлен');
                resolve();
            });
            setTimeout(resolve, 1000); // Fallback
        } else {
            // Сервер не был запущен нами, не останавливаем
            resolve();
        }
    });
}

// E2E тесты
const e2eTests = [
    {
        name: 'Простой тест: сложение двух чисел',
        code: `const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
const inputLines = [];
let curLine = 0;
reader.on('line', (line) => {
    inputLines.push(line);
});
reader.on('close', () => {
    const a = Number(inputLines[curLine++]);
    const b = Number(inputLines[curLine++]);
    console.log(a + b);
});`,
        input: '5\n10\n',
        expected: '15',
        description: 'Проверка базовой функциональности: 5 + 10 = 15'
    },
    {
        name: 'Тест с ANSI кодами в выводе',
        code: `const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
const inputLines = [];
let curLine = 0;
reader.on('line', (line) => {
    inputLines.push(line);
});
reader.on('close', () => {
    const a = Number(inputLines[curLine++]);
    const b = Number(inputLines[curLine++]);
    // Используем ANSI коды для цвета
    process.stdout.write('\\x1b[33m' + (a + b) + '\\x1b[39m');
});`,
        input: '5\n10\n',
        expected: '15',
        description: 'Проверка очистки ANSI escape-кодов из вывода'
    },
    {
        name: 'Тест с отрицательными числами',
        code: `const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
const inputLines = [];
let curLine = 0;
reader.on('line', (line) => {
    inputLines.push(line);
});
reader.on('close', () => {
    const a = Number(inputLines[curLine++]);
    const b = Number(inputLines[curLine++]);
    console.log(a + b);
});`,
        input: '-5\n10\n',
        expected: '5',
        description: 'Проверка работы с отрицательными числами'
    },
    {
        name: 'Тест с большими числами',
        code: `const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
const inputLines = [];
let curLine = 0;
reader.on('line', (line) => {
    inputLines.push(line);
});
reader.on('close', () => {
    const a = Number(inputLines[curLine++]);
    const b = Number(inputLines[curLine++]);
    console.log(a + b);
});`,
        input: '1000000000\n2000000000\n',
        expected: '3000000000',
        description: 'Проверка работы с большими числами'
    },
    {
        name: 'Тест строкового вывода',
        code: `const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
const inputLines = [];
reader.on('line', (line) => {
    inputLines.push(line);
});
reader.on('close', () => {
    console.log('Result: ' + inputLines[0]);
});`,
        input: 'hello\n',
        expected: 'Result: hello',
        description: 'Проверка строкового вывода'
    },
    {
        name: 'Тест с многострочным вводом',
        code: `const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
const inputLines = [];
reader.on('line', (line) => {
    inputLines.push(line);
});
reader.on('close', () => {
    const sum = inputLines.reduce((acc, line) => acc + parseInt(line), 0);
    console.log(sum);
});`,
        input: '1\n2\n3\n4\n5\n',
        expected: '15',
        description: 'Проверка многострочного ввода'
    }
];

// Функция выполнения одного E2E теста
function runE2ETest(test) {
    return new Promise((resolve, reject) => {
        console.log(`\n[E2E] Запуск теста: ${test.name}`);
        console.log(`[E2E] Описание: ${test.description}`);
        
        const ws = new WebSocket(WS_URL);
        let resolved = false;
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                ws.close();
                reject(new Error(`Таймаут теста: ${test.name}`));
            }
        }, TEST_TIMEOUT);
        
        ws.on('open', () => {
            console.log('[E2E] WebSocket подключен');
            
            // Отправляем решение
            const message = {
                type: 'submit',
                code: test.code,
                input: test.input,
                expected: test.expected
            };
            
            console.log('[E2E] Отправка решения...');
            ws.send(JSON.stringify(message));
        });
        
        ws.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                
                if (response.type === 'status') {
                    console.log(`[E2E] Статус: ${response.message || response.status}`);
                } else if (response.type === 'results') {
                    clearTimeout(timeout);
                    console.log('[E2E] Получены результаты');
                    
                    // Проверяем результаты
                    if (!response.results || response.results.length === 0) {
                        resolved = true;
                        reject(new Error('Нет результатов теста'));
                        return;
                    }
                    
                    const result = response.results[0];
                    const summary = response.summary;
                    
                    console.log(`[E2E] Результат теста: ${result.ok ? '✓ PASS' : '✗ FAIL'}`);
                    console.log(`[E2E] Получено: "${result.output}"`);
                    console.log(`[E2E] Ожидалось: "${result.expected}"`);
                    
                    // Проверяем, что результат правильный
                    if (result.ok && result.output === test.expected) {
                        console.log(`[E2E] ✓ Тест "${test.name}" пройден успешно`);
                        console.log(`[E2E] Время выполнения: ${result.timeMs}ms`);
                        console.log(`[E2E] Память: ${result.memMb}MB`);
                        
                        if (summary) {
                            console.log(`[E2E] Статус: ${summary.status}`);
                            console.log(`[E2E] Node версия: ${summary.nodeVersion}`);
                        }
                        
                        resolved = true;
                        ws.close();
                        resolve({
                            name: test.name,
                            ok: true,
                            result: result,
                            summary: summary
                        });
                    } else {
                        console.error(`[E2E] ✗ Тест "${test.name}" провален`);
                        console.error(`[E2E] Получено: "${result.output}"`);
                        console.error(`[E2E] Ожидалось: "${result.expected}"`);
                        if (result.stderr) {
                            console.error(`[E2E] Stderr: ${result.stderr}`);
                        }
                        
                        resolved = true;
                        ws.close();
                        reject(new Error(`Тест "${test.name}" провален: получено "${result.output}", ожидалось "${result.expected}"`));
                    }
                } else if (response.type === 'error') {
                    clearTimeout(timeout);
                    console.error(`[E2E] Ошибка от сервера: ${response.message}`);
                    resolved = true;
                    ws.close();
                    reject(new Error(`Ошибка сервера: ${response.message}`));
                }
            } catch (err) {
                console.error('[E2E] Ошибка парсинга ответа:', err);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    ws.close();
                    reject(err);
                }
            }
        });
        
        ws.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                console.error('[E2E] WebSocket ошибка:', error.message);
                reject(error);
            }
        });
        
        ws.on('close', (code, reason) => {
            if (!resolved && code !== 1000) {
                resolved = true;
                clearTimeout(timeout);
                console.error(`[E2E] WebSocket закрыт неожиданно: код ${code}, причина: ${reason}`);
                reject(new Error(`WebSocket закрыт: код ${code}`));
            }
        });
    });
}

// Основная функция запуска E2E тестов
async function runAllE2ETests() {
    console.log('=== E2E Тесты полного цикла интерфейса ===\n');
    console.log(`Всего тестов: ${e2eTests.length}\n`);
    
    let passed = 0;
    let failed = 0;
    const results = [];
    
    try {
        // Запускаем сервер
        await startServer();
        console.log('[E2E] Сервер готов к тестированию\n');
        
        // Запускаем все тесты
        for (const test of e2eTests) {
            try {
                const result = await runE2ETest(test);
                results.push(result);
                passed++;
                
                // Небольшая задержка между тестами
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                failed++;
                results.push({
                    name: test.name,
                    ok: false,
                    error: error.message
                });
                console.error(`[E2E] ✗ Тест "${test.name}" провален: ${error.message}\n`);
                
                // Продолжаем выполнение других тестов
            }
        }
        
        // Останавливаем сервер
        await stopServer();
        
        // Выводим итоги
        console.log('\n=== Результаты E2E тестов ===');
        console.log(`Пройдено: ${passed} / ${e2eTests.length}`);
        console.log(`Провалено: ${failed} / ${e2eTests.length}`);
        console.log(`Успешность: ${((passed / e2eTests.length) * 100).toFixed(1)}%`);
        
        if (failed === 0) {
            console.log('\n✓ Все E2E тесты пройдены успешно!');
            return 0;
        } else {
            console.log('\n✗ Некоторые E2E тесты провалены');
            return 1;
        }
        
    } catch (error) {
        console.error('\n[E2E] Критическая ошибка:', error.message);
        await stopServer();
        return 1;
    }
}

// Запуск тестов
if (require.main === module) {
    runAllE2ETests()
        .then((exitCode) => {
            process.exit(exitCode);
        })
        .catch((err) => {
            console.error('Критическая ошибка:', err);
            process.exit(1);
        });
}

module.exports = { runAllE2ETests, runE2ETest, startServer, stopServer };

