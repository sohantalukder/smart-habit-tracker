"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  BellRing,
  ChevronDown,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminTemplateEditor } from "@/components/admin-template-editor";
import { AdminUserEditor } from "@/components/admin-user-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SupportSession } from "@/lib/api/types";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, idempotentInit } from "@/lib/api";
import {
  adminPageCount,
  canRestrictAdminUser,
} from "@/lib/admin-management";
import {
  appQueries,
  queryKeys,
  type AdminAnalytics,
  type AdminAudit,
  type AdminDelivery,
  type AdminHealth,
  type AdminPage,
  type AdminTemplate,
  type AdminUser,
  type AdminUserPage,
} from "@/lib/queries";

const nav = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "users" as const, label: "Users", icon: Users },
  { id: "templates" as const, label: "Habit templates", icon: Sprout },
  { id: "notifications" as const, label: "Notifications", icon: BellRing },
  { id: "health" as const, label: "System health", icon: HeartPulse },
  { id: "audit" as const, label: "Audit log", icon: FileClock },
];

export function AdminPortal({ support }: { support: SupportSession }) {
  const [page, setPage] = useState<AdminPage>("overview");
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState("");
  const [userPage, setUserPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [announcement, setAnnouncement] = useState(false);
  const accessLabel = support.role === "super_admin" ? "Super admin" : "Support";
  const canManage = support.role === "super_admin";
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (nav.some((item) => item.id === section)) {
      setPage(section as AdminPage);
    }
  }, []);
  const adminQuery = useQuery({
    ...appQueries.admin(page, page === "users" ? debouncedQuery : "", userPage),
    placeholderData: (previous, previousQuery) =>
      page === "users" && previousQuery?.queryKey[1] === "users"
        ? previous
        : undefined,
  });
  const data = adminQuery.data;
  const users = page === "users" && data && !Array.isArray(data) && "data" in data
    ? data.data
    : [];
  const userResult = page === "users" && data && !Array.isArray(data) && "data" in data
    ? data as AdminUserPage
    : { data: [], count: 0, page: userPage, pageSize: 50 };
  const templates = page === "templates" && Array.isArray(data)
    ? data as AdminTemplate[]
    : [];
  const deliveries = page === "notifications" && Array.isArray(data)
    ? data as AdminDelivery[]
    : [];
  const audits = page === "audit" && Array.isArray(data)
    ? data as AdminAudit[]
    : [];
  const analytics = page === "overview" && data && !Array.isArray(data) && "users" in data
    ? data as AdminAnalytics
    : { users: 0, activeHabits: 0, deliveredNotifications: 0 };
  const health = page === "health" && data && !Array.isArray(data) && !("data" in data)
    ? data as AdminHealth
    : null;
  const loading = adminQuery.isPending;
  const error = adminQuery.error instanceof Error && !adminQuery.data
    ? adminQuery.error.message
    : adminQuery.error && !adminQuery.data
      ? "The portal could not load."
      : "";

  const filteredUsers = useMemo(
    () => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())),
    [users, query],
  );

  return <div className="admin-shell">
    <aside className={sidebar ? "open" : ""}>
      <button className="admin-close" onClick={() => setSidebar(false)} aria-label="Close navigation"><X size={19}/></button>
      <div className="admin-brand"><span><Sprout size={20}/></span><div><strong>Bloom</strong><small>ADMIN PORTAL</small></div></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={page === item.id ? "page" : undefined} className={page === item.id ? "active" : ""} onClick={() => { setPage(item.id); setSidebar(false); window.history.replaceState(null, "", `/admin?section=${item.id}`); }}><Icon size={18}/>{item.label}</button>; })}</nav>
      <div className="support-profile"><span>{initials(support.name)}</span><div><strong>{support.name || support.email}</strong><small>{accessLabel} · {canManage ? "Full management" : "Read and restrict"}</small></div></div>
    </aside>
    {sidebar && <button className="admin-scrim" onClick={() => setSidebar(false)} aria-label="Close navigation"/>}

    <main className="admin-main">
      <header><button className="admin-menu" onClick={() => setSidebar(true)} aria-label="Open navigation"><Menu size={20}/></button><strong>Bloom workspace</strong><label className="admin-search"><Search size={15}/><input value={query} onFocus={() => setPage("users")} onChange={(event) => { setQuery(event.target.value); setUserPage(1); setPage("users"); }} placeholder="Search users by name or email" aria-label="Search users"/></label><Badge tone="success">{accessLabel.toUpperCase()}</Badge><span className="header-avatar" aria-label={`${accessLabel} profile`}>{initials(support.name)}</span></header>
      <div className="admin-page">
        <AdminHeading
          eyebrow={page === "overview" ? "OPERATIONS OVERVIEW" : "BLOOM SUPPORT"}
          title={page === "overview" ? greeting(support.name) : titles[page]}
          copy={copies[page]}
          action={canManage && (page === "overview" || page === "notifications") ? <Button onClick={() => setAnnouncement(true)}><Send size={15}/> New announcement</Button> : undefined}
        />
        {error && <div className="admin-error"><ShieldCheck size={17}/><span>{error}</span><button onClick={() => void adminQuery.refetch()}>Try again</button></div>}
        {loading ? <LoadingPanel/> : <>
          {page === "overview" && <Overview analytics={analytics} onNavigate={setPage}/>}
          {page === "users" && <UsersPanel users={filteredUsers} query={query} setQuery={(value) => { setQuery(value); setUserPage(1); }} refresh={() => void adminQuery.refetch()} support={support} canManage={canManage} count={userResult.count} page={userResult.page} pageSize={userResult.pageSize} setPage={setUserPage}/>}
          {page === "templates" && <TemplatesPanel templates={templates} canManage={canManage}/>}
          {page === "notifications" && <NotificationsPanel rows={deliveries} canManage={canManage}/>}
          {page === "health" && <HealthPanel health={health}/>}
          {page === "audit" && <AuditPanel rows={audits}/>}
        </>}
      </div>
    </main>
    {announcement && <AnnouncementModal onClose={() => setAnnouncement(false)} onSent={() => setAnnouncement(false)}/>}
  </div>;
}

const titles: Record<AdminPage, string> = {
  overview: "Workspace overview",
  users: "Users",
  templates: "Habit templates",
  notifications: "Notifications",
  health: "System health",
  audit: "Audit log",
};
const copies: Record<AdminPage, string> = {
  overview: "Here’s how the Bloom community and delivery systems are doing.",
  users: "Help members while respecting their privacy.",
  templates: "Manage the welcoming starting points shown to users.",
  notifications: "Monitor warm reminders and retry failed delivery.",
  health: "Configuration and queue status for the services that keep Bloom moving.",
  audit: "A durable record of sensitive support actions.",
};

function AdminHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="admin-heading"><div><p>{eyebrow}</p><h1>{title}</h1><small>{copy}</small></div>{action}</section>;
}

function Overview({ analytics }: { analytics: AdminAnalytics; onNavigate: (page: AdminPage) => void }) {
  const stats = [
    ["Total users", analytics.users, Users, "green"],
    ["Active habits", analytics.activeHabits, Activity, "amber"],
    ["Delivered", analytics.deliveredNotifications, Send, "blue"],
  ] as const;
  return <>
    <div className="admin-stats">{stats.map(([label,value,Icon,tone]) => <Card key={label}><span className={`stat-mark ${tone}`}><Icon size={19}/></span><div><p>{label}</p><h2>{value}</h2><small>Live workspace summary</small></div></Card>)}</div>
    <Card className="admin-callout"><ShieldCheck size={21}/><div><strong>Support-only workspace</strong><p>Every page and REST request re-checks your exact support membership. All mutations are audited.</p></div></Card>
  </>;
}

function UsersPanel({ users, query, setQuery, refresh, support, canManage, count, page, pageSize, setPage }: { users: AdminUser[]; query: string; setQuery: (value: string) => void; refresh: () => void; support: SupportSession; canManage: boolean; count: number; page: number; pageSize: number; setPage: (page: number) => void }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [actionError, setActionError] = useState("");
  const toggleMutation = useMutation({
    mutationFn: ({ user, reason }: { user: AdminUser; reason: string }) =>
      apiRequest(`/admin/users/${user.id}`, idempotentInit("PATCH", {
        suspended: !user.suspended_at,
        reason,
      })),
    onSuccess: async () => {
      setActionError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.analytics }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit }),
      ]);
    },
    onError: (reason) => {
      setActionError(reason instanceof Error ? reason.message : "The account status could not be changed.");
    },
  });
  function toggle(user: AdminUser) {
    if (toggleMutation.isPending) return;
    const action = user.suspended_at ? "reactivation" : "restriction";
    const reason = window.prompt(`Enter a reason for this ${action}:`)?.trim();
    if (reason && reason.length >= 3) toggleMutation.mutate({ user, reason });
  }
  const totalPages = adminPageCount(count, pageSize);
  return <>
    {actionError && <div className="admin-error" role="alert">{actionError}</div>}
    <Card className="table-card">
      <div className="table-tools">
        <label><Search size={15}/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email"/></label>
        <Button variant="secondary" onClick={refresh}><RefreshCw size={14}/> Refresh</Button>
      </div>
      {users.length ? <>
        <div className="table-scroll">
          <table>
            <thead><tr><th>USER</th><th>ROLE</th><th>TIMEZONE</th><th>JOINED</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
            <tbody>{users.map((user) => <tr key={user.id}>
              <td><span className="table-avatar">{initials(user.name)}</span><div><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small></div></td>
              <td>{user.role?.replace("_", " ") ?? "Member"}</td>
              <td>{user.timezone}</td>
              <td>{new Date(user.created_at).toLocaleDateString()}</td>
              <td><Badge tone={user.suspended_at ? "danger" : "success"}>{user.suspended_at ? "Suspended" : "Active"}</Badge></td>
              <td><div className="table-actions">
                <Button variant="secondary" onClick={() => setSelected(user)}>{canManage ? "Manage" : "View"}</Button>
                <Button
                  disabled={toggleMutation.isPending || !canRestrictAdminUser(support, user)}
                  variant={user.suspended_at ? "secondary" : "danger"}
                  onClick={() => toggle(user)}
                >
                  {user.suspended_at ? "Reactivate" : "Restrict"}
                </Button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <footer className="admin-pagination">
          <span>{count} users · Page {page} of {totalPages}</span>
          <div>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </footer>
      </> : <EmptyState icon={<Users/>} title="No users found" description="Try another search or refresh the list."/>}
    </Card>
    <AdminUserEditor user={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} canManage={canManage}/>
  </>;
}

function TemplatesPanel({ templates, canManage }: { templates: AdminTemplate[]; canManage: boolean }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<AdminTemplate | null>(null);
  function edit(template: AdminTemplate | null) {
    setSelected(template);
    setEditorOpen(true);
  }
  return <><div className="template-actions">{canManage && <Button onClick={() => edit(null)}><Plus size={15}/> Create template</Button>}</div><div className="template-grid">{templates.map((template)=><Card key={template.id}><div><span>{template.icon}</span>{canManage && <button aria-label={`Edit ${template.name}`} onClick={() => edit(template)}><MoreHorizontal size={16}/></button>}</div><p>{template.category}</p><h2>{template.name}</h2><small>{template.default_target ? `${template.default_target} ${template.default_unit ?? ""}` : "Daily check-in"}</small><footer><Badge tone={template.active ? "success" : "neutral"}>{template.active ? "ACTIVE" : "RETIRED"}</Badge>{canManage && <Button variant="ghost" onClick={() => edit(template)}>Edit</Button>}</footer></Card>)}</div><AdminTemplateEditor template={selected} open={editorOpen} onOpenChange={setEditorOpen}/></>;
}

function NotificationsPanel({ rows, canManage }: { rows: AdminDelivery[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const retryMutation = useMutation({
    mutationFn: ({ row, action }: { row: AdminDelivery; action: "retry" | "cancel" }) =>
      apiRequest(`/admin/notifications/${row.id}/${action}`, idempotentInit("POST")),
    onSuccess: async () => {
      setActionError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.notifications }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit }),
      ]);
    },
    onError: (reason) => {
      setActionError(reason instanceof Error ? reason.message : "The notification action failed.");
    },
  });
  function act(row: AdminDelivery, action: "retry" | "cancel") {
    if (retryMutation.isPending) return;
    const label = action === "retry" ? "Retry this failed notification?" : "Cancel this notification?";
    if (window.confirm(label)) retryMutation.mutate({ row, action });
  }
  return <>{actionError && <div className="admin-error" role="alert">{actionError}</div>}<Card className="table-card">{rows.length ? <div className="table-scroll"><table><thead><tr><th>MESSAGE</th><th>CHANNEL</th><th>RECIPIENT</th><th>STATUS</th><th>TIME</th><th>ACTIONS</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><strong>{row.title}</strong></td><td>{row.channel}</td><td>{row.profiles?.email ?? "—"}</td><td><Badge tone={row.state === "sent" ? "success" : row.state === "failed" ? "danger" : "warning"}>{row.state}</Badge></td><td>{new Date(row.scheduled_at).toLocaleString()}</td><td>{canManage && <div className="table-actions">{row.state === "failed" && <Button disabled={retryMutation.isPending} variant="secondary" onClick={() => act(row, "retry")}><RefreshCw size={13}/> Retry</Button>}{(row.state === "failed" || row.state === "scheduled") && <Button disabled={retryMutation.isPending} variant="danger" onClick={() => act(row, "cancel")}>Cancel</Button>}</div>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<BellRing/>} title="No deliveries yet" description="Scheduled and sent reminders will appear here."/>}</Card></>;
}

function HealthPanel({ health }: { health: AdminHealth | null }) {
  return <><Card className="health-hero"><span><ShieldCheck size={27}/></span><div><p>SUPPORT VERIFIED</p><h2>{health?.api === "healthy" ? "Bloom is healthy" : "Health needs attention"}</h2><small>Cached for five minutes and refreshed when stale</small></div></Card><div className="service-grid">{[["NestJS REST API",health?.api ?? "Unknown"],["PostgreSQL",health?.postgres ?? "Unknown"],["Redis queue",health?.queue?.connected ? "Connected" : "Not connected"],["Failed jobs",String(health?.queue?.failed ?? 0)]].map(([name,status])=><Card key={name}><span><HeartPulse size={18}/></span><p>{name}</p><h2>{status}</h2></Card>)}</div></>;
}

function AuditPanel({ rows }: { rows: AdminAudit[] }) {
  return <Card className="table-card">{rows.length ? <div className="table-scroll"><table><thead><tr><th>ACTOR</th><th>ACTION</th><th>TARGET</th><th>WHEN</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{row.profiles?.email ?? "System"}</td><td><code>{row.action}</code></td><td>{row.target_type} · {row.target_id ?? "—"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <EmptyState icon={<FileClock/>} title="No audited actions yet" description="Sensitive support mutations will appear here."/>}</Card>;
}

function AnnouncementModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const queryClient = useQueryClient();
  const [title,setTitle] = useState("");
  const [body,setBody] = useState("");
  const [channels,setChannels] = useState<Array<"push"|"email"|"in_app">>(["push","in_app"]);
  const [error,setError] = useState("");
  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("/admin/announcements", idempotentInit("POST", { title, body, channels })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.notifications }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.audit }),
      ]);
      onSent();
    },
    onError: (reason) => {
      setError(reason instanceof Error ? reason.message : "Could not send announcement.");
    },
  });
  function send() {
    setError("");
    sendMutation.mutate();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="announcement-modal">
        <DialogHeader>
          <span><Send size={20}/></span>
          <p>SUPPORT ANNOUNCEMENT</p>
          <DialogTitle>Send a warm note</DialogTitle>
          <DialogDescription>
            Choose Firebase push, email, in-app delivery, or any combination.
            Every delivery is audited.
          </DialogDescription>
        </DialogHeader>
        <label>Title<Input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="A gentle weekend note"/></label>
        <label>Message<textarea value={body} onChange={(event)=>setBody(event.target.value)} placeholder="Write something useful and encouraging…"/></label>
        <fieldset className="announcement-channels">
          <legend>Channels</legend>
          {(["push","email","in_app"] as const).map((channel)=><label key={channel}><input type="checkbox" checked={channels.includes(channel)} onChange={(event)=>setChannels((current)=>event.target.checked?[...current,channel]:current.filter((item)=>item!==channel))}/>{channel.replace("_"," ")}</label>)}
        </fieldset>
        {error&&<div className="form-message" role="alert">{error}</div>}
        <footer><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={sendMutation.isPending||title.length<2||body.length<2||channels.length===0} onClick={send}>{sendMutation.isPending?"Sending…":"Send announcement"}</Button></footer>
      </DialogContent>
    </Dialog>
  );
}

function PanelTitle({ eyebrow,title }: { eyebrow:string; title:string }) {
  return <div className="panel-title"><p>{eyebrow}</p><h2>{title}</h2></div>;
}
function EmptyState({ icon, title, description }: { icon?: React.ReactNode; title: string; description: string }) {
  return <div className="ui-empty">{icon}<strong>{title}</strong><p>{description}</p></div>;
}
function LoadingPanel() {
  return <div className="loading-panel"><i/><i/><i/></div>;
}
function initials(name: string) {
  return name ? name.split(" ").slice(0,2).map((part)=>part[0]).join("").toUpperCase() : "SU";
}

function greeting(name: string) {
  const hour = new Date().getHours();
  const time = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${time}, ${name || "admin"}`;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}
