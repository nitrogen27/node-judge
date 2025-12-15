import React from 'react';
import ReactDOM from 'react-dom/client';
import loader from '@monaco-editor/loader';
import './index.css';
import App from './App';

// Настройка Monaco Editor для работы без CDN (используем локальные файлы из public/monaco-editor)
const monacoBasePath = `${process.env.PUBLIC_URL || ''}/monaco-editor/min/vs`;

loader.config({
  paths: {
    vs: monacoBasePath
  }
});

// Настройка MonacoEnvironment для загрузки worker'ов из локальных файлов
// (дополнительная настройка, если не установлен в index.html)
if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
      const baseUrl = monacoBasePath;
      if (label === 'json') {
        return `${baseUrl}/language/json/json.worker.js`;
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return `${baseUrl}/language/css/css.worker.js`;
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return `${baseUrl}/language/html/html.worker.js`;
      }
      if (label === 'typescript' || label === 'javascript') {
        return `${baseUrl}/language/typescript/ts.worker.js`;
      }
      return `${baseUrl}/editor/editor.worker.js`;
    }
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

