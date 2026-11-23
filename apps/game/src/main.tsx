import '@fontsource-variable/manrope';
import '@fontsource-variable/fraunces';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { connectHost } from './domothib/host.ts';
import { DOMOTHIB_BUILD } from './domothib/mode.ts';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// In DomoThib Games, the bridge answers before the game reads its slots; the styles leave room
// for DomoThib's handle (styles.css).
if (DOMOTHIB_BUILD) document.documentElement.classList.add('domothib');
const domothib = DOMOTHIB_BUILD ? await connectHost() : null;

createRoot(root).render(
  <StrictMode>
    <App domothib={domothib} />
  </StrictMode>,
);
