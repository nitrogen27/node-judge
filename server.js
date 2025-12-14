// server.js - WebSocket server для проверки решений
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

// Функция для удаления ANSI escape-кодов из строки
function stripAnsiCodes(str) {
    if (!str) return str;
    
    let result = String(str);
    
    // Шаг 1: Удаляем стандартные escape-последовательности с ESC символом
    result = result
        .replace(/\x1b\[[0-9;]*m/g, '')      // \x1b[ - hex escape
        .replace(/\u001b\[[0-9;]*m/g, '')    // \u001b[ - unicode escape
        .replace(/\033\[[0-9;]*m/g, '')      // \033[ - octal escape
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Другие ANSI команды
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
        .replace(/\033\[[0-9;]*[A-Za-z]/g, '');
    
    // Шаг 2: Удаляем ANSI коды без escape-символа (когда он потерян при передаче)
    // Паттерн: [числа]m - например [33m, [39m, [0m и т.д.
    result = result.replace(/\[[0-9;]+m/g, '');
    
    // Шаг 3: Удаляем другие ANSI последовательности без escape-символа
    // Паттерн: [числа]буква - например [2J, [H, [K и т.д.
    result = result.replace(/\[[0-9;]*[A-Za-z]/g, function(match) {
        // ANSI коды обычно короткие (1-10 цифр/символов) и заканчиваются буквой
        if (/^\[[0-9;]{0,10}[A-Za-z]$/.test(match)) {
            return '';
        }
        return match;
    });
    
    // Шаг 4: Удаляем одиночные escape-символы, которые могли остаться
    result = result.replace(/\x1b/g, '').replace(/\u001b/g, '').replace(/\033/g, '');
    
    // Шаг 5: Удаляем любые оставшиеся управляющие символы, кроме переносов строк и табуляции
    // Удаляем невидимые символы, которые могут быть частью ANSI, но сохраняем \n, \r, \t
    result = result.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');
    
    return result;
}

// Тесты теперь приходят из клиента

const tempSolutionPath = path.join(__dirname, 'temp_solution.js');

// Функция для получения памяти процесса по PID (macOS/Linux)
async function getProcessMemoryMb(pid) {
    try {
        const platform = process.platform;
        let command;
        
        if (platform === 'darwin') {
            // macOS: ps -o rss= -p PID (RSS в килобайтах)
            command = `ps -o rss= -p ${pid}`;
        } else if (platform === 'linux') {
            // Linux: ps -o rss= -p PID
            command = `ps -o rss= -p ${pid}`;
        } else {
            // Windows или другая ОС - используем fallback
            return null;
        }

        const { stdout } = await execAsync(command);
        const rssKb = parseInt(stdout.trim(), 10);
        if (isNaN(rssKb)) return null;
        return rssKb / 1024; // Конвертируем KB в MB
    } catch (err) {
        return null;
    }
}

async function runSingleTest(test, solutionCode) {
    return new Promise(async (resolve, reject) => {
        try {
            // Сохраняем решение во временный файл
            await fs.writeFile(tempSolutionPath, solutionCode, 'utf8');

            const child = spawn(process.execPath, [tempSolutionPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const startTime = performance.now();
            let stdout = '';
            let stderr = '';
            let maxMemoryMb = 0;
            const memorySamples = [];

            // Мониторинг памяти дочернего процесса через системные команды
            const memoryCheckInterval = { interval: null };
            
            // Функция проверки памяти
            const checkMemory = async () => {
                if (child.pid && !child.killed) {
                    try {
                        const mem = await getProcessMemoryMb(child.pid);
                        if (mem !== null && mem > 0) {
                            memorySamples.push(mem);
                            if (mem > maxMemoryMb) {
                                maxMemoryMb = mem;
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
            };
            
            // Первая проверка памяти сразу после запуска
            setTimeout(() => {
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            }, 5);
            
            // Начинаем регулярный мониторинг после небольшой задержки
            setTimeout(() => {
                if (child.pid && !child.killed) {
                    // Проверяем память несколько раз с интервалом
                    memoryCheckInterval.interval = setInterval(() => {
                        if (child.killed) {
                            if (memoryCheckInterval.interval) {
                                clearInterval(memoryCheckInterval.interval);
                            }
                            return;
                        }
                        // Вызываем без await, чтобы не блокировать
                        checkMemory().catch(() => {});
                    }, 20); // Проверяем каждые 20мс (чаще)
                }
            }, 10); // Запускаем через 10мс

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                // Проверяем память при получении данных
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
                // Проверяем память при получении данных
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            });

            child.on('error', (err) => {
                if (memoryCheckInterval && memoryCheckInterval.interval) {
                    clearInterval(memoryCheckInterval.interval);
                }
                if (memoryCheckInterval) {
                    clearTimeout(memoryCheckInterval);
                }
                reject(err);
            });

            child.on('close', async (code) => {
                // Останавливаем мониторинг
                if (memoryCheckInterval.interval) {
                    clearInterval(memoryCheckInterval.interval);
                    memoryCheckInterval.interval = null;
                }
                
                // Даем время для завершения всех асинхронных проверок памяти
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const endTime = performance.now();
                const timeMs = endTime - startTime;
                
                // Если память не была измерена, пробуем еще раз через системную команду
                // (но процесс уже завершен, поэтому это не поможет)
                // Используем максимальное значение из уже собранных образцов

                // Если память не была измерена, используем приблизительное значение
                if (memorySamples.length > 0) {
                    // Используем максимальное значение из собранных образцов
                    const maxFromSamples = Math.max(...memorySamples);
                    if (maxFromSamples > maxMemoryMb) {
                        maxMemoryMb = maxFromSamples;
                    }
                }
                
                if (maxMemoryMb === 0 && memorySamples.length === 0) {
                    // Пробуем использовать child.memoryUsage если доступен
                    try {
                        if (typeof child.memoryUsage === 'function') {
                            const mem = child.memoryUsage().rss / 1024 / 1024;
                            if (mem > 0) {
                                maxMemoryMb = mem;
                            }
                        }
                    } catch (e) {
                        // Игнорируем
                    }
                    
                    // Если все еще 0, используем дефолт (но это означает, что что-то не так)
                    if (maxMemoryMb === 0) {
                        console.warn(`[WARNING] Память не была измерена для теста. Используется дефолт 5.0 MB`);
                        maxMemoryMb = 5.0;
                    }
                }

                // Удаляем ANSI escape-коды из вывода перед сравнением
                const cleanedOutput = stripAnsiCodes(stdout);
                const normalizedOutput = cleanedOutput.trim();
                const normalizedExpected = String(test.expected).trim();

                // Логирование процесса выполнения
                console.log(`[Test: ${test.name}] Выполнение теста:`);
                console.log(`  Входные данные: ${JSON.stringify(test.input)}`);
                console.log(`  Сырой stdout (hex): ${Buffer.from(stdout, 'utf8').toString('hex')}`);
                console.log(`  Сырой stdout (string): ${JSON.stringify(stdout)}`);
                console.log(`  После очистки ANSI: ${JSON.stringify(normalizedOutput)}`);
                console.log(`  Ожидаемый вывод: ${JSON.stringify(normalizedExpected)}`);
                console.log(`  Exit code: ${code}`);

                // Логирование для отладки (если вывод не совпадает)
                if (normalizedOutput !== normalizedExpected && code === 0) {
                    console.log('[DEBUG] Несоответствие вывода:');
                    console.log(`  Получено: "${normalizedOutput}"`);
                    console.log(`  Ожидалось: "${normalizedExpected}"`);
                    console.log(`  Длина полученного: ${normalizedOutput.length}, длина ожидаемого: ${normalizedExpected.length}`);
                }

                const ok = code === 0 && normalizedOutput === normalizedExpected;
                console.log(`  Результат: ${ok ? '✓ PASS' : '✗ FAIL'}`);

                resolve({
                    name: test.name,
                    ok,
                    code,
                    timeMs: Math.round(timeMs * 100) / 100,
                    memMb: Math.round(maxMemoryMb * 100) / 100,
                    output: normalizedOutput, // Уже очищено от ANSI кодов
                    expected: normalizedExpected,
                    stderr: stderr ? stripAnsiCodes(stderr) : null, // Очищаем stderr тоже
                });
            });

            child.stdin.write(test.input);
            child.stdin.end();
        } catch (err) {
            reject(err);
        }
    });
}

async function runTests(solutionCode, testsToRun = null) {
    // Используем переданные тесты или дефолтные (для обратной совместимости)
    const tests = testsToRun || [
        {
            name: 'default test',
            input: '1\n2\n',
            expected: '3',
        }
    ];
    const results = [];
    let passed = 0;
    let totalTime = 0;
    let maxTime = 0;
    let maxMemoryMb = 0;

    try {
        for (const test of tests) {
            try {
                const res = await runSingleTest(test, solutionCode);
                results.push(res);
                
                totalTime += res.timeMs;
                if (res.timeMs > maxTime) {
                    maxTime = res.timeMs;
                }
                // ИСПРАВЛЕНИЕ: Проверяем, что memMb существует и больше текущего максимума
                // Используем явную проверку на undefined/null, а не на truthiness
                if (res.memMb !== undefined && res.memMb !== null && res.memMb > maxMemoryMb) {
                    maxMemoryMb = res.memMb;
                }

                if (res.ok) {
                    passed++;
                }
            } catch (err) {
                results.push({
                    name: test.name,
                    ok: false,
                    error: err.message,
                });
            }
        }

        // Удаляем временный файл
        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем ошибки удаления
        }

        const nodeVersion = process.version;
        const status = passed === tests.length ? 'OK' : 'FAILED';

        // Если память не была измерена, используем значение по умолчанию
        const finalMemoryMb = maxMemoryMb > 0 ? maxMemoryMb : 5.0;

        return {
            results,
            summary: {
                passed,
                total: tests.length,
                totalTime: Math.round(totalTime * 100) / 100,
                maxTime: maxTime || 0,
                maxMemoryMb: finalMemoryMb,
                nodeVersion,
                status,
            },
        };
    } catch (err) {
        // Удаляем временный файл в случае ошибки
        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем ошибки удаления
        }
        throw err;
    }
}

// Express сервер для статики
const app = express();
app.use(express.static(path.join(__dirname, 'client/build')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    // Дополнительные опции для совместимости
    perMessageDeflate: false,
    clientTracking: true
});

wss.on('connection', (ws, req) => {
    console.log('Client connected');
    console.log('Connection from:', req.socket.remoteAddress || 'unknown');
    console.log('WebSocket readyState:', ws.readyState);
    console.log('Request URL:', req.url);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'submit') {
                const { code, input, expected } = data;
                
                // Валидация входных данных
                if (!code || !code.trim()) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Код решения не может быть пустым',
                    }));
                    return;
                }
                
                if (!input || !input.trim()) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Входные данные не могут быть пустыми',
                    }));
                    return;
                }
                
                if (!expected || !expected.trim()) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Ожидаемый вывод не может быть пустым',
                    }));
                    return;
                }
                
                // Формируем тест из переданных данных
                // Обрабатываем входные данные: если строка не заканчивается на \n, добавляем его
                let processedInput = input;
                if (!processedInput.endsWith('\n')) {
                    processedInput += '\n';
                }
                
                const test = {
                    name: 'user test',
                    input: processedInput,
                    expected: expected.trim(),
                };
                
                console.log('[WebSocket] Сформирован тест:', {
                    inputLength: test.input.length,
                    inputPreview: test.input.substring(0, 50) + '...',
                    expected: test.expected,
                });
                
                // Отправляем начальное состояние
                ws.send(JSON.stringify({
                    type: 'status',
                    status: 'running',
                    message: 'Запуск тестов...',
                }));

                try {
                    const testResults = await runTests(code, [test]); // Передаем тест из запроса
                    
                    console.log('[WebSocket] ===== ОТПРАВКА РЕЗУЛЬТАТОВ =====');
                    console.log('[WebSocket] testResults тип:', typeof testResults);
                    console.log('[WebSocket] testResults ключи:', Object.keys(testResults));
                    console.log('[WebSocket] testResults.summary существует:', !!testResults.summary);
                    
                    if (!testResults.summary) {
                        console.error('[WebSocket] КРИТИЧЕСКАЯ ОШИБКА: testResults.summary отсутствует!');
                        console.error('[WebSocket] testResults:', JSON.stringify(testResults, null, 2));
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Ошибка: результаты тестов некорректны - summary отсутствует',
                        }));
                        return;
                    }
                    
                    console.log('[WebSocket] testResults.summary:', JSON.stringify(testResults.summary, null, 2));
                    console.log('[WebSocket] testResults.summary ключи:', Object.keys(testResults.summary));
                    
                    // Логирование для отладки
                    console.log('[WebSocket] Отправка результатов:', {
                        maxMemoryMb: testResults.summary.maxMemoryMb,
                        maxTime: testResults.summary.maxTime,
                        status: testResults.summary.status,
                        nodeVersion: testResults.summary.nodeVersion,
                        passed: testResults.summary.passed,
                        total: testResults.summary.total
                    });
                    
                    // Проверка данных перед отправкой
                    if (!testResults.summary.nodeVersion) {
                        console.error('[WebSocket] ОШИБКА: nodeVersion отсутствует!');
                    }
                    if (testResults.summary.maxMemoryMb === 0 || testResults.summary.maxMemoryMb === undefined) {
                        console.error('[WebSocket] ОШИБКА: maxMemoryMb равен 0 или undefined!');
                    }
                    if (!testResults.summary.status) {
                        console.error('[WebSocket] ОШИБКА: status отсутствует!');
                    }
                    
                    // Формируем сообщение с явной проверкой всех полей
                    // ВАЖНО: Используем значения напрямую из testResults.summary, а не через fallback
                    // Fallback только если значение действительно отсутствует
                    
                    // Дополнительная очистка ANSI кодов из результатов перед отправкой
                    const cleanedResults = (testResults.results || []).map(result => ({
                        ...result,
                        output: result.output ? stripAnsiCodes(String(result.output)) : result.output,
                        expected: result.expected ? stripAnsiCodes(String(result.expected)) : result.expected,
                        stderr: result.stderr ? stripAnsiCodes(String(result.stderr)) : result.stderr
                    }));
                    
                    const messageData = {
                        type: 'results',
                        results: cleanedResults,
                        summary: {
                            passed: testResults.summary.passed !== undefined ? testResults.summary.passed : 0,
                            total: testResults.summary.total !== undefined ? testResults.summary.total : 0,
                            totalTime: testResults.summary.totalTime !== undefined ? testResults.summary.totalTime : 0,
                            maxTime: testResults.summary.maxTime !== undefined ? testResults.summary.maxTime : 0,
                            // КРИТИЧНО: Используем значение напрямую, проверяем только на undefined/null
                            maxMemoryMb: (testResults.summary.maxMemoryMb !== undefined && testResults.summary.maxMemoryMb !== null) 
                                ? testResults.summary.maxMemoryMb 
                                : (testResults.summary.maxMemoryMb === 0 ? 0 : 5.0),
                            // КРИТИЧНО: nodeVersion - проверяем явно на undefined/null, не используем || чтобы не заменить существующее значение
                            nodeVersion: (testResults.summary.nodeVersion !== undefined && testResults.summary.nodeVersion !== null && testResults.summary.nodeVersion !== '') 
                                ? testResults.summary.nodeVersion 
                                : (process.version || 'N/A'),
                            // КРИТИЧНО: status - проверяем явно на undefined/null, не используем || чтобы не заменить существующее значение
                            status: (testResults.summary.status !== undefined && testResults.summary.status !== null && testResults.summary.status !== '') 
                                ? testResults.summary.status 
                                : 'FAILED',
                        },
                    };
                    
                    // КРИТИЧЕСКАЯ ПРОВЕРКА: Убеждаемся, что все поля присутствуют
                    if (messageData.summary.nodeVersion === 'N/A' && testResults.summary.nodeVersion) {
                        console.error('[WebSocket] КРИТИЧЕСКАЯ ОШИБКА: nodeVersion потерялся!');
                        messageData.summary.nodeVersion = testResults.summary.nodeVersion;
                    }
                    if (messageData.summary.status === 'UNKNOWN' && testResults.summary.status) {
                        console.error('[WebSocket] КРИТИЧЕСКАЯ ОШИБКА: status потерялся!');
                        messageData.summary.status = testResults.summary.status;
                    }
                    if (messageData.summary.maxMemoryMb === 0 && testResults.summary.maxMemoryMb > 0) {
                        console.error('[WebSocket] КРИТИЧЕСКАЯ ОШИБКА: maxMemoryMb потерялся!');
                        messageData.summary.maxMemoryMb = testResults.summary.maxMemoryMb;
                    }
                    
                    console.log('[WebSocket] Сформированное сообщение:', JSON.stringify(messageData, null, 2));
                    
                    const message = JSON.stringify(messageData);
                    
                    console.log('[WebSocket] JSON сообщение (первые 500 символов):', message.substring(0, 500));
                    console.log('[WebSocket] Длина JSON:', message.length);
                    
                    // Проверка парсинга
                    const parsed = JSON.parse(message);
                    console.log('[WebSocket] Проверка парсинга:', {
                        hasSummary: !!parsed.summary,
                        nodeVersion: parsed.summary?.nodeVersion,
                        maxMemoryMb: parsed.summary?.maxMemoryMb,
                        maxTime: parsed.summary?.maxTime,
                        status: parsed.summary?.status,
                    });
                    
                    if (!parsed.summary || !parsed.summary.nodeVersion || !parsed.summary.status) {
                        console.error('[WebSocket] КРИТИЧЕСКАЯ ОШИБКА: После парсинга данные неполные!');
                        console.error('[WebSocket] parsed:', JSON.stringify(parsed, null, 2));
                    }
                    
                    ws.send(message);
                } catch (err) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: err.message || 'Ошибка при выполнении тестов',
                    }));
                }
            }
        } catch (err) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Ошибка обработки запроса: ' + err.message,
            }));
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        console.error('Error details:', {
            message: err.message,
            code: err.code,
            stack: err.stack
        });
    });
    
    ws.on('close', (code, reason) => {
        console.log(`Client disconnected. Code: ${code}, Reason: ${reason ? reason.toString() : 'none'}`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
    
    // Запускаем тесты ввода-вывода асинхронно после старта сервера (если не в production)
    if (process.env.NODE_ENV !== 'production') {
        // Небольшая задержка, чтобы сервер успел полностью запуститься
        setTimeout(() => {
            const { runAllTests } = require('./test-io');
            runAllTests()
                .then((exitCode) => {
                    if (exitCode !== 0) {
                        console.warn('[Server] Некоторые тесты ввода-вывода провалены, но сервер продолжает работу');
                    } else {
                        console.log('[Server] ✓ Все тесты ввода-вывода пройдены');
                    }
                })
                .catch((err) => {
                    console.error('[Server] Ошибка при запуске тестов ввода-вывода:', err.message);
                    console.warn('[Server] Сервер продолжает работу');
                });
        }, 1000);
    }
});

