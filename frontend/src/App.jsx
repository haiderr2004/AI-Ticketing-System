import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import { CircleDot } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import NewTicket from './pages/NewTicket';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <div className="nav-brand">
            <CircleDot size={14} className="text-blue-500 fill-current" />
            IT ticket system
          </div>
          
          <NavLink 
            to="/" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end
          >
            Dashboard
          </NavLink>
          
          <NavLink 
            to="/tickets" 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end
          >
            Tickets
          </NavLink>
          
          <Link to="/tickets/new" className="nav-btn ml-auto">
            + New ticket
          </Link>
        </nav>

        <div className="p-5">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/tickets/new" element={<NewTicket />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
