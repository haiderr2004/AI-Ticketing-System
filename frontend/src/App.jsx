import { BrowserRouter, Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Ticket, Users, Plus, ChevronDown, User } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import NewTicket from './pages/NewTicket';
import Customers from './pages/Customers';

function Sidebar() {
  return (
    <div className="w-64 text-white flex flex-col h-full flex-shrink-0">
      {/* Profile */}
      <div className="p-8 flex flex-col items-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border border-gray-600 flex items-center justify-center mb-3 bg-[#3A3266]">
            <User size={24} className="text-gray-300" />
          </div>
        </div>
        <h2 className="font-semibold text-lg tracking-wide">Haider H.</h2>
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-theme-primary mt-1 tracking-wider">
          <div className="w-2 h-2 rounded-full bg-theme-primary"></div>
          Online <ChevronDown size={10} />
        </div>
      </div>

      {/* New Button */}
      <div className="px-8 mb-8">
        <Link to="/tickets/new" className="flex items-center justify-center gap-2 bg-theme-primary hover:bg-theme-primaryHover text-white rounded-full py-3 px-6 font-semibold shadow-lg shadow-theme-primary/30 transition-all text-sm w-full">
          <div className="bg-white/20 rounded-full p-0.5"><Plus size={16} /></div>
          New Ticket
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        <NavLink to="/" className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative ${isActive ? 'bg-theme-sidebarActive text-white' : 'text-gray-400 hover:text-gray-200'}`} end>
          {({ isActive }) => (
            <>
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-theme-primary rounded-r-md"></div>}
              <LayoutDashboard size={18} className={isActive ? 'text-theme-primary' : ''} />
              Dashboard
            </>
          )}
        </NavLink>
        <NavLink to="/tickets" className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative ${isActive ? 'bg-theme-sidebarActive text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          {({ isActive }) => (
            <>
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-theme-primary rounded-r-md"></div>}
              <Ticket size={18} className={isActive ? 'text-theme-primary' : ''} />
              Tickets
            </>
          )}
        </NavLink>
        <NavLink to="/customers" className={({ isActive }) => `flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-medium transition-colors relative ${isActive ? 'bg-theme-sidebarActive text-white' : 'text-gray-400 hover:text-gray-200'}`}>
          {({ isActive }) => (
            <>
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-theme-primary rounded-r-md"></div>}
              <Users size={18} className={isActive ? 'text-theme-primary' : ''} />
              Customers
            </>
          )}
        </NavLink>
      </nav>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const getPageTitle = () => {
    if (location.pathname === '/') return 'Dashboard';
    if (location.pathname === '/tickets') return 'Tickets';
    if (location.pathname === '/tickets/new') return 'Submit Ticket';
    if (location.pathname === '/customers') return 'Customers';
    if (location.pathname.startsWith('/tickets/')) return 'Ticket Detail';
    return '';
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top Header Area (Dark Purple) */}
      <div className="h-28 flex items-center justify-between pr-10 pl-6 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-white tracking-wide">{getPageTitle()}</h1>
      </div>

      {/* Main White Content Area */}
      <div className="flex-1 bg-theme-card rounded-tl-[40px] overflow-hidden shadow-2xl relative">
        <div className="absolute inset-0 overflow-y-auto">
          <div className="min-h-full">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/new" element={<NewTicket />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/customers" element={<Customers />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="h-screen w-full bg-theme-sidebar flex overflow-hidden font-sans antialiased">
        <Sidebar />
        <AppContent />
      </div>
    </BrowserRouter>
  );
}

export default App;
