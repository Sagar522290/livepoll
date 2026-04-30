import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import './polyfills'

const sentryDsn = import.meta.env.VITE_SENTRY_DSN

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}

async function bootstrap() {
  const { default: App } = await import('./App.jsx')

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {sentryDsn ? (
        <Sentry.ErrorBoundary
          fallback={<div style={{ padding: '1.5rem' }}>Something went wrong. Reload and try again.</div>}
        >
          <App />
        </Sentry.ErrorBoundary>
      ) : (
        <App />
      )}
    </StrictMode>,
  )
}

bootstrap()
