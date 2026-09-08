import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Sidebar } from './Sidebar';

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Your funding overview' },
  '/business-dna': { title: 'Business DNA', subtitle: 'The evidence-backed profile capital providers see' },
  '/grants': { title: 'Grant Matches', subtitle: 'Opportunities matched to your Business DNA' },
  '/applications': { title: 'Applications', subtitle: 'Track every submission to outcome' },
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const meta = PAGE_META[location.pathname] ?? PAGE_META['/dashboard'];

  return (
    <div className="flex min-h-screen bg-paper text-ink font-sans text-sm">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-paper/90 backdrop-blur-xl border-b border-line px-10 py-[22px] flex items-center justify-between">
          <div>
            <div className="font-serif text-[22px] font-semibold tracking-tight">{meta.title}</div>
            <div className="text-[12.5px] text-ink-2 mt-0.5">{meta.subtitle}</div>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-verified/10 border border-verified/25">
              <span className="w-1.5 h-1.5 rounded-full bg-verified status-pulse inline-block" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-verified">DNA synced 2h ago</span>
            </div>
            <button className="glass-btn" onClick={() => navigate('/grants')}>
              Find New Matches
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollarea px-10 py-8 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
