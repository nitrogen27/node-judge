// test-io.js - Тесты проверки ввода-вывода
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const path = require('path');
const fs = require('fs').promises;

// Функция для удаления ANSI escape-кодов (копия из server.js)
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

// Тесты для проверки ввода-вывода
const ioTests = [
    {
        name: 'Простые числа (без ANSI)',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    const a = parseInt(lines[0]);
    const b = parseInt(lines[1]);
    console.log(a + b);
});
        `,
        input: '5\n10\n',
        expected: '15'
    },
    {
        name: 'Вывод с ANSI кодами (цветной)',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    const a = parseInt(lines[0]);
    const b = parseInt(lines[1]);
    // Используем ANSI коды для цвета
    process.stdout.write('\\x1b[33m' + (a + b) + '\\x1b[39m');
});
        `,
        input: '5\n10\n',
        expected: '15'
    },
    {
        name: 'Многострочный ввод',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    const sum = lines.reduce((acc, line) => acc + parseInt(line), 0);
    console.log(sum);
});
        `,
        input: '1\n2\n3\n4\n5\n',
        expected: '15'
    },
    {
        name: 'Отрицательные числа',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    const a = parseInt(lines[0]);
    const b = parseInt(lines[1]);
    console.log(a + b);
});
        `,
        input: '-5\n10\n',
        expected: '5'
    },
    {
        name: 'Большие числа',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    const a = parseInt(lines[0]);
    const b = parseInt(lines[1]);
    console.log(a + b);
});
        `,
        input: '1000000000\n2000000000\n',
        expected: '3000000000'
    },
    {
        name: 'Строковый вывод (не число)',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    console.log('Result: ' + lines[0]);
});
        `,
        input: 'hello\n',
        expected: 'Result: hello'
    },
    {
        name: 'Пустой вывод (только пробелы)',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
rl.on('line', () => {});
rl.on('close', () => {
    console.log('   ');
});
        `,
        input: 'test\n',
        expected: ''
    },
    {
        name: 'Многострочный вывод',
        code: `
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
    // Выводим каждую строку через console.log - это добавит \\n после каждой строки
    lines.forEach((line, index) => {
        if (index < lines.length - 1) {
            console.log(line);
        } else {
            // Последняя строка без переноса в конце
            process.stdout.write(line);
        }
    });
});
        `,
        input: 'line1\nline2\nline3\n',
        expected: 'line1\nline2\nline3'
    }
];

const tempSolutionPath = path.join(__dirname, 'temp_test_solution.js');

async function runIOTest(test) {
    return new Promise(async (resolve, reject) => {
        try {
            // Сохраняем код во временный файл
            await fs.writeFile(tempSolutionPath, test.code, 'utf8');

            const child = spawn(process.execPath, [tempSolutionPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const startTime = performance.now();
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', (err) => {
                reject(err);
            });

            child.on('close', async (code) => {
                const endTime = performance.now();
                const timeMs = endTime - startTime;

                // Очищаем ANSI коды
                const cleanedOutput = stripAnsiCodes(stdout);
                // Нормализуем вывод: убираем завершающие пробелы и переносы строк
                // Но сохраняем внутренние переносы строк
                let normalizedOutput = cleanedOutput;
                // Убираем завершающие пробелы и переносы строк
                normalizedOutput = normalizedOutput.replace(/[\r\n\s]+$/, '');
                // Нормализуем ожидаемый вывод аналогично
                const normalizedExpected = String(test.expected).replace(/[\r\n\s]+$/, '');

                const ok = code === 0 && normalizedOutput === normalizedExpected;

                // Удаляем временный файл
                try {
                    await fs.unlink(tempSolutionPath);
                } catch (e) {
                    // Игнорируем ошибки удаления
                }

                resolve({
                    name: test.name,
                    ok,
                    code,
                    timeMs: Math.round(timeMs * 100) / 100,
                    output: normalizedOutput,
                    expected: normalizedExpected,
                    rawOutput: stdout, // Сырой вывод с ANSI кодами
                    stderr: stderr || null,
                });
            });

            child.stdin.write(test.input);
            child.stdin.end();
        } catch (err) {
            // Удаляем временный файл в случае ошибки
            try {
                await fs.unlink(tempSolutionPath);
            } catch (e) {
                // Игнорируем
            }
            reject(err);
        }
    });
}

async function runAllTests() {
    console.log('=== Тесты проверки ввода-вывода ===\n');
    console.log(`Node version: ${process.version}`);
    console.log(`Всего тестов: ${ioTests.length}\n`);

    let passed = 0;
    let failed = 0;
    const results = [];

    for (const test of ioTests) {
        try {
            const result = await runIOTest(test);
            results.push(result);

            if (result.ok) {
                passed++;
                console.log(`✓ ${test.name}: OK | time=${result.timeMs.toFixed(3)} ms`);
            } else {
                failed++;
                console.log(`✗ ${test.name}: FAIL`);
                console.log(`  Ожидалось: "${result.expected}"`);
                console.log(`  Получено: "${result.output}"`);
                if (result.rawOutput !== result.output) {
                    console.log(`  Сырой вывод (с ANSI): "${result.rawOutput.replace(/\x1b/g, '\\x1b')}"`);
                }
                if (result.stderr) {
                    console.log(`  Stderr: ${result.stderr}`);
                }
                if (result.code !== 0) {
                    console.log(`  Exit code: ${result.code}`);
                }
            }
        } catch (err) {
            failed++;
            console.log(`✗ ${test.name}: ERROR`);
            console.error(`  ${err.message}`);
            results.push({
                name: test.name,
                ok: false,
                error: err.message
            });
        }
    }

    console.log('\n=== Результаты ===');
    console.log(`Пройдено: ${passed} / ${ioTests.length}`);
    console.log(`Провалено: ${failed} / ${ioTests.length}`);
    console.log(`Успешность: ${((passed / ioTests.length) * 100).toFixed(1)}%`);

    if (failed === 0) {
        console.log('\n✓ Все тесты пройдены успешно!');
        return 0;
    } else {
        console.log('\n✗ Некоторые тесты провалены');
        return 1;
    }
}

// Запускаем тесты
if (require.main === module) {
    runAllTests()
        .then((exitCode) => {
            process.exit(exitCode);
        })
        .catch((err) => {
            console.error('Критическая ошибка:', err);
            process.exit(1);
        });
}

module.exports = { runAllTests, runIOTest, stripAnsiCodes };

