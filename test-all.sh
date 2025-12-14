#!/bin/bash
# Скрипт для запуска всех тестов с автоматическим управлением сервером

set -e

echo "=== Запуск всех тестов ==="
echo ""

# Останавливаем сервер если он запущен
echo "[1/4] Остановка старого сервера (если запущен)..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
sleep 1

# Запускаем тесты IO (не требуют сервер)
echo ""
echo "[2/4] Запуск тестов ввода-вывода..."
npm run test:io

# Запускаем сервер в фоне
echo ""
echo "[3/4] Запуск сервера..."
node server.js > /tmp/server-test.log 2>&1 &
SERVER_PID=$!
echo "Сервер запущен, PID: $SERVER_PID"

# Ждем запуска сервера
sleep 3

# Проверяем, что сервер запустился
if ! curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "Ошибка: сервер не запустился"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

# Запускаем health check тесты
echo ""
echo "[4/4] Запуск health check тестов..."
npm run test:health

# Запускаем E2E тесты
echo ""
echo "[5/5] Запуск E2E тестов..."
npm run test:e2e

# Останавливаем сервер
echo ""
echo "Остановка сервера..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "=== Все тесты завершены ==="



