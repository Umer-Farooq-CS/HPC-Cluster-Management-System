from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from keycloak import KeycloakOpenID
from core.config import settings

security = HTTPBearer(auto_error=False)

# Configure Keycloak OpenID client
# During local development (no docker), this might fail to connect.
# We wrap it in a try-except to allow graceful degradation if Keycloak is down during dev.
try:
    keycloak_openid = KeycloakOpenID(
        server_url="http://hpc-keycloak:8080/",
        client_id="hpc-backend",
        realm_name="hpc",
        client_secret_key="secret"
    )
except Exception as e:
    keycloak_openid = None

def validate_token_raw(token: str):
    if not keycloak_openid:
        # For offline dev testing without Docker:
        return {"user": "offline_dev", "roles": ["admin"]}
        
    try:
        # Verify signature and expiration using JWKS
        import json
        from jwcrypto import jwk
        KEYCLOAK_CERTS = keycloak_openid.certs()
        jwk_set = jwk.JWKSet.from_json(json.dumps(KEYCLOAK_CERTS))
        token_info = keycloak_openid.decode_token(token, key=jwk_set)
        
        # Check RBAC (Role Based Access Control)
        realm_access = token_info.get("realm_access", {})
        roles = realm_access.get("roles", [])
        
        if "admin" not in roles:
            raise Exception("You do not have the required 'admin' role to manage the HPC cluster.")
            
        return token_info
    except Exception as e:
        raise Exception(f"Invalid authentication credentials: {str(e)}")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Validates the JWT token against Keycloak for standard HTTP routes.
    """
    if not credentials:
        print("Auth Error: NO CREDENTIALS RECEIVED (Missing Authorization Header)", flush=True)
        raise HTTPException(status_code=401, detail="Missing Authorization Header")
        
    token = credentials.credentials
    try:
        return validate_token_raw(token)
    except Exception as e:
        print(f"Auth Error: {e}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
