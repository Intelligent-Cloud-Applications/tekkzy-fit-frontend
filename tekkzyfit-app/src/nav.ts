export type RootStackParamList = {
  Tabs: { screen?: 'Dashboard' | 'Members' | 'Plans' | 'Payments' | 'Settings' } | undefined;
  Settings: undefined;
  Expenses: undefined;
  DashboardList: { kind: 'dues' | 'active' | 'new' | 'revenue' };
  MemberForm: { memberId?: string; planId?: string; enrollId?: string; name?: string };
  MemberProfile: { memberId: string };
  PlanForm: { planId?: string };
  PaymentForm: { memberId?: string };
  PaymentDetail: { paymentId: string };
  ExpenseForm: { expenseId?: string };
  Terminal: undefined;
  Staff: undefined;
  GymProfile: undefined;
  Attendance: undefined;
  Logs: { q?: string } | undefined;
  Reports: undefined;
};
