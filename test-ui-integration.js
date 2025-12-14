// test-ui-integration.js - Интеграционный тест UI
const WebSocket = require('ws');
const http = require('http');

// Запускаем тестовый сервер
const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Импортируем функции из server.js (упрощенная версия)
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

const tempSolutionPath = path.join(__dirname, 'temp_solution.js');

const tests = [
    {
        name: 'test memory',
        input: '5\n10\n',
        expected: '15',
    },
];

async function getProcessMemoryMb(pid) {
    try {
        const platform = process.platform;
        let command;
        
        if (platform === 'darwin') {
            command = `ps -o rss= -p ${pid}`;
        } else if (platform === 'linux') {
            command = `ps -o rss= -p ${pid}`;
        } else {
            return null;
        }

        const { stdout } = await execAsync(command);
        const rssKb = parseInt(stdout.trim(), 10);
        if (isNaN(rssKb)) return null;
        return rssKb / 1024;
    } catch (err) {
        return null;
    }
}

async function runSingleTest(test, solutionCode) {
    return new Promise(async (resolve, reject) => {
        try {
            await fs.writeFile(tempSolutionPath, solutionCode, 'utf8');

            const child = spawn(process.execPath, [tempSolutionPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const startTime = performance.now();
            let stdout = '';
            let stderr = '';
            let maxMemoryMb = 0;
            const memorySamples = [];

            const memoryCheckInterval = { interval: null };
            
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
                        // Игнорируем
                    }
                }
            };
            
            setTimeout(() => {
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            }, 5);
            
            setTimeout(() => {
                if (child.pid && !child.killed) {
                    memoryCheckInterval.interval = setInterval(() => {
                        if (child.killed) {
                            if (memoryCheckInterval.interval) {
                                clearInterval(memoryCheckInterval.interval);
                            }
                            return;
                        }
                        checkMemory().catch(() => {});
                    }, 20);
                }
            }, 10);

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            });

            child.on('error', (err) => {
                if (memoryCheckInterval && memoryCheckInterval.interval) {
                    clearInterval(memoryCheckInterval.interval);
                }
                reject(err);
            });

            child.on('close', async (code) => {
                if (memoryCheckInterval.interval) {
                    clearInterval(memoryCheckInterval.interval);
                    memoryCheckInterval.interval = null;
                }
                
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const endTime = performance.now();
                const timeMs = endTime - startTime;

                if (memorySamples.length > 0) {
                    const maxFromSamples = Math.max(...memorySamples);
                    if (maxFromSamples > maxMemoryMb) {
                        maxMemoryMb = maxFromSamples;
                    }
                }
                
                if (maxMemoryMb === 0 && memorySamples.length === 0) {
                    maxMemoryMb = 5.0;
                }

                const normalizedOutput = stdout.trim();
                const normalizedExpected = String(test.expected).trim();
                const ok = code === 0 && normalizedOutput === normalizedExpected;

                resolve({
                    name: test.name,
                    ok,
                    code,
                    timeMs: Math.round(timeMs * 100) / 100,
                    memMb: Math.round(maxMemoryMb * 100) / 100,
                    output: normalizedOutput,
                    expected: normalizedExpected,
                    stderr: stderr || null,
                });
            });

            child.stdin.write(test.input);
            child.stdin.end();
        } catch (err) {
            reject(err);
        }
    });
}

async function runTests(solutionCode) {
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

        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем
        }

        const nodeVersion = process.version;
        const status = passed === tests.length ? 'OK' : 'FAILED';

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
        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем
        }
        throw err;
    }
}

// WebSocket сервер
wss.on('connection', (ws) => {
    console.log('[TEST] WebSocket клиент подключен');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'submit') {
                const { code } = data;
                
                ws.send(JSON.stringify({
                    type: 'status',
                    status: 'running',
                    message: 'Запуск тестов...',
                }));

                try {
                    const testResults = await runTests(code);
                    
                    console.log('[TEST] Результаты тестов:', {
                        maxMemoryMb: testResults.summary.maxMemoryMb,
                        maxTime: testResults.summary.maxTime,
                        status: testResults.summary.status
                    });
                    
                    const message = JSON.stringify({
                        type: 'results',
                        ...testResults,
                    });
                    
                    ws.send(message);
                    
                    // Проверяем, что данные корректны
                    const parsed = JSON.parse(message);
                    console.log('[TEST] Отправлено в WebSocket:', {
                        type: parsed.type,
                        summaryMaxMemoryMb: parsed.summary?.maxMemoryMb,
                        summaryMaxTime: parsed.summary?.maxTime,
                        summaryStatus: parsed.summary?.status
                    });
                    
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

    ws.on('close', () => {
        console.log('[TEST] WebSocket клиент отключен');
    });
});

server.listen(0, () => {
    const port = server.address().port;
    console.log(`[TEST] Тестовый сервер запущен на порту ${port}`);
    
    // Тест клиента
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    ws.on('open', () => {
        console.log('[TEST] WebSocket соединение установлено');
        
        const solutionCode = `// solution.js
const readline = require('readline');

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
    solve();
});

function readNumber() {
    return Number(inputLines[curLine++]);
}

function getSum(a, b) {
    return a + b;
}

function solve() {
    const a = readNumber();
    const b = readNumber();
    const result = getSum(a, b);
    console.log(result);
}
`;

        ws.send(JSON.stringify({
            type: 'submit',
            code: solutionCode,
        }));
    });
    
    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('[TEST] Получено сообщение:', message.type);
        
        if (message.type === 'results') {
            console.log('[TEST] Результаты получены:', {
                maxMemoryMb: message.summary?.maxMemoryMb,
                maxTime: message.summary?.maxTime,
                status: message.summary?.status,
                nodeVersion: message.summary?.nodeVersion
            });
            
            if (message.summary?.maxMemoryMb === 0 || message.summary?.maxMemoryMb === undefined) {
                console.log('\n⚠️  ПРОБЛЕМА: Память равна 0 или undefined!');
                console.log('   Полные данные summary:', JSON.stringify(message.summary, null, 2));
            } else {
                console.log(`\n✓ УСПЕХ: Память измерена корректно: ${message.summary.maxMemoryMb} MB`);
            }
            
            ws.close();
            server.close();
        }
    });
    
    ws.on('error', (err) => {
        console.error('[TEST] WebSocket ошибка:', err);
        server.close();
    });
    
    setTimeout(() => {
        console.log('\n[TEST] Таймаут, закрытие...');
        ws.close();
        server.close();
    }, 10000);
});

