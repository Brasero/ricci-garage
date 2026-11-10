import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ClientPage } from './pages/ClientPage'
import { ClientsPage } from './pages/ClientsPage'
import { HomePage } from './pages/HomePage'
import { InterventionPage } from './pages/InterventionPage'
import { InterventionsPage } from './pages/InterventionsPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { TrashPage } from './pages/TrashPage'
import { VehiclePage } from './pages/VehiclePage'
import { VehiclesPage } from './pages/VehiclesPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/nouveau" element={<ClientPage />} />
          <Route path="clients/:id" element={<ClientPage />} />
          <Route path="vehicules" element={<VehiclesPage />} />
          <Route path="vehicules/nouveau" element={<VehiclePage />} />
          <Route path="vehicules/:id" element={<VehiclePage />} />
          <Route path="interventions" element={<InterventionsPage />} />
          <Route path="interventions/nouveau" element={<InterventionPage />} />
          <Route path="interventions/:id" element={<InterventionPage />} />
          <Route path="corbeille" element={<TrashPage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="connexion" element={<LoginPage />} />
          <Route path="*" element={<p className="empty">Page introuvable.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
