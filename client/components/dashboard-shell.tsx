"use client";

import {
  Archive,
  BarChart3,
  Bell,
  BookCheck,
  Github,
  Globe2,
  Leaf,
  LoaderCircle,
  LogOut,
  Menu,
  Settings,
  Sprout,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";
import type { ExperienceProfile, NotificationDelivery } from "@/lib/api/types";
import { profileDisplayName } from "@/lib/dashboard";
import { unregisterPushNotifications } from "@/lib/firebase-messaging";

type DashboardContextValue = {
  profile: ExperienceProfile;
  notifications: NotificationDelivery[];
  refreshProfile: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardShell({
  initialProfile,
  children,
}: {
  initialProfile: ExperienceProfile;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [profile, setProfile] = useState(initialProfile);
  const [notifications, setNotifications] = useState<NotificationDelivery[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const refreshProfile = useCallback(async () => {
    setProfile(await apiRequest<ExperienceProfile>("/profile"));
  }, []);
  const refreshNotifications = useCallback(async () => {
    setNotifications(await apiRequest<NotificationDelivery[]>("/notifications"));
  }, []);

  useEffect(() => {
    void refreshNotifications().catch(() => null);
  }, [refreshNotifications]);

  useEffect(() => {
    const onNotification = () => void refreshNotifications().catch(() => null);
    window.addEventListener("bloom:notification", onNotification);
    return () => window.removeEventListener("bloom:notification", onNotification);
  }, [refreshNotifications]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  async function signOut() {
    setSigningOut(true);
    await unregisterPushNotifications().catch(() => null);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/");
  }

  const items = useMemo(() => [
    { href: "/dashboard", label: "Today", icon: Leaf, exact: true },
    { href: "/dashboard/habits", label: "Habits", icon: BookCheck },
    { href: "/dashboard/history", label: "History & export", icon: BarChart3 },
    ...(profile.religion_preference === "muslim"
      ? [{ href: "/dashboard/prayers", label: "Prayers", icon: Bell }]
      : []),
    { href: "/dashboard/inbox", label: "Inbox", icon: Archive, count: notifications.length },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ], [notifications.length, profile.religion_preference]);

  const context = useMemo(() => ({
    profile,
    notifications,
    refreshProfile,
    refreshNotifications,
  }), [notifications, profile, refreshNotifications, refreshProfile]);

  return (
    <DashboardContext.Provider value={context}>
      <main className="bloom-app">
        <header className="app-topbar">
          <Link href="/dashboard" className="bloom-brand" aria-label="Bloom dashboard">
            <span><Sprout size={21} /></span><strong>Bloom</strong>
          </Link>
          <div className="app-account">
            <Link href="/dashboard/inbox" aria-label={`${notifications.length} inbox items`}>
              <Bell size={18} /><span>{notifications.length}</span>
            </Link>
            <div>
              <strong>{profileDisplayName(profile)}</strong>
              <small>{profile.email}</small>
            </div>
            <button
              type="button"
              className="mobile-menu-button"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              <Menu size={20} />
            </button>
            <button type="button" className="signout-button" onClick={() => void signOut()} disabled={signingOut}>
              {signingOut ? <LoaderCircle className="spin" /> : <LogOut />}
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <div className="app-layout">
          {mobileNavOpen && (
            <button
              type="button"
              className="app-nav-scrim"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          <aside className={mobileNavOpen ? "app-sidebar is-open" : "app-sidebar"}>
            <p>YOUR PRIVATE SPACE</p>
            <nav aria-label="Account sections">
              {items.map(({ href, label, icon: Icon, exact, count }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} key={href}>
                    <Icon size={19} />
                    <span>{label}</span>
                    {count !== undefined && <small>{count}</small>}
                  </Link>
                );
              })}
            </nav>
            <div className="developer-card">
              <p>DEVELOPED BY</p>
              <strong>Md. Sohan Talukder</strong>
              <div>
                <a
                  href="https://github.com/sohantalukder"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Md. Sohan Talukder on GitHub"
                >
                  <Github /> GitHub
                </a>
                <a
                  href="https://sohantalukder.github.io"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Md. Sohan Talukder's website"
                >
                  <Globe2 /> Website
                </a>
              </div>
            </div>
          </aside>
          <div className="app-content">{children}</div>
        </div>
      </main>
    </DashboardContext.Provider>
  );
}

export function useDashboardShell() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboardShell must be used inside DashboardShell.");
  return value;
}
