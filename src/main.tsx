import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import './styles.css'
import './vibes/night.css'

if (import.meta.env.DEV) void import('./dev/worstCase').then((m) => m.mountToggle())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider><App /></AuthProvider>
  </React.StrictMode>,
)
