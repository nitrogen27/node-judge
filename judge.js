// judge.js
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const path = require('node:path');

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

// ---- ТЕСТЫ ----
const tests = [
    {
        name: 'small positive',
        input: '1\n2\n',
        expected: '3',
    },
    {
        name: 'zeros',
        input: '0\n0\n',
        expected: '0',
    },
    {
        name: 'negative + positive',
        input: '-5\n10\n',
        expected: '5',
    },
    {
        name: 'two negatives',
        input: '-7\n-3\n',
        expected: '-10',
    },
    {
        name: 'big numbers',
        input: '1000000000\n2000000000\n',
        expected: '3000000000',
    },
];

const solutionPath = path.join(__dirname, 'solution.js');

let maxMemoryMb = 0;

function runSingleTest(test) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [solutionPath], {
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

        child.on('close', (code) => {
            const endTime = performance.now();
            const timeMs = endTime - startTime;

            // Удаляем ANSI escape-коды из вывода перед сравнением
            const cleanedOutput = stripAnsiCodes(stdout);
            const normalizedOutput = cleanedOutput.trim();
            const normalizedExpected = String(test.expected).trim();

            const mem = process.memoryUsage().rss / 1024 / 1024; // MB
            if (mem > maxMemoryMb) {
                maxMemoryMb = mem;
            }

            const ok = code === 0 && normalizedOutput === normalizedExpected;

            resolve({
                name: test.name,
                ok,
                code,
                timeMs,
                memMb: mem,
                output: normalizedOutput,
                expected: normalizedExpected,
                stderr,
            });
        });

        child.stdin.write(test.input);
        child.stdin.end();
    });
}

async function main() {
    console.log('=== Node.js judge (честный запуск через stdin/stdout) ===\n');
    console.log(`Node version: ${process.version}`);
    console.log(`Solution file: ${solutionPath}\n`);

    let passed = 0;
    let totalTime = 0;
    let maxTime = 0;

    for (const test of tests) {
        try {
            const res = await runSingleTest(test);
            totalTime += res.timeMs;
            if (res.timeMs > maxTime) {
                maxTime = res.timeMs;
            }

            if (res.ok) {
                console.log(
                    `✔ ${test.name}: OK | time=${res.timeMs.toFixed(3)} ms | mem≈${res.memMb.toFixed(2)} MB`
                );
            } else {
                console.log(
                    `✘ ${test.name}: FAIL | code=${res.code} | time=${res.timeMs.toFixed(
                        3
                    )} ms | mem≈${res.memMb.toFixed(2)} MB`
                );
                console.log(`    expected: "${res.expected}", got: "${res.output}"`);
                if (res.stderr) {
                    console.log(`    stderr: ${res.stderr}`);
                }
            }
        } catch (err) {
            console.log(`✘ ${test.name}: ERROR`);
            console.error(err);
        }
    }

    console.log('\n=== Summary ===');
    console.log(`Tests passed: ${passed} / ${tests.length}`);
    console.log(`Total time: ${totalTime.toFixed(3)} ms`);
    console.log(`Max single test time: ${maxTime.toFixed(3)} ms`);
    console.log(`Max RSS memory during run: ${maxMemoryMb.toFixed(2)} MB`);

    const status = passed === tests.length ? 'OK' : 'FAILED';
    console.log(
        `\nOnline-judge style: ${status} — ${maxTime.toFixed(0)}ms, ${maxMemoryMb.toFixed(2)}Mb`
    );
}

main().catch((err) => {
    console.error('Judge crashed:', err);
    process.exit(1);
});
