import { createContext, useContext, ReactNode } from 'react';
import { useKeycloak } from '@react-keycloak/web';

interface AuthContextType {
  token: string | null;
  role: string | null;
  username: string | null;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { keycloak, initialized } = useKeycloak();

  if (!initialized) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', color: 'white', fontFamily: 'Inter' }}><h2>Loading Authentication...</h2></div>;
  }

  const token = keycloak.token || null;
  const isAuthenticated = !!keycloak.authenticated;
  
  // Extract preferred_username from token claims
  const username = (keycloak.tokenParsed as any)?.preferred_username || null;
  
  // Extract role (map Keycloak realm_access.roles to our internal roles)
  let role = null;
  const roles = (keycloak.tokenParsed as any)?.realm_access?.roles || [];
  if (roles.includes('super_admin')) {
    role = 'super_admin';
  } else if (roles.includes('admin')) {
    role = 'admin';
  } else if (roles.includes('normal_user')) {
    role = 'normal_user';
  }

  const logout = () => {
    keycloak.logout();
  };

  return (
    <AuthContext.Provider value={{ token, role, username, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
