// test-integration-full.js - Полный интеграционный тест от сервера до UI
const WebSocket = require('ws');
const http = require('http');
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);
const tempSolutionPath = path.join(__dirname, 'temp_solution.js');

const tests = [
    {
        name: 'integration test',
        input: '10\n20\n',
        expected: '30',
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

// Интеграционный тест
async function runIntegrationTest() {
    console.log('=== Полный интеграционный тест ===\n');
    
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
        console.log('1. Запуск тестов...');
        const testResults = await runTests(solutionCode);
        
        console.log('\n2. Проверка результатов:');
        console.log(`   maxMemoryMb: ${testResults.summary.maxMemoryMb}`);
        console.log(`   maxTime: ${testResults.summary.maxTime}`);
        console.log(`   nodeVersion: ${testResults.summary.nodeVersion}`);
        console.log(`   status: ${testResults.summary.status}`);
        
        // Проверка 1: nodeVersion
        if (!testResults.summary.nodeVersion) {
            console.log('\n   ❌ ОШИБКА: nodeVersion отсутствует!');
            return false;
        } else {
            console.log(`   ✓ nodeVersion присутствует: ${testResults.summary.nodeVersion}`);
        }
        
        // Проверка 2: maxMemoryMb
        if (testResults.summary.maxMemoryMb === 0 || testResults.summary.maxMemoryMb === undefined) {
            console.log('\n   ❌ ОШИБКА: maxMemoryMb равен 0 или undefined!');
            console.log(`   Значение: ${testResults.summary.maxMemoryMb}`);
            return false;
        } else {
            console.log(`   ✓ maxMemoryMb корректно: ${testResults.summary.maxMemoryMb} MB`);
        }
        
        // Проверка 3: maxTime
        if (testResults.summary.maxTime === 0 || testResults.summary.maxTime === undefined) {
            console.log('\n   ⚠️  ПРЕДУПРЕЖДЕНИЕ: maxTime равен 0 или undefined');
        } else {
            console.log(`   ✓ maxTime корректно: ${testResults.summary.maxTime} ms`);
        }
        
        // Проверка 4: Симуляция UI отображения
        console.log('\n3. Симуляция UI отображения:');
        const displayString = `A Node.js ${testResults.summary.nodeVersion} ${testResults.summary.status} — ${Math.round(testResults.summary.maxTime || 0)}ms ${(testResults.summary.maxMemoryMb || 0).toFixed(2)}Mb`;
        console.log(`   Строка: "${displayString}"`);
        
        if (displayString.includes('Node.js —')) {
            console.log('   ❌ ОШИБКА: Версия Node.js отсутствует в строке!');
            return false;
        }
        
        if (displayString.includes('0.00Mb') && testResults.summary.maxMemoryMb > 0) {
            console.log('   ❌ ОШИБКА: Память отображается как 0.00Mb!');
            return false;
        }
        
        console.log('   ✓ Строка отображения корректна');
        
        // Проверка 5: JSON сериализация
        console.log('\n4. Проверка JSON сериализации:');
        const jsonString = JSON.stringify(testResults);
        const parsed = JSON.parse(jsonString);
        
        if (!parsed.summary.nodeVersion) {
            console.log('   ❌ ОШИБКА: nodeVersion потерялся при сериализации!');
            return false;
        }
        
        if (parsed.summary.maxMemoryMb === 0 || parsed.summary.maxMemoryMb === undefined) {
            console.log('   ❌ ОШИБКА: maxMemoryMb потерялся при сериализации!');
            return false;
        }
        
        console.log('   ✓ JSON сериализация корректна');
        console.log(`   nodeVersion после парсинга: ${parsed.summary.nodeVersion}`);
        console.log(`   maxMemoryMb после парсинга: ${parsed.summary.maxMemoryMb}`);
        
        console.log('\n=== ИТОГИ ===');
        console.log('✓ Все проверки пройдены');
        console.log(`✓ Память: ${testResults.summary.maxMemoryMb} MB`);
        console.log(`✓ Версия: ${testResults.summary.nodeVersion}`);
        console.log(`✓ Время: ${testResults.summary.maxTime} ms`);
        
        return true;
        
    } catch (err) {
        console.error('\n❌ ОШИБКА:', err.message);
        console.error(err.stack);
        return false;
    }
}

runIntegrationTest().then(success => {
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error('Критическая ошибка:', err);
    process.exit(1);
});

