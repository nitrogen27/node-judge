// Тест обработки данных на клиенте
const testData1 = {
  type: 'results',
  results: [{name: 'test', ok: true}],
  summary: {
    passed: 1,
    total: 1,
    totalTime: 56,
    maxTime: 56,
    maxMemoryMb: 25.5,
    nodeVersion: 'v22.2.0',
    status: 'OK'
  }
};

const testData2 = {
  type: 'results',
  results: [{name: 'test', ok: true}]
  // summary отсутствует!
};

console.log('Тест 1: Корректные данные');
console.log('summary:', testData1.summary);
console.log('nodeVersion:', testData1.summary?.nodeVersion);
console.log('maxMemoryMb:', testData1.summary?.maxMemoryMb);

console.log('\nТест 2: Данные без summary');
console.log('summary:', testData2.summary);
console.log('nodeVersion:', testData2.summary?.nodeVersion);
console.log('maxMemoryMb:', testData2.summary?.maxMemoryMb);

// Симуляция обработки
function processResults(data) {
  if (!data.summary) {
    console.log('\n❌ ОШИБКА: summary отсутствует!');
    return null;
  }
  
  const resultsData = {
    results: data.results || [],
    summary: {
      passed: data.summary.passed || 0,
      total: data.summary.total || 0,
      totalTime: data.summary.totalTime || 0,
      maxTime: data.summary.maxTime || 0,
      maxMemoryMb: data.summary.maxMemoryMb !== undefined && data.summary.maxMemoryMb !== null ? data.summary.maxMemoryMb : 0,
      nodeVersion: data.summary.nodeVersion || 'N/A',
      status: data.summary.status || 'UNKNOWN',
    },
  };
  
  return resultsData;
}

console.log('\nОбработка теста 1:');
const processed1 = processResults(testData1);
console.log('Результат:', processed1?.summary);

console.log('\nОбработка теста 2:');
const processed2 = processResults(testData2);
console.log('Результат:', processed2);
