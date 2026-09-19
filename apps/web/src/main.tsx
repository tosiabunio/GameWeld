import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { loadLanguage } from './i18n/index.ts';
import './styles.css';

// The language first, then everything that shows text: some of it is looked up as modules load.
await loadLanguage();
const [{ App }, { SessionProvider }] = await Promise.all([
  import('./App.tsx'),
  import('./session.tsx'),
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
