import { Navigate, Route, Routes } from 'react-router'

import { RequireAuth } from './components/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { MainPage } from './pages/MainPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<MainPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
