import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Printing rules for every document page — see the file for why. */
import './styles/print.css'
import './styles/motion.css'
import './lib/apiAuth.js' // installs global JWT interceptors (fetch + axios)
import './lib/reliability.js' // a sleeping server, a stale tab: no more manual refresh
import './lib/inputGuards.js' // number fields take numbers; the wheel does not change them
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
