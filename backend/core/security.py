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
        _keycloak_admin.realm_name = KEYCLOAK_REALM
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
    try:
        public_key = "-----BEGIN PUBLIC KEY-----\n" + keycloak_openid.public_key() + "\n-----END PUBLIC KEY-----"
        options = {"verify_signature": True, "verify_aud": False, "verify_exp": True}
        jwt.decode(token, public_key, algorithms=["RS256"], options=options)
    except Exception as e:
        raise ValueError(f"Invalid token: {e}")
