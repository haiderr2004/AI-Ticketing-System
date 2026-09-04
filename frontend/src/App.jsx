import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Ticket, Users, Plus, LogOut, User, Menu, ShieldCheck } from 'lucide-react';
import { useDirectoryAuth } from './auth/DirectoryAuthContext';
import { resolveDirectoryWorkspaceUrl, routerBasename } from './lib/workspaceNavigation';
import AskTicketsChat from './components/AskTicketsChat';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import NewTicket from './pages/NewTicket';
import Customers from './pages/Customers';
import DirectorySignIn from './pages/DirectorySignIn';

function Sidebar({ collapsed, setCollapsed, identity }) {
  return (
    <aside className={`${collapsed ? 'w-20' : 'w-48 lg:w-52 xl:w-56'} border-r border-slate-200 bg-white transition-all duration-300 text-slate-900 flex flex-col h-full flex-shrink-0 relative`}>
      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-7 rounded-full bg-indigo-600 p-1 text-white shadow-md transition-colors hover:bg-indigo-700 z-10"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <Menu size={14} />
      </button>

      <div className={`border-b border-slate-100 px-4 py-5 ${collapsed ? 'px-2' : ''}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700">
            <User size={18} />
          </div>
          {!collapsed && <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{identity.subject}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">Technician</p>
          </div>}
        </div>
        {!collapsed && (
          <p className="mt-3 text-xs text-slate-500">Ticket operations</p>
        )}
      </div>

      <div className={`px-4 py-4 ${collapsed ? 'px-3' : ''}`}>
        <Link to="/tickets/new" className={`flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 ${collapsed ? 'px-0' : 'px-4'}`}>
          <Plus size={16} />
          {!collapsed && <span className="whitespace-nowrap">New Ticket</span>}
        </Link>
      </div>

      <nav aria-label="Ticketing navigation" className={`flex-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        <NavLink to="/" className={({ isActive }) => `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative ${isActive ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`} end title="Dashboard">
          {({ isActive }) => (
            <>
              {isActive && <div className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-md bg-indigo-600"></div>}
              <LayoutDashboard size={20} className={isActive ? 'text-indigo-600 flex-shrink-0' : 'flex-shrink-0'} />
              {!collapsed && <span className="whitespace-nowrap">Dashboard</span>}
            </>
          )}
        </NavLink>
        <NavLink to="/tickets" className={({ isActive }) => `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative ${isActive ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`} title="Tickets">
          {({ isActive }) => (
            <>
              {isActive && <div className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-md bg-indigo-600"></div>}
              <Ticket size={20} className={isActive ? 'text-indigo-600 flex-shrink-0' : 'flex-shrink-0'} />
              {!collapsed && <span className="whitespace-nowrap">Tickets</span>}
            </>
          )}
        </NavLink>
        <NavLink to="/customers" className={({ isActive }) => `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative ${isActive ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`} title="Customers">
          {({ isActive }) => (
            <>
              {isActive && <div className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-md bg-indigo-600"></div>}
              <Users size={20} className={isActive ? 'text-indigo-600 flex-shrink-0' : 'flex-shrink-0'} />
              {!collapsed && <span className="whitespace-nowrap">Customers</span>}
            </>
          )}
        </NavLink>
      </nav>
    </aside>
  );
}

function AppContent({ directoryWorkspaceUrl, identity, onSignOut }) {
  const location = useLocation();
  const headingRef = useRef(null);
  const getPageTitle = () => {
    if (location.pathname === '/') return 'Dashboard';
    if (location.pathname === '/tickets') return 'Tickets';
    if (location.pathname === '/tickets/new') return 'Submit Ticket';
    if (location.pathname === '/customers') return 'Customers';
    if (location.pathname.startsWith('/tickets/')) return 'Ticket Detail';
    return '';
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="flex-1 flex min-w-0 flex-col h-full overflow-hidden bg-slate-100">
      <header className="flex h-16 flex-shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 shadow-sm shadow-slate-900/[0.02] lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm"><ShieldCheck size={19} /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold tracking-tight text-slate-950">AD MissionControl</span><span className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:inline">Service Desk</span></div>
            <h1 ref={headingRef} tabIndex="-1" className="truncate text-xs text-slate-500 outline-none">{getPageTitle()}</h1>
          </div>
        </div>
        <nav aria-label="Primary workspace" className="flex flex-shrink-0 items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
          <a href={directoryWorkspaceUrl} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/30">Directory</a>
          <Link to="/" aria-current="page" className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 shadow-sm">Tickets</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm font-medium text-slate-700 md:inline">{identity.subject}</span>
          <button onClick={onSignOut} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"><LogOut size={16} /><span className="hidden sm:inline">Sign out</span></button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden p-4 pt-5 lg:p-5 lg:pt-6">
        <div className="h-full overflow-hidden rounded-xl border border-slate-200 bg-theme-card shadow-soft relative">
        <div className="absolute inset-0 flex flex-col w-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/tickets/new" element={<NewTicket />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/customers" element={<Customers />} />
          </Routes>
        </div>
        <AskTicketsChat />
        </div>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { identity, signOut } = useDirectoryAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const directoryWorkspaceUrl = resolveDirectoryWorkspaceUrl(
    import.meta.env.VITE_DIRECTORY_APP_URL,
    import.meta.env.BASE_URL,
  );

  function handleSignOut() {
    signOut();
    window.location.assign(directoryWorkspaceUrl);
  }

  return (
    <BrowserRouter basename={routerBasename(import.meta.env.BASE_URL)}>
      <div className="h-screen w-full bg-slate-100 flex overflow-hidden font-sans antialiased">
        <Sidebar collapsed={sidebarCollapsed} identity={identity} setCollapsed={setSidebarCollapsed} />
        <AppContent directoryWorkspaceUrl={directoryWorkspaceUrl} identity={identity} onSignOut={handleSignOut} />
      </div>
    </BrowserRouter>
  );
}

function App() {
  const { identity, isChecking } = useDirectoryAuth();

  if (isChecking) {
    return <div className="min-h-screen bg-theme-sidebar text-white flex items-center justify-center" role="status">Checking technician session…</div>;
  }
  if (!identity) return <DirectorySignIn />;
  return <AuthenticatedApp />;
}

export default App;
