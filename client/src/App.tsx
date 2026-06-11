import { Routes, Route, Navigate } from 'react-router-dom'
import StageScreen from './pages/StageScreen'
import MobileController from './pages/MobileController'
import HostConsole from './pages/HostConsole'
import AdminPage from './pages/AdminPage'
import CheckInPage from './pages/CheckInPage'

export default function App() {
  return (
    <Routes>
      <Route path="/stage" element={<StageScreen />} />
      <Route path="/mobile" element={<MobileController />} />
      <Route path="/host" element={<HostConsole />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/checkin" element={<CheckInPage />} />
      <Route path="*" element={<Navigate to="/stage" replace />} />
    </Routes>
  )
}
