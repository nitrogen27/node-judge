// test-ui-full.js - Полный UI тест с проверкой отображения
// Симуляция компонента App для тестирования логики отображения
function testUIDisplay(results) {
    console.log('\n=== Тест отображения UI ===\n');
    
    if (!results) {
        console.log('❌ Результаты отсутствуют');
        return false;
    }
    
    if (!results.summary) {
        console.log('❌ summary отсутствует');
        return false;
    }
    
    const summary = results.summary;
    
    // Проверка версии Node.js
    console.log('1. Проверка версии Node.js:');
    console.log(`   summary.nodeVersion: ${summary.nodeVersion}`);
    if (!summary.nodeVersion) {
        console.log('   ❌ ОШИБКА: nodeVersion отсутствует!');
        return false;
    } else {
        console.log(`   ✓ Версия Node.js: ${summary.nodeVersion}`);
    }
    
    // Проверка памяти
    console.log('\n2. Проверка памяти:');
    console.log(`   summary.maxMemoryMb: ${summary.maxMemoryMb}`);
    console.log(`   Тип: ${typeof summary.maxMemoryMb}`);
    if (summary.maxMemoryMb === undefined || summary.maxMemoryMb === null) {
        console.log('   ❌ ОШИБКА: maxMemoryMb отсутствует!');
        return false;
    } else if (summary.maxMemoryMb === 0) {
        console.log('   ⚠️  ПРЕДУПРЕЖДЕНИЕ: maxMemoryMb равен 0');
    } else {
        console.log(`   ✓ Память: ${summary.maxMemoryMb} MB`);
    }
    
    // Проверка времени
    console.log('\n3. Проверка времени:');
    console.log(`   summary.maxTime: ${summary.maxTime}`);
    if (summary.maxTime === undefined || summary.maxTime === null) {
        console.log('   ❌ ОШИБКА: maxTime отсутствует!');
        return false;
    } else {
        console.log(`   ✓ Время: ${summary.maxTime} ms`);
    }
    
    // Проверка статуса
    console.log('\n4. Проверка статуса:');
    console.log(`   summary.status: ${summary.status}`);
    if (!summary.status) {
        console.log('   ❌ ОШИБКА: status отсутствует!');
        return false;
    } else {
        console.log(`   ✓ Статус: ${summary.status}`);
    }
    
    // Симуляция отображения
    console.log('\n5. Симуляция отображения в UI:');
    const nodeVersion = summary.nodeVersion || 'N/A';
    const status = summary.status || 'UNKNOWN';
    const maxTime = Math.round(summary.maxTime || 0);
    const maxMemoryMb = (summary.maxMemoryMb || 0).toFixed(2);
    
    const displayString = `A Node.js ${nodeVersion} ${status} — ${maxTime}ms ${maxMemoryMb}Mb`;
    console.log(`   Отображаемая строка: "${displayString}"`);
    
    // Проверка на наличие проблем
    if (displayString.includes('N/A') || displayString.includes('UNKNOWN')) {
        console.log('   ❌ ОШИБКА: В строке есть N/A или UNKNOWN');
        return false;
    }
    
    if (displayString.includes('0.00Mb') && summary.maxMemoryMb > 0) {
        console.log('   ❌ ОШИБКА: Память отображается как 0.00Mb, хотя реальное значение > 0');
        return false;
    }
    
    if (!nodeVersion || nodeVersion === 'N/A') {
        console.log('   ❌ ОШИБКА: Версия Node.js не отображается');
        return false;
    }
    
    console.log('   ✓ Строка отображения корректна');
    
    return true;
}

// Тест с разными данными
console.log('=== Полный UI тест ===\n');

// Тест 1: Корректные данные
console.log('ТЕСТ 1: Корректные данные');
const test1 = {
    results: [
        { name: 'test1', ok: true, memMb: 25.5, timeMs: 72 }
    ],
    summary: {
        passed: 1,
        total: 1,
        totalTime: 72,
        maxTime: 72,
        maxMemoryMb: 25.5,
        nodeVersion: 'v22.2.0',
        status: 'OK'
    }
};

const result1 = testUIDisplay(test1);
console.log(`\nРезультат теста 1: ${result1 ? '✓ ПРОЙДЕН' : '❌ ПРОВАЛЕН'}\n`);

// Тест 2: Данные с 0 памятью (проблема)
console.log('ТЕСТ 2: Данные с 0 памятью (проблемный случай)');
const test2 = {
    results: [
        { name: 'test1', ok: true, memMb: 0, timeMs: 72 }
    ],
    summary: {
        passed: 1,
        total: 1,
        totalTime: 72,
        maxTime: 72,
        maxMemoryMb: 0,
        nodeVersion: 'v22.2.0',
        status: 'OK'
    }
};

const result2 = testUIDisplay(test2);
console.log(`\nРезультат теста 2: ${result2 ? '✓ ПРОЙДЕН' : '❌ ПРОВАЛЕН (ожидаемо)'}\n`);

// Тест 3: Данные без nodeVersion
console.log('ТЕСТ 3: Данные без nodeVersion (проблемный случай)');
const test3 = {
    results: [
        { name: 'test1', ok: true, memMb: 25.5, timeMs: 72 }
    ],
    summary: {
        passed: 1,
        total: 1,
        totalTime: 72,
        maxTime: 72,
        maxMemoryMb: 25.5,
        nodeVersion: undefined,
        status: 'OK'
    }
};

const result3 = testUIDisplay(test3);
console.log(`\nРезультат теста 3: ${result3 ? '✓ ПРОЙДЕН' : '❌ ПРОВАЛЕН (ожидаемо)'}\n`);

// Тест 4: Данные с undefined
console.log('ТЕСТ 4: Данные с undefined значениями');
const test4 = {
    results: [
        { name: 'test1', ok: true, memMb: undefined, timeMs: 72 }
    ],
    summary: {
        passed: 1,
        total: 1,
        totalTime: 72,
        maxTime: 72,
        maxMemoryMb: undefined,
        nodeVersion: 'v22.2.0',
        status: 'OK'
    }
};

const result4 = testUIDisplay(test4);
console.log(`\nРезультат теста 4: ${result4 ? '✓ ПРОЙДЕН' : '❌ ПРОВАЛЕН (ожидаемо)'}\n`);

console.log('=== ИТОГИ ===');
console.log(`Тест 1 (корректные данные): ${result1 ? '✓' : '❌'}`);
console.log(`Тест 2 (0 память): ${result2 ? '✓' : '❌ (ожидаемо)'}`);
console.log(`Тест 3 (нет nodeVersion): ${result3 ? '✓' : '❌ (ожидаемо)'}`);
console.log(`Тест 4 (undefined значения): ${result4 ? '✓' : '❌ (ожидаемо)'}`);

if (result1) {
    console.log('\n✓ Основной тест пройден - UI должен работать корректно');
} else {
    console.log('\n❌ Основной тест провален - есть проблемы с отображением');
}

