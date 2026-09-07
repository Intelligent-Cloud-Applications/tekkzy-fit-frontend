import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { mobileTabIndex, mobileTabs } from '@/nav';

export function BottomNav() {
  const location = useLocation();
  const tabIndex = mobileTabIndex(location.pathname);

  return (
    <nav className="mobile-dock no-print lg:hidden">
      <div className="mobile-tabs">
        {mobileTabs.map((tab, index) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={cn('mobile-tab', tabIndex === index && 'is-active')}
            >
              <span className="mobile-tab-ico">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <span className="mobile-tab-label">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
