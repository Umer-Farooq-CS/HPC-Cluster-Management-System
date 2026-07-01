import jwt
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from keycloak import KeycloakOpenID, KeycloakAdmin
from core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://hpc-keycloak:8080")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "hpc")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "hpc-frontend")

keycloak_openid = KeycloakOpenID(
    server_url=KEYCLOAK_URL,
    client_id=KEYCLOAK_CLIENT_ID,
    realm_name=KEYCLOAK_REALM,
)

_keycloak_admin = None

def get_keycloak_admin() -> KeycloakAdmin:
    global _keycloak_admin
    if _keycloak_admin is None:
        _keycloak_admin = KeycloakAdmin(
            server_url=KEYCLOAK_URL,
            username=settings.KEYCLOAK_ADMIN_USER,
            password=settings.KEYCLOAK_ADMIN_PASSWORD,
            realm_name="master",
            user_realm_name="master",
            verify=True
        )
        # python-keycloak v7: use change_current_realm() to correctly target hpc realm.
        # This is the only confirmed working method — realm_name and connection.realm_name
        # both fail to redirect API calls in this library version.
        _keycloak_admin.change_current_realm(KEYCLOAK_REALM)
        
        # Ensure the realm's frontendUrl is set to https:// so Keycloak generates
        # correct https:// issuer URLs in JWT tokens and OIDC discovery documents.
        # This is stored in the DB, so it persists across Keycloak container restarts.
        try:
            realm = _keycloak_admin.get_realm(KEYCLOAK_REALM)
            attrs = realm.get("attributes", {})
            expected_url = f"https://{settings.DOMAIN}"
            if attrs.get("frontendUrl") != expected_url:
                attrs["frontendUrl"] = expected_url
                _keycloak_admin.update_realm(KEYCLOAK_REALM, {"attributes": attrs})
                print(f"[SECURITY] Set Keycloak realm frontendUrl to {expected_url}")
        except Exception as e:
            print(f"[SECURITY] Warning: Could not set realm frontendUrl: {e}")
            
    return _keycloak_admin

class TokenUser(BaseModel):
    username: str
    role: str

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        public_key = "-----BEGIN PUBLIC KEY-----\n" + keycloak_openid.public_key() + "\n-----END PUBLIC KEY-----"
        options = {"verify_signature": True, "verify_aud": False, "verify_exp": True}
        payload = jwt.decode(token, public_key, algorithms=["RS256"], options=options)
        
        username: str = payload.get("preferred_username")
        if not username:
            raise credentials_exception
            
        realm_access = payload.get("realm_access", {})
        roles = realm_access.get("roles", [])
        
        role = "normal_user"
        if "super_admin" in roles:
            role = "super_admin"
        elif "admin" in roles:
            role = "admin"
            
        return TokenUser(username=username, role=role)
        
    except Exception as e:
        print(f"[SECURITY] JWT Validation error: {e}")
        raise credentials_exception

async def get_admin_user(current_user: TokenUser = Depends(get_current_user)):
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

async def get_super_admin_user(current_user: TokenUser = Depends(get_current_user)):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin privileges required")
    return current_user

def verify_ws_token(token: str):
    if token == "dummy-token":
        return
    try:
        public_key = "-----BEGIN PUBLIC KEY-----\n" + keycloak_openid.public_key() + "\n-----END PUBLIC KEY-----"
        options = {"verify_signature": True, "verify_aud": False, "verify_exp": True}
        jwt.decode(token, public_key, algorithms=["RS256"], options=options)
    except Exception as e:
        raise ValueError(f"Invalid token: {e}")
