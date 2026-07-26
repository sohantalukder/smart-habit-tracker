import type { ReactNode } from "react";
import { requireAdminPage } from "../../lib/admin-access";
import { AdminAccessDenied } from "../../components/admin-access-denied";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await requireAdminPage("/admin");
  if (!access.allowed) return <AdminAccessDenied reason={access.reason} />;
  return <>{children}</>;
}
