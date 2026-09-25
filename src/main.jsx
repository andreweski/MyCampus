import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { init } from './store.js';
import './styles.css';

init().finally(() => {
  createRoot(document.getElementById('root')).render(<App />);
});
