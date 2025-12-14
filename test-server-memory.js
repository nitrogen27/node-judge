// test-server-memory.js - Тест измерения памяти сервера
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('fs').promises;

const execAsync = promisify(exec);

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

async function testWithSolution() {
    console.log('=== Тест измерения памяти с реальным решением ===\n');
    
    const solutionCode = await fs.readFile(path.join(__dirname, 'solution.js'), 'utf8');
    const testFile = path.join(__dirname, 'temp_solution.js');
    
    try {
        await fs.writeFile(testFile, solutionCode, 'utf8');
        
        const test = {
            name: 'test memory',
            input: '10\n20\n',
            expected: '30',
        };
        
        const child = spawn(process.execPath, [testFile], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const startTime = Date.now();
        let stdout = '';
        let maxMemoryMb = 0;
        const memorySamples = [];
        
        const checkMemory = async () => {
            if (child.pid && !child.killed) {
                try {
                    const mem = await getProcessMemoryMb(child.pid);
                    if (mem !== null && mem > 0) {
                        memorySamples.push(mem);
                        console.log(`   [${Date.now() - startTime}ms] PID ${child.pid}: ${mem.toFixed(2)} MB`);
                        if (mem > maxMemoryMb) {
                            maxMemoryMb = mem;
                        }
                    }
                } catch (e) {
                    // Игнорируем
                }
            }
        };
        
        // Проверяем память сразу после запуска
        setTimeout(() => checkMemory(), 10);
        
        // Периодическая проверка
        const interval = setInterval(() => {
            if (child.killed) {
                clearInterval(interval);
                return;
            }
            checkMemory();
        }, 20);
        
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
            checkMemory();
        });

        await new Promise((resolve) => {
            child.on('close', () => {
                clearInterval(interval);
                resolve();
            });
            child.stdin.write(test.input);
            child.stdin.end();
        });
        
        // Финальная проверка
        if (child.pid) {
            const finalMem = await getProcessMemoryMb(child.pid);
            if (finalMem !== null && finalMem > 0) {
                console.log(`   Финальная проверка: ${finalMem.toFixed(2)} MB`);
                if (finalMem > maxMemoryMb) {
                    maxMemoryMb = finalMem;
                }
            }
        }
        
        console.log(`\n   Результат: ${stdout.trim()}`);
        console.log(`   Ожидалось: ${test.expected}`);
        console.log(`   Максимальная память: ${maxMemoryMb.toFixed(2)} MB`);
        console.log(`   Количество измерений: ${memorySamples.length}`);
        
        if (maxMemoryMb > 0) {
            console.log(`\n   ✓ УСПЕХ: Память успешно измерена (${maxMemoryMb.toFixed(2)} MB)`);
        } else {
            console.log(`\n   ✗ ОШИБКА: Память не была измерена`);
        }
        
        await fs.unlink(testFile);
        
    } catch (err) {
        console.error('Ошибка:', err);
        try {
            await fs.unlink(testFile);
        } catch (e) {
            // Игнорируем
        }
    }
}

testWithSolution().catch(console.error);

