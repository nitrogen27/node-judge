// test-websocket.js - Тест передачи данных через WebSocket
const WebSocket = require('ws');
const http = require('http');

// Импортируем функцию runTests из server.js
// Но так как она не экспортирована, создадим тест напрямую
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

const tempSolutionPath = path.join(__dirname, 'temp_solution.js');

const tests = [
    {
        name: 'small positive',
        input: '1\n2\n',
        expected: '3',
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
                    if (maxMemoryMb === 0) {
                        maxMemoryMb = 5.0;
                    }
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
                console.log(`[TEST] Результат теста:`, {
                    name: res.name,
                    memMb: res.memMb,
                    timeMs: res.timeMs,
                    ok: res.ok
                });
                
                results.push(res);
                
                totalTime += res.timeMs;
                if (res.timeMs > maxTime) {
                    maxTime = res.timeMs;
                }
                
                // ИСПРАВЛЕНИЕ: Проверяем, что memMb существует И больше 0
                // ИЛИ используем значение из результата, даже если оно 0 (но это маловероятно)
                console.log(`[TEST] До обновления: maxMemoryMb=${maxMemoryMb}, res.memMb=${res.memMb}`);
                if (res.memMb !== undefined && res.memMb !== null) {
                    if (res.memMb > maxMemoryMb) {
                        maxMemoryMb = res.memMb;
                    }
                }
                console.log(`[TEST] После обновления: maxMemoryMb=${maxMemoryMb}`);

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

        // ИСПРАВЛЕНИЕ: Если память все еще 0, используем дефолт
        const finalMemoryMb = maxMemoryMb > 0 ? maxMemoryMb : 5.0;
        
        console.log(`\n[TEST] Финальные значения:`);
        console.log(`  maxMemoryMb: ${maxMemoryMb}`);
        console.log(`  finalMemoryMb: ${finalMemoryMb}`);
        console.log(`  maxTime: ${maxTime}`);
        console.log(`  status: ${status}`);

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
        
        console.log(`\n[TEST] JSON результат:`, JSON.stringify(result, null, 2));
        
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

// Тест
async function main() {
    console.log('=== Тест передачи данных через WebSocket API ===\n');
    
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
        const result = await runTests(solutionCode);
        
        console.log(`\n=== РЕЗУЛЬТАТЫ ===`);
        console.log(`✓ Память в summary: ${result.summary.maxMemoryMb} MB`);
        console.log(`✓ Время: ${result.summary.maxTime} ms`);
        console.log(`✓ Статус: ${result.summary.status}`);
        
        if (result.summary.maxMemoryMb === 0 || result.summary.maxMemoryMb === 5.0) {
            console.log(`\n⚠️  ПРОБЛЕМА: Память не измерена корректно!`);
            console.log(`   Значение: ${result.summary.maxMemoryMb} MB`);
        } else {
            console.log(`\n✓ УСПЕХ: Память измерена корректно!`);
        }
        
    } catch (err) {
        console.error(`\n✗ ОШИБКА: ${err.message}`);
        console.error(err.stack);
    }
}

main().catch(console.error);

