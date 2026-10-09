import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <App />
    {/* Cookie-free visitor counts (Vercel Web Analytics) */}
    <Analytics />
  </>
)
