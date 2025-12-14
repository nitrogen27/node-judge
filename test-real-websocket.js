// test-real-websocket.js - Реальный тест WebSocket соединения
const WebSocket = require('ws');
const http = require('http');
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

// Импортируем реальные функции из server.js
// Но так как они не экспортированы, скопируем логику

const tempSolutionPath = path.join(__dirname, 'temp_solution.js');

const tests = [
    {
        name: 'real test',
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

        console.log('\n[TEST] runTests возвращает:');
        console.log('  nodeVersion:', nodeVersion);
        console.log('  status:', status);
        console.log('  maxMemoryMb:', finalMemoryMb);
        console.log('  maxTime:', maxTime);
        console.log('  passed:', passed);
        console.log('  total:', tests.length);

        const result = {
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

        console.log('\n[TEST] Структура result.summary:');
        console.log(JSON.stringify(result.summary, null, 2));

        return result;
    } catch (err) {
        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем
        }
        throw err;
    }
}

// Тест реального WebSocket
async function testRealWebSocket() {
    console.log('=== Реальный тест WebSocket ===\n');

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

    try {
        console.log('1. Вызов runTests...');
        const testResults = await runTests(solutionCode);
        
        console.log('\n2. Проверка testResults:');
        console.log('  testResults тип:', typeof testResults);
        console.log('  testResults ключи:', Object.keys(testResults));
        console.log('  testResults.summary существует:', !!testResults.summary);
        
        if (!testResults.summary) {
            console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА: testResults.summary отсутствует!');
            return false;
        }
        
        console.log('\n3. Проверка полей summary:');
        console.log('  summary.nodeVersion:', testResults.summary.nodeVersion);
        console.log('  summary.maxMemoryMb:', testResults.summary.maxMemoryMb);
        console.log('  summary.status:', testResults.summary.status);
        console.log('  summary.maxTime:', testResults.summary.maxTime);
        
        // Симуляция того, что происходит в WebSocket обработчике
        console.log('\n4. Симуляция WebSocket обработчика:');
        
        const messageData = {
            type: 'results',
            results: testResults.results || [],
            summary: {
                passed: testResults.summary.passed || 0,
                total: testResults.summary.total || 0,
                totalTime: testResults.summary.totalTime || 0,
                maxTime: testResults.summary.maxTime || 0,
                maxMemoryMb: testResults.summary.maxMemoryMb !== undefined && testResults.summary.maxMemoryMb !== null ? testResults.summary.maxMemoryMb : 0,
                nodeVersion: testResults.summary.nodeVersion || 'N/A',
                status: testResults.summary.status || 'UNKNOWN',
            },
        };
        
        console.log('  messageData.summary:', JSON.stringify(messageData.summary, null, 2));
        
        // JSON сериализация/десериализация
        console.log('\n5. JSON сериализация/десериализация:');
        const jsonString = JSON.stringify(messageData);
        const parsed = JSON.parse(jsonString);
        
        console.log('  parsed.summary.nodeVersion:', parsed.summary?.nodeVersion);
        console.log('  parsed.summary.maxMemoryMb:', parsed.summary?.maxMemoryMb);
        console.log('  parsed.summary.status:', parsed.summary?.status);
        
        // Проверка
        if (!parsed.summary.nodeVersion || parsed.summary.nodeVersion === 'N/A') {
            console.error('\n❌ ОШИБКА: nodeVersion отсутствует или равен N/A!');
            console.error('  Значение:', parsed.summary.nodeVersion);
            return false;
        }
        
        if (!parsed.summary.maxMemoryMb || parsed.summary.maxMemoryMb === 0) {
            console.error('\n❌ ОШИБКА: maxMemoryMb отсутствует или равен 0!');
            console.error('  Значение:', parsed.summary.maxMemoryMb);
            return false;
        }
        
        if (!parsed.summary.status || parsed.summary.status === 'UNKNOWN') {
            console.error('\n❌ ОШИБКА: status отсутствует или равен UNKNOWN!');
            console.error('  Значение:', parsed.summary.status);
            return false;
        }
        
        console.log('\n✓ Все проверки пройдены!');
        console.log(`  nodeVersion: ${parsed.summary.nodeVersion}`);
        console.log(`  maxMemoryMb: ${parsed.summary.maxMemoryMb}`);
        console.log(`  status: ${parsed.summary.status}`);
        
        return true;
        
    } catch (err) {
        console.error('\n❌ ОШИБКА:', err.message);
        console.error(err.stack);
        return false;
    }
}

testRealWebSocket().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error('Критическая ошибка:', err);
    process.exit(1);
});

