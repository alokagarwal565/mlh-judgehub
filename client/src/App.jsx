import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import { LoaderProvider } from './context/LoaderContext';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminEvents from './pages/admin/Events';
import AdminTracks from './pages/admin/Tracks';
import AdminImportTeams from './pages/admin/ImportTeams';
import AdminImportJudges from './pages/admin/ImportJudges';
import AdminProjects from './pages/admin/Projects';
import AdminJudges from './pages/admin/Judges';
import AdminAssignments from './pages/admin/Assignments';
import AdminProgress from './pages/admin/Progress';
import AdminResults from './pages/admin/Results';
import AdminIntegrity from './pages/admin/Integrity';
import AdminSetDetail from './pages/admin/SetDetail';
import AdminUsers from './pages/admin/Users';
import AdminEditRequests from './pages/admin/EditRequests';
import JudgeDashboard from './pages/judge/Dashboard';
import JudgeScoreSet from './pages/judge/ScoreSet';
import TeamDashboard from './pages/team/Dashboard';
import Sidebar from './components/Sidebar';
import { ActiveEventProvider } from './context/ActiveEventContext';
import './index.css';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page"><div className="skeleton" style={{width:200,height:40}}/></div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin' : user.role === 'JUDGE' ? '/judge' : '/team'} /> : <Login />} />
      <Route path="/admin/*" element={
        <ProtectedRoute roles={['ADMIN']}>
          <AppLayout role="ADMIN">
            <Routes>
              <Route index element={<AdminDashboard />} />
              <Route path="events" element={<AdminEvents />} />
              <Route path="tracks" element={<AdminTracks />} />
              <Route path="import-teams" element={<AdminImportTeams />} />
              <Route path="import-judges" element={<AdminImportJudges />} />
              <Route path="projects" element={<AdminProjects />} />
              <Route path="judges" element={<AdminJudges />} />
              <Route path="assignments" element={<AdminAssignments />} />
              <Route path="progress" element={<AdminProgress />} />
              <Route path="results" element={<AdminResults />} />
              <Route path="integrity" element={<AdminIntegrity />} />
              <Route path="sets/:setId" element={<AdminSetDetail />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="edit-requests" element={<AdminEditRequests />} />
              <Route path="view-judge/:viewAsJudgeId" element={<JudgeDashboard isAdminView={true} />} />
              <Route path="view-judge/:viewAsJudgeId/score/:setId" element={<JudgeScoreSet isAdminView={true} />} />
            </Routes>
          </AppLayout>
        </ProtectedRoute>
      } />
      <Route path="/judge/*" element={<ProtectedRoute roles={['JUDGE']}><AppLayout role="JUDGE"><Routes><Route index element={<JudgeDashboard />} /><Route path="score/:setId" element={<JudgeScoreSet />} /><Route path="view/:setId" element={<JudgeScoreSet isReadOnly={true} />} /></Routes></AppLayout></ProtectedRoute>} />
      <Route path="/team/*" element={<ProtectedRoute roles={['TEAM']}><AppLayout role="TEAM"><Routes><Route index element={<TeamDashboard />} /></Routes></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

function AppLayout({ children, role }) {
  return (
    <div className="app-layout">
      <Sidebar role={role} />
      <main className="main-content">{children}</main>
    </div>
  );
}



export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <ToastProvider>
            <LoaderProvider>
              <ActiveEventProvider>
                <AppRoutes />
              </ActiveEventProvider>
            </LoaderProvider>
          </ToastProvider>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
