// test-end-to-end.js - End-to-end тест полного цикла
console.log('=== End-to-End тест полного цикла передачи данных ===\n');

// Симуляция данных от сервера
const serverData = {
    type: 'results',
    results: [
        {
            name: 'test',
            ok: true,
            code: 0,
            timeMs: 56.5,
            memMb: 25.3,
            output: '30',
            expected: '30',
            stderr: null
        }
    ],
    summary: {
        passed: 1,
        total: 1,
        totalTime: 56.5,
        maxTime: 56.5,
        maxMemoryMb: 25.3,
        nodeVersion: 'v22.2.0',
        status: 'OK'
    }
};

console.log('1. Данные от сервера:');
console.log(JSON.stringify(serverData, null, 2));

// Симуляция JSON сериализации и передачи
console.log('\n2. JSON сериализация:');
const jsonString = JSON.stringify(serverData);
console.log('Длина JSON:', jsonString.length);
console.log('Первые 200 символов:', jsonString.substring(0, 200));

// Симуляция получения на клиенте
console.log('\n3. Парсинг на клиенте:');
const clientData = JSON.parse(jsonString);
console.log('Тип:', clientData.type);
console.log('hasResults:', !!clientData.results);
console.log('hasSummary:', !!clientData.summary);

if (clientData.summary) {
    console.log('summary.nodeVersion:', clientData.summary.nodeVersion);
    console.log('summary.maxMemoryMb:', clientData.summary.maxMemoryMb);
    console.log('summary.maxTime:', clientData.summary.maxTime);
    console.log('summary.status:', clientData.summary.status);
} else {
    console.log('❌ ОШИБКА: summary отсутствует!');
}

// Симуляция обработки на клиенте
console.log('\n4. Обработка на клиенте:');
if (!clientData.summary) {
    console.log('❌ КРИТИЧЕСКАЯ ОШИБКА: summary отсутствует!');
} else {
    const resultsData = {
        results: clientData.results || [],
        summary: {
            passed: clientData.summary.passed || 0,
            total: clientData.summary.total || 0,
            totalTime: clientData.summary.totalTime || 0,
            maxTime: clientData.summary.maxTime || 0,
            maxMemoryMb: clientData.summary.maxMemoryMb !== undefined && clientData.summary.maxMemoryMb !== null ? clientData.summary.maxMemoryMb : 0,
            nodeVersion: clientData.summary.nodeVersion || 'N/A',
            status: clientData.summary.status || 'UNKNOWN',
        },
    };
    
    console.log('Обработанные данные:', resultsData.summary);
    
    // Симуляция отображения
    const displayString = `A Node.js ${resultsData.summary.nodeVersion} ${resultsData.summary.status} — ${Math.round(resultsData.summary.maxTime || 0)}ms ${(resultsData.summary.maxMemoryMb || 0).toFixed(2)}Mb`;
    console.log('\n5. Отображаемая строка:');
    console.log(`"${displayString}"`);
    
    if (displayString.includes('N/A') || displayString.includes('UNKNOWN') || displayString.includes('0.00Mb')) {
        console.log('\n❌ ПРОБЛЕМА: Строка содержит N/A, UNKNOWN или 0.00Mb!');
        console.log('Причина:');
        if (!resultsData.summary.nodeVersion || resultsData.summary.nodeVersion === 'N/A') {
            console.log('  - nodeVersion отсутствует или равен N/A');
        }
        if (!resultsData.summary.status || resultsData.summary.status === 'UNKNOWN') {
            console.log('  - status отсутствует или равен UNKNOWN');
        }
        if (resultsData.summary.maxMemoryMb === 0) {
            console.log('  - maxMemoryMb равен 0');
        }
    } else {
        console.log('\n✓ Строка отображения корректна!');
    }
}

// Тест с проблемными данными
console.log('\n\n=== Тест с проблемными данными ===\n');

const badServerData1 = {
    type: 'results',
    results: [{name: 'test', ok: true}]
    // summary отсутствует!
};

console.log('Тест 1: Данные без summary');
const badJson1 = JSON.stringify(badServerData1);
const badClientData1 = JSON.parse(badJson1);

if (!badClientData1.summary) {
    console.log('❌ summary отсутствует - ожидаемо');
    console.log('Клиент должен обработать это и показать ошибку');
} else {
    console.log('✓ summary присутствует');
}

const badServerData2 = {
    type: 'results',
    results: [{name: 'test', ok: true}],
    summary: {
        passed: 1,
        total: 1
        // nodeVersion, maxMemoryMb, status отсутствуют!
    }
};

console.log('\nТест 2: summary без обязательных полей');
const badJson2 = JSON.stringify(badServerData2);
const badClientData2 = JSON.parse(badJson2);

if (badClientData2.summary) {
    const processed = {
        nodeVersion: badClientData2.summary.nodeVersion || 'N/A',
        maxMemoryMb: badClientData2.summary.maxMemoryMb !== undefined && badClientData2.summary.maxMemoryMb !== null ? badClientData2.summary.maxMemoryMb : 0,
        status: badClientData2.summary.status || 'UNKNOWN',
    };
    
    console.log('Обработанные данные:', processed);
    const displayString2 = `A Node.js ${processed.nodeVersion} ${processed.status} — 0ms ${processed.maxMemoryMb.toFixed(2)}Mb`;
    console.log('Отображаемая строка:', `"${displayString2}"`);
    
    if (displayString2.includes('N/A') || displayString2.includes('UNKNOWN') || displayString2.includes('0.00Mb')) {
        console.log('⚠️  Строка содержит fallback значения (это ожидаемо для неполных данных)');
    }
}

console.log('\n=== ИТОГИ ===');
console.log('✓ Тесты завершены');
console.log('Проверьте логи в консоли браузера и сервера для диагностики');

