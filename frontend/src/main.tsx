import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

import { ReactKeycloakProvider } from '@react-keycloak/web'
import keycloak from './keycloak'

keycloak.init({ onLoad: 'login-required', checkLoginIframe: false }).then((authenticated) => {
  if (!authenticated) {
    window.location.reload();
  } else {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ReactKeycloakProvider authClient={keycloak}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ReactKeycloakProvider>
      </React.StrictMode>,
    )
  }
}).catch((err) => {
  console.error("Failed to initialize Keycloak", err)
  // Render anyway to show error or fallback
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <div style={{ padding: '2rem', color: 'red' }}>
      <h1>Authentication Error</h1>
      <p>Failed to connect to Keycloak. Make sure Docker containers are running on {window.location.hostname}:8080.</p>
      <pre style={{ background: '#222', padding: '1rem', color: '#fff' }}>
        {String(err) || JSON.stringify(err)}
      </pre>
    </div>
  )
})
