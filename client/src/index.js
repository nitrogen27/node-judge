import React from 'react';
import ReactDOM from 'react-dom/client';
import loader from '@monaco-editor/loader';
import './index.css';
import App from './App';

// Настройка Monaco Editor для работы с react-scripts
// Используем CDN для надежной загрузки (совместимо с версией 0.54.0 из package.json)
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs'
  }
});

// Настройка MonacoEnvironment для загрузки worker'ов
// (дополнительная настройка, если не установлен в index.html)
if (typeof window !== 'undefined' && !window.MonacoEnvironment) {
  window.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
      const baseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs';
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

