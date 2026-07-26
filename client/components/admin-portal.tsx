"use client";

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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SupportSession } from "@/lib/api/types";
import { useEffect, useMemo, useState } from "react";
import { apiRequest, idempotentInit } from "@/lib/api";

type Page = "overview" | "users" | "templates" | "notifications" | "health" | "audit";
type UserRow = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  created_at: string;
  suspended_at: string | null;
};
type TemplateRow = {
  id: string;
  icon: string;
  name: string;
  category: string;
  active: boolean;
  default_target: number | null;
  default_unit: string | null;
};
type DeliveryRow = {
  id: string;
  title: string;
  channel: string;
  state: string;
  scheduled_at: string;
  profiles?: { email?: string; name?: string };
};
type AuditRow = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
  profiles?: { email?: string; name?: string };
};

const nav = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "users" as const, label: "Users", icon: Users },
  { id: "templates" as const, label: "Habit templates", icon: Sprout },
  { id: "notifications" as const, label: "Notifications", icon: BellRing },
  { id: "health" as const, label: "System health", icon: HeartPulse },
  { id: "audit" as const, label: "Audit log", icon: FileClock },
];

export function AdminPortal({ support }: { support: SupportSession }) {
  const [page, setPage] = useState<Page>("overview");
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [analytics, setAnalytics] = useState({ users: 0, activeHabits: 0, deliveredNotifications: 0 });
  const [health, setHealth] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState(false);
  const accessLabel = support.role === "super_admin" ? "Super admin" : "Support";

  async function load(target = page) {
    setLoading(true);
    setError("");
    try {
      if (target === "overview") {
        setAnalytics(await apiRequest("/admin/analytics"));
      } else if (target === "users") {
        const result = await apiRequest<{ data: UserRow[] }>(`/admin/users?q=${encodeURIComponent(query)}`);
        setUsers(result.data);
      } else if (target === "templates") {
        setTemplates(await apiRequest("/admin/templates"));
      } else if (target === "notifications") {
        setDeliveries(await apiRequest("/admin/notifications"));
      } else if (target === "health") {
        setHealth(await apiRequest("/admin/health"));
      } else if (target === "audit") {
        setAudits(await apiRequest("/admin/audit-logs"));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The portal could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(page); }, [page]);

  const filteredUsers = useMemo(
    () => users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())),
    [users, query],
  );

  return <div className="admin-shell">
    <aside className={sidebar ? "open" : ""}>
      <button className="admin-close" onClick={() => setSidebar(false)} aria-label="Close navigation"><X size={19}/></button>
      <div className="admin-brand"><span><Sprout size={20}/></span><div><strong>Bloom</strong><small>ADMIN PORTAL</small></div></div>
      <nav>{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => { setPage(item.id); setSidebar(false); }}><Icon size={18}/>{item.label}</button>; })}</nav>
      <div className="support-profile"><span>{initials(support.name)}</span><div><strong>{support.name || support.email}</strong><small>{accessLabel} · Full access</small></div></div>
    </aside>
    {sidebar && <button className="admin-scrim" onClick={() => setSidebar(false)} aria-label="Close navigation"/>}

    <main className="admin-main">
      <header><button className="admin-menu" onClick={() => setSidebar(true)}><Menu size={20}/></button><strong>Bloom workspace</strong><div className="admin-search"><Search size={15}/><span>Search users, templates, logs…</span></div><Badge tone="success">{accessLabel.toUpperCase()}</Badge><span className="header-avatar">{initials(support.name)}</span></header>
      <div className="admin-page">
        <AdminHeading
          eyebrow={page === "overview" ? "OPERATIONS OVERVIEW" : "BLOOM SUPPORT"}
          title={titles[page]}
          copy={copies[page]}
          action={page === "overview" || page === "notifications" ? <Button onClick={() => setAnnouncement(true)}><Send size={15}/> New announcement</Button> : undefined}
        />
        {error && <div className="admin-error"><ShieldCheck size={17}/><span>{error}</span><button onClick={() => load()}>Try again</button></div>}
        {loading ? <LoadingPanel/> : <>
          {page === "overview" && <Overview analytics={analytics} onNavigate={setPage}/>}
          {page === "users" && <UsersPanel users={filteredUsers} query={query} setQuery={setQuery} reload={() => load("users")}/>}
          {page === "templates" && <TemplatesPanel templates={templates} reload={() => load("templates")}/>}
          {page === "notifications" && <NotificationsPanel rows={deliveries} reload={() => load("notifications")}/>}
          {page === "health" && <HealthPanel health={health}/>}
          {page === "audit" && <AuditPanel rows={audits}/>}
        </>}
      </div>
    </main>
    {announcement && <AnnouncementModal onClose={() => setAnnouncement(false)} onSent={() => { setAnnouncement(false); void load("notifications"); }}/>}
  </div>;
}

const titles: Record<Page, string> = {
  overview: "Good evening, support",
  users: "Users",
  templates: "Habit templates",
  notifications: "Notifications",
  health: "System health",
  audit: "Audit log",
};
const copies: Record<Page, string> = {
  overview: "Here’s how the Bloom community and delivery systems are doing.",
  users: "Help members while respecting their privacy.",
  templates: "Manage the welcoming starting points shown to users.",
  notifications: "Monitor warm reminders and retry failed delivery.",
  health: "Live status for the services that keep Bloom moving.",
  audit: "A durable record of sensitive support actions.",
};

function AdminHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) {
  return <section className="admin-heading"><div><p>{eyebrow}</p><h1>{title}</h1><small>{copy}</small></div>{action}</section>;
}

function Overview({ analytics }: { analytics: { users: number; activeHabits: number; deliveredNotifications: number }; onNavigate: (page: Page) => void }) {
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

function UsersPanel({ users, query, setQuery, reload }: { users: UserRow[]; query: string; setQuery: (value: string) => void; reload: () => void }) {
  async function toggle(user: UserRow) {
    await apiRequest(`/admin/users/${user.id}`, idempotentInit("PATCH", { suspended: !user.suspended_at }));
    reload();
  }
  return <Card className="table-card"><div className="table-tools"><label><Search size={15}/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email"/></label><Button variant="secondary" onClick={reload}><RefreshCw size={14}/> Refresh</Button></div>{users.length ? <div className="table-scroll"><table><thead><tr><th>USER</th><th>TIMEZONE</th><th>JOINED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{users.map((user)=><tr key={user.id}><td><span className="table-avatar">{initials(user.name)}</span><div><strong>{user.name || "Unnamed user"}</strong><small>{user.email}</small></div></td><td>{user.timezone}</td><td>{new Date(user.created_at).toLocaleDateString()}</td><td><Badge tone={user.suspended_at ? "danger" : "success"}>{user.suspended_at ? "Suspended" : "Active"}</Badge></td><td><Button variant={user.suspended_at ? "secondary" : "danger"} onClick={() => toggle(user)}>{user.suspended_at ? "Reactivate" : "Suspend"}</Button></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users/>} title="No users found" description="Try another search or refresh the list."/>}</Card>;
}

function TemplatesPanel({ templates, reload }: { templates: TemplateRow[]; reload: () => void }) {
  async function toggle(template: TemplateRow) {
    await apiRequest(`/admin/templates/${template.id}`, idempotentInit("PATCH", { active: !template.active }));
    reload();
  }
  return <><div className="template-actions"><Button onClick={async () => { await apiRequest("/admin/templates", idempotentInit("POST", { slug: `custom-${Date.now()}`, name: "New gentle habit", description: "A support-created starting point.", category: "other", habit_type: "do", icon: "🌱", default_frequency: { kind: "daily" } })); reload(); }}><Plus size={15}/> Create template</Button></div><div className="template-grid">{templates.map((template)=><Card key={template.id}><div><span>{template.icon}</span><button><MoreHorizontal size={16}/></button></div><p>{template.category}</p><h2>{template.name}</h2><small>{template.default_target ? `${template.default_target} ${template.default_unit ?? ""}` : "Daily check-in"}</small><footer><Badge tone={template.active ? "success" : "neutral"}>{template.active ? "ACTIVE" : "RETIRED"}</Badge><Button variant="ghost" onClick={() => toggle(template)}>{template.active ? "Retire" : "Restore"}</Button></footer></Card>)}</div></>;
}

function NotificationsPanel({ rows, reload }: { rows: DeliveryRow[]; reload: () => void }) {
  async function retry(row: DeliveryRow) {
    await apiRequest(`/admin/notifications/${row.id}/retry`, idempotentInit("POST"));
    reload();
  }
  return <Card className="table-card">{rows.length ? <div className="table-scroll"><table><thead><tr><th>MESSAGE</th><th>CHANNEL</th><th>RECIPIENT</th><th>STATUS</th><th>TIME</th><th/></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td><strong>{row.title}</strong></td><td>{row.channel}</td><td>{row.profiles?.email ?? "—"}</td><td><Badge tone={row.state === "sent" ? "success" : row.state === "failed" ? "danger" : "warning"}>{row.state}</Badge></td><td>{new Date(row.scheduled_at).toLocaleString()}</td><td>{row.state === "failed" && <Button variant="secondary" onClick={() => retry(row)}><RefreshCw size={13}/> Retry</Button>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<BellRing/>} title="No deliveries yet" description="Scheduled and sent reminders will appear here."/>}</Card>;
}

function HealthPanel({ health }: { health: Record<string, any> | null }) {
  return <><Card className="health-hero"><span><ShieldCheck size={27}/></span><div><p>SUPPORT VERIFIED</p><h2>{health?.api === "healthy" ? "Bloom is healthy" : "Health needs attention"}</h2><small>Role and service status checked without cache</small></div></Card><div className="service-grid">{[["NestJS REST API",health?.api ?? "Unknown"],["PostgreSQL",health?.postgres ?? "Unknown"],["Redis queue",health?.queue?.connected ? "Connected" : "Not connected"],["Failed jobs",String(health?.queue?.failed ?? 0)]].map(([name,status])=><Card key={name}><span><HeartPulse size={18}/></span><p>{name}</p><h2>{status}</h2></Card>)}</div></>;
}

function AuditPanel({ rows }: { rows: AuditRow[] }) {
  return <Card className="table-card">{rows.length ? <div className="table-scroll"><table><thead><tr><th>ACTOR</th><th>ACTION</th><th>TARGET</th><th>WHEN</th></tr></thead><tbody>{rows.map((row)=><tr key={row.id}><td>{row.profiles?.email ?? "System"}</td><td><code>{row.action}</code></td><td>{row.target_type} · {row.target_id ?? "—"}</td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <EmptyState icon={<FileClock/>} title="No audited actions yet" description="Sensitive support mutations will appear here."/>}</Card>;
}

function AnnouncementModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [title,setTitle] = useState("");
  const [body,setBody] = useState("");
  const [sending,setSending] = useState(false);
  const [error,setError] = useState("");
  async function send() {
    setSending(true); setError("");
    try {
      await apiRequest("/admin/announcements", idempotentInit("POST", { title, body, channels: ["in_app"] }));
      onSent();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send announcement.");
    } finally { setSending(false); }
  }
  return <div className="modal-layer" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><Card className="announcement-modal"><button className="modal-close" onClick={onClose}><X size={18}/></button><span><Send size={20}/></span><p>SUPPORT ANNOUNCEMENT</p><h2>Send a warm note</h2><small>Announcements are delivered in-app and recorded in the audit log.</small><label>Title<Input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="A gentle weekend note"/></label><label>Message<textarea value={body} onChange={(event)=>setBody(event.target.value)} placeholder="Write something useful and encouraging…"/></label>{error&&<div className="form-message">{error}</div>}<footer><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={sending||title.length<2||body.length<2} onClick={send}>{sending?"Sending…":"Send announcement"}</Button></footer></Card></div>;
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
