import { useCallback, useEffect, useState } from 'react'
import AppLayout from './components/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import IncidentDetail from './pages/IncidentDetail.jsx'
import IncidentList from './pages/IncidentList.jsx'
import Login from './pages/Login.jsx'
import NewIncident from './pages/NewIncident.jsx'
import Engineers from './pages/admin/Engineers.jsx'
import Facilities from './pages/admin/Facilities.jsx'
import { matchPath, navigate, useHashPath } from './router'
import { setUnauthorizedHandler } from './services/apiClient'
import { getCurrentUser, logout } from './services/authService'
import './App.css'
import './styles/app.css'

function routeFor(path, user) {
  if (path === '/') return <Dashboard user={user} />
  if (path === '/incidents') return <IncidentList user={user} />
  if (path === '/incidents/new') return <NewIncident user={user} />
  if (path.startsWith('/admin/')) {
    if (user.role !== 'facility_admin') {
      return (
        <div className="panel">
          <h2>Admins only</h2>
          <p>This page is for Facility Admins. <a href="#/">Back to dashboard</a></p>
        </div>
      )
    }
    if (path === '/admin/facilities') return <Facilities />
    if (path === '/admin/engineers') return <Engineers />
  }
  const m = matchPath('/incidents/:id', path)
  if (m) return <IncidentDetail key={m.id} id={m.id} user={user} />
  return (
    <div className="panel">
      <h2>Page not found</h2>
      <p><a href="#/">Back to dashboard</a></p>
    </div>
  )
}

function App() {
  const [user, setUser] = useState(getCurrentUser)
  const path = useHashPath()

  const handleLogout = useCallback(() => {
    logout()
    setUser(null)
    navigate('/')
  }, [])

  // Any 401 from the API (expired / revoked session) signs the user out
  useEffect(() => setUnauthorizedHandler(handleLogout), [handleLogout])

  // Browser tab shows who is signed in
  useEffect(() => {
    document.title = user ? `${user.name} · ACME Facility Desk` : 'Sign in · ACME Facility Desk'
  }, [user])

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return (
    <AppLayout user={user} path={path} onLogout={handleLogout}>
      {routeFor(path, user)}
    </AppLayout>
  )
}

export default App
