import { Routes, Route, Navigate } from 'react-router-dom'
import StageScreen from './pages/StageScreen'
import MobileController from './pages/MobileController'
import HostConsole from './pages/HostConsole'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route path="/stage" element={<StageScreen />} />
      <Route path="/mobile" element={<MobileController />} />
      <Route path="/host" element={<HostConsole />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/stage" replace />} />
    </Routes>
  )
}
