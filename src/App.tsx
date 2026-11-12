import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LockScreen } from './components/LockScreen'
import { ToastProvider } from './components/Toast'
import { useLock } from './lock'
import { AgendaPage } from './pages/AgendaPage'
import { ClientPage } from './pages/ClientPage'
import { EcheancePage } from './pages/EcheancePage'
import { RdvPage } from './pages/RdvPage'
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
  // Verrouillé : on ne rend rien d'autre que l'écran de code (aucune donnée affichée ni requêtée).
  if (useLock()) return <LockScreen />
  return (
    <BrowserRouter>
      <ToastProvider>
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
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="rendez-vous/nouveau" element={<RdvPage />} />
          <Route path="rendez-vous/:id" element={<RdvPage />} />
          <Route path="echeances/nouveau" element={<EcheancePage />} />
          <Route path="echeances/:id" element={<EcheancePage />} />
          <Route path="corbeille" element={<TrashPage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="connexion" element={<LoginPage />} />
          <Route path="*" element={<p className="empty">Page introuvable.</p>} />
        </Route>
      </Routes>
      </ToastProvider>
    </BrowserRouter>
  )
}
