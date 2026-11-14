import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { store } from './state/store';
import './styles/tokens.css';
import './styles/app.css';

// Apply the saved theme before the first paint.
document.documentElement.dataset.theme = store.get().theme;

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
