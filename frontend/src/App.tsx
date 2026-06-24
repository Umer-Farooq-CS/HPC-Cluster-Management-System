import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import HomePage from './pages/HomePage/HomePage'
import MasterSetupPage from './pages/MasterSetupPage/MasterSetupPage'
import SlaveSetupPage from './pages/SlaveSetupPage/SlaveSetupPage'
import DashboardPage from './pages/DashboardPage/DashboardPage'
import AnsibleRunnerPage from './pages/AnsibleRunnerPage/AnsibleRunnerPage'
import LoginPage from './pages/LoginPage/LoginPage'
import UsersPage from './pages/UsersPage/UsersPage'
import NotFoundPage from './pages/NotFoundPage'
import { AuthProvider, useAuth } from './context/AuthContext'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, role } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<HomePage />} />
          <Route path="provision/master" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><MasterSetupPage /></ProtectedRoute>} />
          <Route path="provision/slave" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><SlaveSetupPage /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><UsersPage /></ProtectedRoute>} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="ansible" element={<AnsibleRunnerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
