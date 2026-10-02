import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { canAccessPath } from '@shared/auth/permissions';
import { AppShell } from '@/layouts/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { MembersPage } from '@/pages/MembersPage';
import { MemberProfilePage } from '@/pages/MemberProfilePage';
import { AttendancePage } from '@/pages/AttendancePage';
import { MemberAttendancePage } from '@/pages/MemberAttendancePage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { PaymentDetailPage } from '@/pages/PaymentDetailPage';
import { PlansPage } from '@/pages/PlansPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ReimbursementPage } from '@/pages/ReimbursementPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useAuthStore } from '@/store/authStore';

function RequireAuth() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RoleGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const path = useLocation().pathname;
  if (user && !canAccessPath(user.role, path)) {
    return <Navigate to="/members" replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/members" replace />} />
          <Route path="/members" element={<RoleGate><MembersPage /></RoleGate>} />
          <Route path="/members/:id" element={<RoleGate><MemberProfilePage /></RoleGate>} />
          <Route path="/memberships" element={<Navigate to="/members" replace />} />
          <Route path="/attendance" element={<RoleGate><AttendancePage /></RoleGate>} />
          <Route path="/attendance/:memberId" element={<RoleGate><MemberAttendancePage /></RoleGate>} />
          <Route path="/access" element={<Navigate to="/attendance" replace />} />
          <Route path="/payments" element={<RoleGate><PaymentsPage /></RoleGate>} />
          <Route path="/payments/:id" element={<RoleGate><PaymentDetailPage /></RoleGate>} />
          <Route path="/plans" element={<RoleGate><PlansPage /></RoleGate>} />
          <Route path="/notifications" element={<Navigate to="/settings" replace />} />
          <Route path="/reports" element={<RoleGate><ReportsPage /></RoleGate>} />
          <Route path="/reimbursement" element={<RoleGate><ReimbursementPage /></RoleGate>} />
          <Route path="/devices" element={<Navigate to="/settings?tab=Terminal" replace />} />
          <Route path="/devices/:id" element={<Navigate to="/settings?tab=Terminal" replace />} />
          <Route path="/settings" element={<RoleGate><SettingsPage /></RoleGate>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
