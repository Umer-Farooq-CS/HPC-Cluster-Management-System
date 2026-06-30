import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import HomePage from './pages/HomePage/HomePage'
import MasterSetupPage from './pages/MasterSetupPage/MasterSetupPage'
import SlaveSetupPage from './pages/SlaveSetupPage/SlaveSetupPage'
import DashboardPage from './pages/DashboardPage/DashboardPage'
import AnsibleRunnerPage from './pages/AnsibleRunnerPage/AnsibleRunnerPage'
import UsersPage from './pages/UsersPage/UsersPage'
import EnvStacksPage from './pages/EnvStacksPage/EnvStacksPage'
import MyProfilePage from './pages/MyProfilePage/MyProfilePage'
import ClusterInfoPage from './pages/ClusterInfoPage/ClusterInfoPage'
import NotFoundPage from './pages/NotFoundPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'

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
    <ThemeProvider>
      <AuthProvider>
        <Routes>
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<HomePage />} />
          <Route path="provision/master" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><MasterSetupPage /></ProtectedRoute>} />
          <Route path="provision/slave" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><SlaveSetupPage /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><UsersPage /></ProtectedRoute>} />
          <Route path="env-stacks" element={<ProtectedRoute allowedRoles={['admin', 'super_admin']}><EnvStacksPage /></ProtectedRoute>} />
          <Route path="my-profile" element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
          <Route path="cluster-info" element={<ProtectedRoute><ClusterInfoPage /></ProtectedRoute>} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="ansible" element={<AnsibleRunnerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
