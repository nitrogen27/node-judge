// test-server-direct.js - Прямой тест функции runSingleTest из server.js
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

const tempSolutionPath = path.join(__dirname, 'temp_solution.js');

// Копируем функцию getProcessMemoryMb из server.js
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
        return rssKb / 1024; // Конвертируем KB в MB
    } catch (err) {
        return null;
    }
}

// Копируем функцию runSingleTest из server.js
async function runSingleTest(test, solutionCode) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`\n[TEST] Запуск теста: ${test.name}`);
            console.log(`[TEST] Сохранение решения во временный файл...`);
            
            // Сохраняем решение во временный файл
            await fs.writeFile(tempSolutionPath, solutionCode, 'utf8');
            console.log(`[TEST] Файл создан: ${tempSolutionPath}`);

            const child = spawn(process.execPath, [tempSolutionPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            console.log(`[TEST] Процесс запущен, PID: ${child.pid}`);
            console.log(`[TEST] child.pid существует: ${!!child.pid}`);
            console.log(`[TEST] child.killed: ${child.killed}`);

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
                        console.log(`[MEMORY] Проверка памяти PID ${child.pid}...`);
                        const mem = await getProcessMemoryMb(child.pid);
                        console.log(`[MEMORY] Результат: ${mem !== null ? mem.toFixed(2) + ' MB' : 'null'}`);
                        if (mem !== null && mem > 0) {
                            memorySamples.push(mem);
                            if (mem > maxMemoryMb) {
                                maxMemoryMb = mem;
                                console.log(`[MEMORY] Новый максимум: ${maxMemoryMb.toFixed(2)} MB`);
                            }
                        }
                    } catch (e) {
                        console.log(`[MEMORY] Ошибка: ${e.message}`);
                    }
                } else {
                    console.log(`[MEMORY] Пропуск: PID=${child.pid}, killed=${child.killed}`);
                }
            };
            
            // Начинаем мониторинг после небольшой задержки
            console.log(`[TEST] Настройка мониторинга памяти...`);
            setTimeout(() => {
                console.log(`[TEST] Запуск мониторинга, PID: ${child.pid}, killed: ${child.killed}`);
                if (child.pid && !child.killed) {
                    // Первая проверка сразу
                    checkMemory();
                    
                    // Проверяем память несколько раз с интервалом
                    memoryCheckInterval.interval = setInterval(() => {
                        if (child.killed) {
                            console.log(`[MEMORY] Процесс завершен, остановка мониторинга`);
                            if (memoryCheckInterval.interval) {
                                clearInterval(memoryCheckInterval.interval);
                            }
                            return;
                        }
                        // Вызываем без await, чтобы не блокировать
                        checkMemory().catch((e) => {
                            console.log(`[MEMORY] Ошибка в интервале: ${e.message}`);
                        });
                    }, 30); // Проверяем каждые 30мс
                } else {
                    console.log(`[TEST] Процесс уже завершен или PID недоступен`);
                }
            }, 20); // Запускаем через 20мс

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                console.log(`[STDOUT] Получены данные: "${stdout.trim()}"`);
                // Проверяем память при получении данных
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
                console.log(`[STDERR] Получены данные: "${stderr}"`);
                // Проверяем память при получении данных
                if (child.pid && !child.killed) {
                    checkMemory().catch(() => {});
                }
            });

            child.on('error', (err) => {
                console.log(`[ERROR] Ошибка процесса: ${err.message}`);
                if (memoryCheckInterval && memoryCheckInterval.interval) {
                    clearInterval(memoryCheckInterval.interval);
                }
                reject(err);
            });

            child.on('close', async (code) => {
                console.log(`[CLOSE] Процесс завершен, код: ${code}`);
                console.log(`[CLOSE] PID при закрытии: ${child.pid}`);
                console.log(`[CLOSE] killed: ${child.killed}`);
                
                // Очищаем интервалы мониторинга
                if (memoryCheckInterval.interval) {
                    clearInterval(memoryCheckInterval.interval);
                    console.log(`[CLOSE] Интервал очищен`);
                }
                
                const endTime = performance.now();
                const timeMs = endTime - startTime;

                // Финальная проверка памяти - пробуем еще раз
                if (child.pid) {
                    console.log(`[CLOSE] Финальная проверка памяти PID ${child.pid}...`);
                    try {
                        const finalMem = await getProcessMemoryMb(child.pid);
                        console.log(`[CLOSE] Финальная память: ${finalMem !== null ? finalMem.toFixed(2) + ' MB' : 'null'}`);
                        if (finalMem !== null && finalMem > 0 && finalMem > maxMemoryMb) {
                            maxMemoryMb = finalMem;
                            console.log(`[CLOSE] Обновлен максимум: ${maxMemoryMb.toFixed(2)} MB`);
                        }
                    } catch (e) {
                        console.log(`[CLOSE] Ошибка финальной проверки: ${e.message}`);
                    }
                } else {
                    console.log(`[CLOSE] PID недоступен для финальной проверки`);
                }
                
                // Даем немного времени для завершения всех проверок памяти
                console.log(`[CLOSE] Ожидание 30мс для завершения проверок...`);
                await new Promise(resolve => setTimeout(resolve, 30));

                // Если память не была измерена, используем приблизительное значение
                if (maxMemoryMb === 0 && memorySamples.length === 0) {
                    console.log(`[FALLBACK] Память не измерена, попытка child.memoryUsage...`);
                    // Пробуем использовать child.memoryUsage если доступен
                    try {
                        if (typeof child.memoryUsage === 'function') {
                            const mem = child.memoryUsage().rss / 1024 / 1024;
                            console.log(`[FALLBACK] child.memoryUsage: ${mem.toFixed(2)} MB`);
                            if (mem > 0) {
                                maxMemoryMb = mem;
                            }
                        } else {
                            console.log(`[FALLBACK] child.memoryUsage недоступен`);
                        }
                    } catch (e) {
                        console.log(`[FALLBACK] Ошибка child.memoryUsage: ${e.message}`);
                    }
                    
                    // Если все еще 0, используем дефолт
                    if (maxMemoryMb === 0) {
                        console.log(`[FALLBACK] Использование дефолтного значения: 5.0 MB`);
                        maxMemoryMb = 5.0;
                    }
                } else if (memorySamples.length > 0 && maxMemoryMb === 0) {
                    console.log(`[FALLBACK] Использование максимального значения из образцов`);
                    maxMemoryMb = Math.max(...memorySamples);
                }

                const normalizedOutput = stdout.trim();
                const normalizedExpected = String(test.expected).trim();

                const ok = code === 0 && normalizedOutput === normalizedExpected;

                console.log(`\n[RESULT] Результаты теста:`);
                console.log(`  - Название: ${test.name}`);
                console.log(`  - OK: ${ok}`);
                console.log(`  - Код возврата: ${code}`);
                console.log(`  - Время: ${timeMs.toFixed(2)} мс`);
                console.log(`  - Память: ${maxMemoryMb.toFixed(2)} MB`);
                console.log(`  - Образцы памяти: ${memorySamples.length}`);
                console.log(`  - Вывод: "${normalizedOutput}"`);
                console.log(`  - Ожидалось: "${normalizedExpected}"`);

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

            console.log(`[TEST] Отправка входных данных: "${test.input}"`);
            child.stdin.write(test.input);
            child.stdin.end();
            console.log(`[TEST] stdin закрыт`);
        } catch (err) {
            console.log(`[ERROR] Ошибка в runSingleTest: ${err.message}`);
            reject(err);
        }
    });
}

// Тест
async function main() {
    console.log('=== Прямой тест runSingleTest из server.js ===\n');
    console.log(`Платформа: ${process.platform}`);
    console.log(`Node.js версия: ${process.version}\n`);

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

    const test = {
        name: 'small positive',
        input: '1\n2\n',
        expected: '3',
    };

    try {
        const result = await runSingleTest(test, solutionCode);
        
        console.log(`\n=== ИТОГИ ===`);
        console.log(`Тест пройден: ${result.ok ? 'ДА' : 'НЕТ'}`);
        console.log(`Память измерена: ${result.memMb > 0 ? 'ДА' : 'НЕТ'} (${result.memMb.toFixed(2)} MB)`);
        
        if (result.memMb === 0 || result.memMb === 5.0) {
            console.log(`\n⚠️  ПРОБЛЕМА: Память не была измерена корректно!`);
            console.log(`   Используется значение по умолчанию или 0`);
        } else {
            console.log(`\n✓ УСПЕХ: Память успешно измерена!`);
        }
        
        // Удаляем временный файл
        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем
        }
    } catch (err) {
        console.error(`\n✗ ОШИБКА: ${err.message}`);
        console.error(err.stack);
        
        // Удаляем временный файл
        try {
            await fs.unlink(tempSolutionPath);
        } catch (e) {
            // Игнорируем
        }
    }
}

main().catch(console.error);

