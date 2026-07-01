import { createContext, useContext, ReactNode } from 'react';
// import { useKeycloak } from '@react-keycloak/web';

interface AuthContextType {
  token: string | null;
  role: string | null;
  username: string | null;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Temporary bypass for Keycloak since it gets installed on Master Node later
  const token = "dummy-token";
  const isAuthenticated = true;
  const username = "admin";
  const role = "super_admin";

  const logout = () => {
    console.log("Mock logout");
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
