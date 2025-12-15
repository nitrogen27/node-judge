const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../node_modules/monaco-editor/min');
const destRoot = path.resolve(__dirname, '../public/monaco-editor');
const destDir = path.join(destRoot, 'min');

function copyMonaco() {
  if (!fs.existsSync(srcDir)) {
    console.error('[copy-monaco] monaco-editor не найден. Установите зависимости: npm install');
    process.exit(1);
  }

  // Очищаем предыдущую копию
  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  // Копируем всю папку min (включая vs/* и worker'ы)
  fs.cpSync(srcDir, destDir, { recursive: true });

  console.log('[copy-monaco] Monaco Editor скопирован в public/monaco-editor');
}

copyMonaco();

