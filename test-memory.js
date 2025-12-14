// test-memory.js - Тесты для проверки измерения памяти
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

// Функция для получения памяти процесса по PID (macOS/Linux)
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

// Тестовый скрипт, который использует память
const testScript = `
// Тест использования памяти
const arr = [];
for (let i = 0; i < 1000000; i++) {
    arr.push(i);
}
const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

reader.on('line', (line) => {
    const num = parseInt(line, 10);
    console.log(num * 2);
    reader.close();
});
`;

async function testMemoryMeasurement() {
    console.log('=== Тест измерения памяти ===\n');
    
    const testFile = path.join(__dirname, 'test_memory_temp.js');
    
    try {
        // Сохраняем тестовый скрипт
        await fs.writeFile(testFile, testScript, 'utf8');
        
        console.log('1. Тест: Измерение памяти дочернего процесса');
        const child = spawn(process.execPath, [testFile], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let maxMemoryMb = 0;
        const memorySamples = [];
        const startTime = Date.now();

        // Мониторинг памяти
        const memoryCheckInterval = setInterval(async () => {
            if (child.pid) {
                try {
                    const mem = await getProcessMemoryMb(child.pid);
                    if (mem !== null && mem > 0) {
                        memorySamples.push(mem);
                        console.log(`   PID ${child.pid}: ${mem.toFixed(2)} MB`);
                        if (mem > maxMemoryMb) {
                            maxMemoryMb = mem;
                        }
                    }
                } catch (e) {
                    console.log(`   Ошибка измерения: ${e.message}`);
                }
            }
        }, 100);

        let stdout = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        await new Promise((resolve) => {
            child.on('close', () => {
                clearInterval(memoryCheckInterval);
                resolve();
            });
            child.stdin.write('5\n');
            child.stdin.end();
        });

        // Финальная проверка
        if (child.pid) {
            const finalMem = await getProcessMemoryMb(child.pid);
            console.log(`   Финальная проверка PID ${child.pid}: ${finalMem ? finalMem.toFixed(2) + ' MB' : 'процесс завершен'}`);
        }

        console.log(`\n   Результаты:`);
        console.log(`   - Максимальная память: ${maxMemoryMb.toFixed(2)} MB`);
        console.log(`   - Количество образцов: ${memorySamples.length}`);
        console.log(`   - Минимальная: ${memorySamples.length > 0 ? Math.min(...memorySamples).toFixed(2) : 'N/A'} MB`);
        console.log(`   - Средняя: ${memorySamples.length > 0 ? (memorySamples.reduce((a, b) => a + b, 0) / memorySamples.length).toFixed(2) : 'N/A'} MB`);

        if (maxMemoryMb > 0) {
            console.log(`\n   ✓ Тест пройден: Память успешно измерена`);
        } else {
            console.log(`\n   ✗ Тест провален: Память не была измерена`);
        }

        // Тест 2: Проверка доступности child.memoryUsage
        console.log('\n2. Тест: Проверка child.memoryUsage()');
        const child2 = spawn(process.execPath, ['-e', 'console.log("test")'], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        await new Promise((resolve) => {
            child2.on('close', () => resolve());
        });

        const hasMemoryUsage = typeof child2.memoryUsage === 'function';
        console.log(`   child.memoryUsage доступен: ${hasMemoryUsage ? 'Да' : 'Нет'}`);
        
        if (hasMemoryUsage) {
            try {
                const mem = child2.memoryUsage();
                console.log(`   Значение: ${JSON.stringify(mem)}`);
            } catch (e) {
                console.log(`   Ошибка вызова: ${e.message}`);
            }
        }

        // Тест 3: Простой процесс
        console.log('\n3. Тест: Простой процесс (минимальная память)');
        const simpleScript = `
const readline = require('readline');
const reader = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
reader.on('line', (line) => {
    console.log(parseInt(line, 10) + 1);
    reader.close();
});
`;
        const simpleFile = path.join(__dirname, 'test_simple_temp.js');
        await fs.writeFile(simpleFile, simpleScript, 'utf8');

        const child3 = spawn(process.execPath, [simpleFile], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let simpleMemory = 0;
        const simpleInterval = setInterval(async () => {
            if (child3.pid) {
                const mem = await getProcessMemoryMb(child3.pid);
                if (mem !== null && mem > 0 && mem > simpleMemory) {
                    simpleMemory = mem;
                }
            }
        }, 50);

        await new Promise((resolve) => {
            child3.on('close', () => {
                clearInterval(simpleInterval);
                resolve();
            });
            child3.stdin.write('10\n');
            child3.stdin.end();
        });

        console.log(`   Память простого процесса: ${simpleMemory.toFixed(2)} MB`);
        if (simpleMemory > 0) {
            console.log(`   ✓ Тест пройден`);
        } else {
            console.log(`   ✗ Тест провален`);
        }

        // Удаляем временные файлы
        await fs.unlink(simpleFile);
        await fs.unlink(testFile);

        console.log('\n=== Итоги тестирования ===');
        console.log(`Платформа: ${process.platform}`);
        console.log(`Node.js версия: ${process.version}`);
        console.log(`Измерение памяти через ps: ${maxMemoryMb > 0 ? 'Работает' : 'Не работает'}`);
        console.log(`child.memoryUsage доступен: ${hasMemoryUsage ? 'Да' : 'Нет'}`);

    } catch (err) {
        console.error('Ошибка при тестировании:', err);
        // Пытаемся удалить временные файлы
        try {
            await fs.unlink(testFile);
            await fs.unlink(path.join(__dirname, 'test_simple_temp.js'));
        } catch (e) {
            // Игнорируем
        }
    }
}

testMemoryMeasurement().catch(console.error);

