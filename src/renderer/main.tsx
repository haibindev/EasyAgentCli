import React from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from './i18n-context'
import App from './App'
import './App.css'

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
)
