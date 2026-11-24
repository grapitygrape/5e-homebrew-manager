import { getJson, rpc } from './transport';
import {
  dashboardContent,
  dashboardView,
  type DashboardContent,
  type DashboardView,
} from '$lib/services/dashboard-service';
import { runAudit, type AuditReport } from '$lib/services/audit-service';

export type { DashboardContent, DashboardView, AuditReport };

export const getDashboard = (opts?: {
  includeAudit?: boolean;
}): Promise<DashboardView> =>
  rpc(
    () => dashboardView(opts),
    () =>
      getJson<DashboardView>(
        `/api/dashboard${opts?.includeAudit === false ? '?deferAudit=1' : ''}`,
      ),
  );

export const getDashboardContent = (): Promise<DashboardContent> =>
  rpc(dashboardContent, () =>
    getJson<DashboardContent>('/api/dashboard/content'),
  );

export const runGuideAudit = (refresh = false): Promise<AuditReport> =>
  rpc(
    () => runAudit(refresh),
    () => getJson<AuditReport>(`/api/audit${refresh ? '?refresh=1' : ''}`),
  );
