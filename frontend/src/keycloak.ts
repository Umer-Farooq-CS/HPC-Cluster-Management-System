import Keycloak from 'keycloak-js'

// Setup Keycloak instance
const keycloak = new Keycloak({
  url: `https://${window.location.hostname}`,
  realm: 'hpc',
  clientId: 'hpc-frontend'
})

export default keycloak
