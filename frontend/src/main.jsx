import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Printing rules for every document page — see the file for why. */
import './styles/print.css'
import './lib/apiAuth.js' // installs global JWT interceptors (fetch + axios)
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
