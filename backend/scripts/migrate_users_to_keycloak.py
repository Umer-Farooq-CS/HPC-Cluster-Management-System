import asyncio
import os
import sys

# Add the backend root to Python path so we can import modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.future import select
from core.database import AsyncSessionLocal
from models.user import User
from core.security import get_keycloak_admin
from keycloak.exceptions import KeycloakError

async def migrate_users():
    print("[*] Starting Legacy User Migration to Keycloak...")
    
    # 1. Fetch local users
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        local_users = result.scalars().all()
        
    if not local_users:
        print("[!] No local users found in database.")
        return

    print(f"[*] Found {len(local_users)} local users. Connecting to Keycloak...")
    
    kc_admin = get_keycloak_admin()
    
    for user in local_users:
        print(f"\n---> Processing user: {user.username} (Role: {user.role})")
        
        try:
            # 2. Check if user already exists in Keycloak
            kc_users = kc_admin.get_users({"username": user.username})
            exists = False
            for ku in kc_users:
                if ku.get("username") == user.username:
                    exists = True
                    break
                    
            if exists:
                print(f"    [OK] User '{user.username}' already exists in Keycloak. Skipping creation.")
                kc_users = kc_admin.get_users({"username": user.username})
                new_kc_user_id = kc_users[0]["id"]
            else:
                # 3. Create user in Keycloak
                print(f"    [+] Creating user '{user.username}' in Keycloak `hpc` realm...")
                new_kc_user_id = kc_admin.create_user({
                    "email": f"{user.username}@hpc.local",
                    "username": user.username,
                    "enabled": True,
                    "firstName": user.username,
                    "lastName": "Migrated User"
                })
                
                # 4. Set temporary password (same as username)
                print(f"    [+] Setting initial password for '{user.username}'...")
                kc_admin.set_user_password(user_id=new_kc_user_id, password=user.username, temporary=False)
            
            # 5. Assign Realm Role
            try:
                mapped_role = user.role.replace(" ", "_").lower()
                print(f"    [+] Ensuring realm role '{mapped_role}' exists...")
                try:
                    role_repr = kc_admin.get_realm_role(role_name=mapped_role)
                except KeycloakError:
                    print(f"        [-] Role '{mapped_role}' not found. Creating it dynamically...")
                    kc_admin.create_realm_role({"name": mapped_role})
                    role_repr = kc_admin.get_realm_role(role_name=mapped_role)
                
                print(f"    [+] Assigning realm role '{mapped_role}'...")
                kc_admin.assign_realm_roles(user_id=new_kc_user_id, roles=[role_repr])
                print(f"    [SUCCESS] User '{user.username}' completely migrated!")
            except KeycloakError as e:
                print(f"    [ERROR] Failed to assign role '{user.role}'. Make sure this role exists in Keycloak! Error: {e}")
                
        except KeycloakError as e:
            error_msg = getattr(e, 'error_message', str(e))
            if hasattr(e, 'response_body'):
                error_msg = e.response_body.decode('utf-8') if isinstance(e.response_body, bytes) else str(e.response_body)
            print(f"    [ERROR] Keycloak API Error: {error_msg}")
        except Exception as e:
            print(f"    [ERROR] Unexpected error migrating {user.username}: {str(e)}")

    print("\n[*] Migration process completed!")

if __name__ == "__main__":
    asyncio.run(migrate_users())
