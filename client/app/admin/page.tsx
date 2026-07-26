import { requireAdminPage } from "../../lib/admin-access";
import { AdminPortal } from "../../components/admin-portal";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await requireAdminPage("/admin");
  if (!access.allowed) return null;
  return <AdminPortal support={access.session} />;
}
