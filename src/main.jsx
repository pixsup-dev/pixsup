import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from '@/App.jsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { installErrorReporter } from '@/lib/errorReporter'
import { registerServiceWorker } from '@/lib/pwa'
import '@/index.css'

// Crashes are reported to the Admin page and the hourly error email
installErrorReporter()
// Home-screen app support and push notifications
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    {/* Cookie-free visitor counts (Vercel Web Analytics) */}
    <Analytics />
  </>
)
