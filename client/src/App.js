import React, { useState, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import './App.css';

const DEFAULT_CODE = `// solution.js
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

function solve() {
    // Ваш код здесь
    // Читаем значения из входных данных (stdin)
    const a = readNumber();  // Первая строка входных данных
    const b = readNumber();  // Вторая строка входных данных
    
    // Выводим результат - это будет сравниваться с полем "Ожидаемый вывод"
    console.log(a + b);  // Например: 5 + 10 = 15
}
`;

const DEFAULT_INPUT = `5
10`;

const DEFAULT_EXPECTED = `15`;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [expected, setExpected] = useState(DEFAULT_EXPECTED);
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, running, error
  const [statusMessage, setStatusMessage] = useState('');
  const [editorError, setEditorError] = useState(null);
  const [editorLoaded, setEditorLoaded] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 2000; // 2 секунды базовая задержка
  const editorLoadTimeoutRef = useRef(null);

  // Проверка загрузки редактора с таймаутом
  useEffect(() => {
    // Устанавливаем таймаут для проверки загрузки редактора (10 секунд)
    editorLoadTimeoutRef.current = setTimeout(() => {
      if (!editorLoaded) {
        console.error('[Editor] Таймаут загрузки Monaco Editor');
        setEditorError('Редактор не загрузился в течение 10 секунд. Возможные причины: проблемы с сетью или блокировка CDN. Попробуйте перезагрузить страницу.');
      }
    }, 10000);

    return () => {
      if (editorLoadTimeoutRef.current) {
        clearTimeout(editorLoadTimeoutRef.current);
      }
    };
  }, [editorLoaded]);

  useEffect(() => {
    // Функция для переподключения
    const handleReconnect = () => {
      // Если уже есть таймаут переподключения, не создаем новый
      if (reconnectTimeoutRef.current) {
        return;
      }
      
      reconnectAttemptsRef.current++;
      
      if (reconnectAttemptsRef.current > maxReconnectAttempts) {
        console.error('[Client] Достигнуто максимальное количество попыток переподключения');
        setStatus('error');
        setStatusMessage(`Не удалось подключиться после ${maxReconnectAttempts} попыток. Убедитесь, что сервер запущен: npm run server или npm start`);
        return;
      }
      
      // Улучшенная логика задержки: экспоненциальная, но с ограничением максимума
      // 1-я попытка: 2 сек, 2-я: 4 сек, 3-я: 6 сек, 4-я: 8 сек, 5-я: 10 сек
      const delay = Math.min(reconnectDelay * reconnectAttemptsRef.current, 10000); // Максимум 10 секунд
      console.log(`[Client] Переподключение через ${delay / 1000} секунд (попытка ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
      setStatusMessage(`Переподключение через ${Math.round(delay / 1000)} сек... (попытка ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, delay);
    };
    
    // Функция подключения к WebSocket
    const connectWebSocket = () => {
      // Очищаем предыдущий таймаут переподключения
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Если уже подключены, не делаем ничего
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('[Client] WebSocket уже подключен');
        return wsRef.current;
      }
      
      // Определяем адрес сервера
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsHost = process.env.REACT_APP_WS_HOST || 'localhost:3001';
      
      // Убираем лишние слеши и пробелы
      wsHost = wsHost.trim().replace(/\/+$/, ''); // Убираем завершающие слеши
      if (wsHost.startsWith('/')) {
        wsHost = wsHost.substring(1);
      }
      
      // Убираем протокол если он есть
      wsHost = wsHost.replace(/^(ws|wss):\/\//, '');
      
      const wsUrl = `${wsProtocol}//${wsHost}`;
      
      console.log(`[Client] Подключение к WebSocket: ${wsUrl} (попытка ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
      console.log(`[Client] Очищенный хост: "${wsHost}"`);
      
      // Добавляем подсказку при повторных попытках
      if (reconnectAttemptsRef.current > 0) {
        console.log(`[Client] Подсказка: Убедитесь, что сервер запущен на порту 3001: npm run server`);
      }
      
      try {
        const ws = new WebSocket(wsUrl);
        
        // Устанавливаем таймаут для подключения (5 секунд)
        const connectionTimeout = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            console.error('[Client] Таймаут подключения WebSocket (5 секунд)');
            ws.close();
            handleReconnect();
          }
        }, 5000);
        
        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('[Client] WebSocket connected успешно');
          // Сбрасываем счетчик попыток при успешном подключении
          reconnectAttemptsRef.current = 0;
          setStatus('idle');
          setStatusMessage('');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          console.log('[Client] Получено сообщение:', data.type);
          
          if (data.type === 'status') {
            setStatus('running');
            setStatusMessage(data.message);
          } else if (data.type === 'results') {
            console.log('[Client] ===== ПОЛУЧЕНЫ ДАННЫЕ =====');
            console.log('[Client] Полные raw данные:', JSON.stringify(data, null, 2));
            console.log('[Client] Тип данных:', typeof data);
            console.log('[Client] Ключи объекта:', Object.keys(data));
            console.log('[Client] hasResults:', !!data.results);
            console.log('[Client] hasSummary:', !!data.summary);
            
            if (data.summary) {
              console.log('[Client] Ключи summary:', Object.keys(data.summary));
              console.log('[Client] summary содержимое:', JSON.stringify(data.summary, null, 2));
            } else {
              console.error('[Client] КРИТИЧЕСКАЯ ОШИБКА: summary отсутствует!');
            }
            
            console.log('[Client] Результаты получены:', {
              hasResults: !!data.results,
              hasSummary: !!data.summary,
              maxMemoryMb: data.summary?.maxMemoryMb,
              maxTime: data.summary?.maxTime,
              status: data.summary?.status,
              nodeVersion: data.summary?.nodeVersion,
              passed: data.summary?.passed,
              total: data.summary?.total
            });
            
            // Проверка данных перед установкой состояния
            if (!data.summary) {
              console.error('[Client] КРИТИЧЕСКАЯ ОШИБКА: summary отсутствует!');
              console.error('[Client] Структура данных:', Object.keys(data));
              setStatus('error');
              setStatusMessage('Ошибка: данные результатов некорректны');
              setResults(null);
              return;
            }
            
            // Проверка критических полей
            console.log('[Client] Проверка полей summary:');
            console.log('  maxMemoryMb:', data.summary.maxMemoryMb, '(тип:', typeof data.summary.maxMemoryMb, ')');
            console.log('  nodeVersion:', data.summary.nodeVersion, '(тип:', typeof data.summary.nodeVersion, ')');
            console.log('  status:', data.summary.status, '(тип:', typeof data.summary.status, ')');
            console.log('  maxTime:', data.summary.maxTime, '(тип:', typeof data.summary.maxTime, ')');
            
            if (data.summary.maxMemoryMb === undefined || data.summary.maxMemoryMb === null) {
              console.error('[Client] ОШИБКА: maxMemoryMb отсутствует!');
            }
            if (!data.summary.nodeVersion) {
              console.error('[Client] ОШИБКА: nodeVersion отсутствует!');
            }
            if (!data.summary.status) {
              console.error('[Client] ОШИБКА: status отсутствует!');
            }
            
            setStatus('idle');
            
            // Создаем объект результатов
            const resultsData = {
              results: data.results || [],
              summary: {
                passed: data.summary.passed !== undefined ? data.summary.passed : 0,
                total: data.summary.total !== undefined ? data.summary.total : 0,
                totalTime: data.summary.totalTime !== undefined ? data.summary.totalTime : 0,
                maxTime: data.summary.maxTime !== undefined ? data.summary.maxTime : 0,
                maxMemoryMb: (data.summary.maxMemoryMb !== undefined && data.summary.maxMemoryMb !== null) 
                    ? data.summary.maxMemoryMb 
                    : 0,
                nodeVersion: data.summary.nodeVersion || 'N/A',
                status: data.summary.status || 'FAILED',
              },
            };
            
            // КРИТИЧЕСКАЯ ПРОВЕРКА: Если поля были потеряны, пытаемся восстановить
            if (resultsData.summary.nodeVersion === 'N/A' && data.summary?.nodeVersion) {
              console.error('[Client] Восстановление nodeVersion из исходных данных');
              resultsData.summary.nodeVersion = data.summary.nodeVersion;
            }
            if (resultsData.summary.status === 'FAILED' && data.summary?.status && data.summary.status !== 'FAILED') {
              console.error('[Client] Восстановление status из исходных данных');
              resultsData.summary.status = data.summary.status;
            }
            if (resultsData.summary.maxMemoryMb === 0 && data.summary?.maxMemoryMb && data.summary.maxMemoryMb > 0) {
              console.error('[Client] Восстановление maxMemoryMb из исходных данных');
              resultsData.summary.maxMemoryMb = data.summary.maxMemoryMb;
            }
            
            console.log('[Client] Устанавливаем результаты:', {
              maxMemoryMb: resultsData.summary.maxMemoryMb,
              nodeVersion: resultsData.summary.nodeVersion,
              status: resultsData.summary.status
            });
            
            setResults(resultsData);
            setStatusMessage('');
            
            // Дополнительная проверка
            if (resultsData.summary.maxMemoryMb === 0 && data.summary.maxMemoryMb > 0) {
              console.warn('[Client] ПРЕДУПРЕЖДЕНИЕ: maxMemoryMb был заменен на 0');
            } else if (resultsData.summary.maxMemoryMb > 0) {
              console.log(`[Client] ✓ Память корректна: ${resultsData.summary.maxMemoryMb} MB`);
            }
          } else if (data.type === 'error') {
            setStatus('error');
            setStatusMessage(data.message);
            setResults(null);
          }
        };

        ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('[Client] WebSocket error:', error);
          console.error('[Client] WebSocket readyState:', ws.readyState);
          console.error('[Client] WebSocket URL:', ws.url);
          console.error('[Client] Error event type:', error.type);
          
          // Определяем причину ошибки
          let errorMessage = 'Ошибка WebSocket соединения';
          
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            if (ws.readyState === WebSocket.CLOSED) {
              errorMessage = 'Соединение закрыто. Сервер может быть недоступен.';
              console.error('[Client] WebSocket уже закрыт - возможно, сервер не запущен или недоступен');
            } else {
              errorMessage = 'Соединение закрывается...';
              console.error('[Client] WebSocket закрывается');
            }
          } else if (error.target && error.target.readyState === WebSocket.CONNECTING) {
            errorMessage = `Не удалось подключиться к серверу (попытка ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`;
            console.error('[Client] WebSocket не смог подключиться - проверьте, что сервер запущен на ws://localhost:3001');
          }
          
          setStatusMessage(errorMessage);
          setStatus('error');
          
          // Ошибка при подключении - попробуем переподключиться
          // onclose также вызовется, но для надежности вызываем handleReconnect здесь
          // Но только если это не нормальное закрытие
          if (ws.readyState !== WebSocket.CLOSED || reconnectAttemptsRef.current < maxReconnectAttempts) {
            // handleReconnect будет вызван в onclose
          }
        };

        ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('[Client] WebSocket disconnected');
          console.log('[Client] Close event:', {
            code: event.code,
            reason: event.reason || 'нет причины',
            wasClean: event.wasClean
          });
          
          // Очищаем ссылку на WebSocket
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          
          // Коды ошибок WebSocket:
          // 1000 - нормальное закрытие
          // 1001 - ушел с сервера
          // 1002 - ошибка протокола
          // 1003 - неподдерживаемый тип данных
          // 1006 - аномальное закрытие (нет close frame)
          // 1007 - невалидные данные
          // 1008 - нарушение политики
          // 1009 - слишком большое сообщение
          // 1010 - ошибка расширения
          // 1011 - неожиданная ошибка сервера
          
          // Если соединение закрыто неожиданно или с ошибкой, пытаемся переподключиться
          if (event.code === 1000) {
            // Нормальное закрытие - не переподключаемся
            console.log('[Client] Соединение закрыто нормально');
            setStatus('error');
            setStatusMessage('Соединение закрыто');
          } else if (event.code === 1006) {
            // Аномальное закрытие - обычно означает, что сервер недоступен
            console.error('[Client] Аномальное закрытие соединения (код 1006) - возможно, сервер недоступен');
            handleReconnect();
          } else if (!event.wasClean || event.code !== 1000) {
            // Любое другое неожиданное закрытие
            console.log('[Client] Неожиданное закрытие соединения, переподключение...');
            handleReconnect();
          } else {
            // Другие случаи закрытия
            handleReconnect();
          }
        };
        
        return ws;
      } catch (err) {
        console.error('[Client] Ошибка создания WebSocket:', err);
        setStatus('error');
        setStatusMessage('Ошибка создания WebSocket соединения');
        handleReconnect();
        return null;
      }
    };
    
    // Подключаемся
    const ws = connectWebSocket();
    if (ws) {
      wsRef.current = ws;
    }

    return () => {
      // Очищаем таймаут переподключения
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Закрываем WebSocket соединение
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, []);

  const handleSubmit = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatus('error');
      setStatusMessage('Нет подключения к серверу');
      return;
    }

    setStatus('running');
    setStatusMessage('Отправка решения...');
    setResults(null);

    wsRef.current.send(JSON.stringify({
      type: 'submit',
      code: code,
      input: input,
      expected: expected,
    }));
  };

  const getStatusClass = () => {
    if (status === 'running') return 'status-running';
    if (status === 'error') return 'status-error';
    return 'status-idle';
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Online Judge</h1>
        <p>Проверка решений задач на Node.js</p>
      </header>

      <div className="app-container">
        <div className="editor-section">
          <div className="editor-header">
            <h2>Решение</h2>
            <button 
              className="submit-btn" 
              onClick={handleSubmit}
              disabled={status === 'running'}
            >
              {status === 'running' ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
          
          <div className="editor-wrapper">
            {editorError ? (
              <div style={{ 
                color: '#ff6b6b', 
                padding: '20px', 
                textAlign: 'center',
                backgroundColor: '#2d2d2d',
                borderRadius: '4px'
              }}>
                <h3>Ошибка загрузки редактора</h3>
                <p>{editorError}</p>
                <button 
                  onClick={() => {
                    setEditorError(null);
                    window.location.reload();
                  }}
                  style={{
                    marginTop: '10px',
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Перезагрузить страницу
                </button>
              </div>
            ) : (
              <Editor
                height="400px"
                defaultLanguage="javascript"
                value={code}
                onChange={(value) => setCode(value || '')}
                theme="vs-dark"
                loading={<div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>Загрузка редактора...</div>}
                onMount={(editor, monaco) => {
                  console.log('Monaco Editor загружен успешно');
                  setEditorLoaded(true);
                  setEditorError(null);
                  if (editorLoadTimeoutRef.current) {
                    clearTimeout(editorLoadTimeoutRef.current);
                  }
                }}
                beforeMount={(monaco) => {
                  console.log('Monaco Editor инициализация...');
                }}
                onValidate={(markers) => {
                  // Валидация кода
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            )}
          </div>

          <div className="test-data-section">
            <div className="test-data-block">
              <h3>Входные данные (построчно)</h3>
              <Editor
                height="150px"
                defaultLanguage="plaintext"
                value={input}
                onChange={(value) => setInput(value || '')}
                theme="vs-dark"
                loading={<div style={{ color: '#fff', padding: '10px' }}>Загрузка...</div>}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                }}
              />
            </div>

            <div className="test-data-block">
              <h3>Ожидаемый вывод</h3>
              <Editor
                height="150px"
                defaultLanguage="plaintext"
                value={expected}
                onChange={(value) => setExpected(value || '')}
                theme="vs-dark"
                loading={<div style={{ color: '#fff', padding: '10px' }}>Загрузка...</div>}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                }}
              />
            </div>
          </div>

          {statusMessage && (
            <div className={`status-message ${getStatusClass()}`}>
              {statusMessage}
            </div>
          )}
        </div>

        <div className="results-section">
          <h2>Результаты тестирования</h2>
          
          {!results && status === 'idle' && (
            <div className="no-results">
              <p>Отправьте решение для проверки</p>
            </div>
          )}

          {status === 'running' && (
            <div className="running-status">
              <p>Выполнение тестов...</p>
            </div>
          )}

          {results && (
            <div className="results-container">
              <div className="judge-result">
                <span className={`judge-status ${results.summary.status === 'OK' ? 'judge-ok' : 'judge-failed'}`}>
                  {results.summary.status === 'OK' ? '✓' : '✗'}
                </span>
                <span className="judge-summary">
                  A Node.js {results.summary.nodeVersion || 'N/A'} {results.summary.status || 'UNKNOWN'} — {Math.round(results.summary.maxTime || 0)}ms {(results.summary.maxMemoryMb || 0).toFixed(2)}Mb
                </span>
              </div>

              <div className="test-results">
                {results.results.map((test, index) => (
                  <div key={index} className={`test-item ${test.ok ? 'test-passed' : 'test-failed'}`}>
                    <div className="test-header">
                      <span className="test-name">{test.name}</span>
                      <span className={`test-status ${test.ok ? 'test-ok' : 'test-fail'}`}>
                        {test.ok ? '✓' : '✗'}
                      </span>
                    </div>
                    
                    {!test.ok && (
                      <div className="test-details">
                        {test.error && (
                          <div className="test-error">
                            <strong>Ошибка:</strong> <code>{test.error}</code>
                          </div>
                        )}
                        {test.expected && (
                          <div className="test-expected">
                            <strong>Ожидалось:</strong> <code>{test.expected}</code>
                          </div>
                        )}
                        {test.output && (
                          <div className="test-output">
                            <strong>Получено:</strong> <code>{test.output}</code>
                          </div>
                        )}
                        {test.stderr && (
                          <div className="test-stderr">
                            <strong>Stderr:</strong> <code>{test.stderr}</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
