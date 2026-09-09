import { NavLink } from 'react-router-dom';
import { LayoutGrid, Dna, Target, FileText, Lock, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] text-[13px] font-semibold mb-0.5 transition-colors text-sidebar-text hover:bg-sidebar-hover',
    isActive && 'bg-sidebar-active text-sidebar-text-active',
  );

export function Sidebar() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? '';
  const initial = email ? email[0].toUpperCase() : 'B';

  return (
    <aside className="w-64 shrink-0 bg-sidebar flex flex-col py-6 px-[18px]">
      <div className="flex items-center gap-2.5 px-1.5 pb-6">
        <svg width="32" height="32" viewBox="0 0 30 30" fill="none">
          <rect width="30" height="30" rx="8" className="fill-accent" />
          <rect x="8" y="16" width="4" height="8" rx="1" fill="#ffffff" />
          <rect x="14" y="11" width="4" height="13" rx="1" fill="#ffffff" />
          <rect x="20" y="6" width="4" height="18" rx="1" fill="#ffffff" />
        </svg>
        <div>
          <div className="font-serif font-semibold text-base tracking-tight text-sidebar-text-active">
            bEMG Capital
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-sidebar-text">Demo workspace</div>
        </div>
      </div>

      <div className="text-[10px] font-extrabold uppercase tracking-widest text-sidebar-text/60 px-2.5 pt-2 pb-1.5">
        Capital
      </div>
      <NavLink to="/dashboard" className={navItemClass}>
        <LayoutGrid className="w-[18px] h-[18px]" />
        Dashboard
      </NavLink>
      <NavLink to="/business-dna" className={navItemClass}>
        <Dna className="w-[18px] h-[18px]" />
        Business DNA
      </NavLink>
      <NavLink to="/grants" className={navItemClass}>
        <Target className="w-[18px] h-[18px]" />
        Grant Matches
      </NavLink>
      <NavLink to="/applications" className={navItemClass}>
        <FileText className="w-[18px] h-[18px]" />
        Applications
      </NavLink>

      <div className="text-[10px] font-extrabold uppercase tracking-widest text-sidebar-text/60 px-2.5 pt-5 pb-1.5">
        Roadmap
      </div>
      <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] text-sidebar-text text-[13px] font-semibold">
        <Lock className="w-4 h-4" />
        Loans
        <span className="ml-auto text-[9px] font-extrabold uppercase tracking-wide bg-sidebar-hover px-[7px] py-0.5 rounded-full">
          Soon
        </span>
      </div>
      <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] text-sidebar-text text-[13px] font-semibold">
        <Lock className="w-4 h-4" />
        Investors
        <span className="ml-auto text-[9px] font-extrabold uppercase tracking-wide bg-sidebar-hover px-[7px] py-0.5 rounded-full">
          Soon
        </span>
      </div>

      <div className="flex-1" />

      <div className="border-t border-sidebar-hover pt-4 flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-full bg-accent text-white flex items-center justify-center font-extrabold text-sm shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold truncate text-sidebar-text-active">{email || 'bEMG Business'}</div>
          <div className="text-[10.5px] text-sidebar-text font-semibold">Funding OS plan</div>
        </div>
        <button
          className="text-sidebar-text hover:text-sidebar-text-active shrink-0"
          onClick={() => void signOut()}
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
