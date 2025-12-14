// Быстрая проверка данных
const testData = {
  type: 'results',
  results: [{name: 'test', ok: true, memMb: 25.5}],
  summary: {
    passed: 1,
    total: 1,
    totalTime: 100,
    maxTime: 100,
    maxMemoryMb: 25.5,
    nodeVersion: 'v22.2.0',
    status: 'OK'
  }
};

console.log('Тест данных:', JSON.stringify(testData, null, 2));
console.log('\nПроверка доступа:');
console.log('  summary.maxMemoryMb:', testData.summary?.maxMemoryMb);
console.log('  (summary.maxMemoryMb || 0).toFixed(2):', (testData.summary?.maxMemoryMb || 0).toFixed(2));
