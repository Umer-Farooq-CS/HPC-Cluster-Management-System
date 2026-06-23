import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import HomePage from './pages/HomePage/HomePage'
import MasterSetupPage from './pages/MasterSetupPage/MasterSetupPage'
import SlaveSetupPage from './pages/SlaveSetupPage/SlaveSetupPage'
import DashboardPage from './pages/DashboardPage/DashboardPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="provision/master" element={<MasterSetupPage />} />
        <Route path="provision/slave" element={<SlaveSetupPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
