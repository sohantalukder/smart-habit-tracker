"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Cropper, { type Area } from "react-easy-crop";
import {
  Camera,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError, apiRequest } from "@/lib/api";
import type { ExperienceProfile } from "@/lib/api/types";
import { croppedAvatarFile } from "@/lib/avatar-crop";
import { unregisterPushNotifications } from "@/lib/firebase-messaging";
import { queryKeys } from "@/lib/queries";
import { useDashboardShell } from "./dashboard-shell";
import { ProfileAvatar } from "./profile-avatar";

type BusyAction =
  | "profile"
  | "avatar"
  | "email"
  | "password"
  | "sessions"
  | "delete"
  | null;

export function ProfilePage() {
  const { profile } = useDashboardShell();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [name, setName] = useState(profile.name);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [units, setUnits] = useState(profile.units);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [cropSource, setCropSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const updateProfileMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      timezone: string;
      units: "metric" | "imperial";
    }) => apiRequest<Partial<ExperienceProfile>>("/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ExperienceProfile>(
        queryKeys.user.profile,
        (current) => current ? { ...current, ...updated } : current,
      );
    },
  });
  const uploadAvatarMutation = useMutation({
    mutationFn: (body: FormData) =>
      apiRequest<Partial<ExperienceProfile>>("/profile/avatar", {
        method: "PUT",
        body,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ExperienceProfile>(
        queryKeys.user.profile,
        (current) => current ? { ...current, ...updated } : current,
      );
    },
  });
  const removeAvatarMutation = useMutation({
    mutationFn: () =>
      apiRequest<Partial<ExperienceProfile>>("/profile/avatar", {
        method: "DELETE",
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ExperienceProfile>(
        queryKeys.user.profile,
        (current) => current ? { ...current, ...updated } : current,
      );
    },
  });

  const timezones = useMemo(() => supportedTimezones(profile.timezone), [profile.timezone]);

  useEffect(() => {
    setName(profile.name);
    setTimezone(profile.timezone);
    setUnits(profile.units);
  }, [profile.name, profile.timezone, profile.units]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("emailChanged") === "true") {
      toast.success("Your new sign-in email is verified.");
      window.history.replaceState(null, "", "/dashboard/profile");
    }
  }, []);

  useEffect(() => () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("profile");
    setFieldErrors({});
    try {
      await updateProfileMutation.mutateAsync({
        name,
        timezone,
        units,
      });
      toast.success("Personal details updated.");
    } catch (reason) {
      if (reason instanceof ApiRequestError) setFieldErrors(reason.fieldErrors ?? {});
      toast.error(errorMessage(reason, "Your profile could not be updated."));
    } finally {
      setBusy(null);
    }
  }

  function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image smaller than 5 MB.");
      return;
    }
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropPixels(null);
  }

  async function uploadCroppedAvatar() {
    if (!cropSource || !cropPixels) return;
    setBusy("avatar");
    try {
      const file = await croppedAvatarFile(cropSource, cropPixels);
      const body = new FormData();
      body.set("file", file);
      await uploadAvatarMutation.mutateAsync(body);
      setCropSource("");
      toast.success("Profile photo updated.");
    } catch (reason) {
      toast.error(errorMessage(reason, "The profile photo could not be uploaded."));
    } finally {
      setBusy(null);
    }
  }

  async function removeAvatar() {
    setBusy("avatar");
    try {
      await removeAvatarMutation.mutateAsync();
      toast.success("Profile photo removed.");
    } catch (reason) {
      toast.error(errorMessage(reason, "The profile photo could not be removed."));
    } finally {
      setBusy(null);
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newEmail = String(form.get("newEmail") ?? "").trim();
    setBusy("email");
    try {
      const result = await authAction<{ pendingEmail: string }>(
        "request-email-change",
        {
          newEmail,
          currentPassword: String(form.get("currentPassword") ?? ""),
        },
      );
      setPendingEmail(result.pendingEmail);
      event.currentTarget.reset();
      toast.success("Verification sent to your new email.");
    } catch (reason) {
      toast.error(errorMessage(reason, "The email change could not be requested."));
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) {
      toast.error("New password confirmation does not match.");
      return;
    }
    setBusy("password");
    try {
      await authAction("change-password", {
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword,
      });
      event.currentTarget.reset();
      toast.success("Password updated. Other devices were signed out.");
    } catch (reason) {
      toast.error(errorMessage(reason, "The password could not be changed."));
    } finally {
      setBusy(null);
    }
  }

  async function signOutOthers() {
    setBusy("sessions");
    try {
      const result = await authAction<{ signedOut: number }>("sign-out-others");
      toast.success(
        result.signedOut
          ? `${result.signedOut} other session${result.signedOut === 1 ? "" : "s"} signed out.`
          : "No other active sessions were found.",
      );
    } catch (reason) {
      toast.error(errorMessage(reason, "Other sessions could not be signed out."));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      await unregisterPushNotifications().catch(() => null);
      await authAction("delete-account", {
        currentPassword: deletePassword,
        confirmation: deleteConfirmation,
      });
      queryClient.clear();
      window.location.assign("/?accountDeleted=true");
    } catch (reason) {
      toast.error(errorMessage(reason, "The account could not be scheduled for deletion."));
      setBusy(null);
    }
  }

  return (
    <div className="page-stack profile-page">
      <header className="page-heading">
        <div>
          <p>YOUR ACCOUNT</p>
          <h1>Profile</h1>
          <span>Manage your identity, sign-in security, and account lifecycle.</span>
        </div>
      </header>

      <section className="profile-hero" aria-labelledby="profile-photo-title">
        <ProfileAvatar profile={profile} size="large" />
        <div>
          <p>PROFILE PHOTO</p>
          <h2 id="profile-photo-title">{profile.name}</h2>
          <span>JPEG, PNG, or WebP · maximum 5 MB · stored privately</span>
        </div>
        <div className="profile-photo-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={choosePhoto}
          />
          <Button type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            <Camera /> {profile.has_avatar ? "Replace photo" : "Upload photo"}
          </Button>
          {profile.has_avatar && (
            <Button type="button" variant="secondary" onClick={() => void removeAvatar()} disabled={busy !== null}>
              {busy === "avatar" ? <LoaderCircle className="spin" /> : <Trash2 />}
              Remove
            </Button>
          )}
        </div>
      </section>

      <div className="profile-grid">
        <form className="profile-card profile-card--wide" onSubmit={saveProfile}>
          <CardHeading icon={<UserRound />} eyebrow="PERSONAL DETAILS" title="How Bloom knows you" />
          <div className="profile-form-grid">
            <Field label="Display name" error={fieldErrors.name?.[0]}>
              <Input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} autoComplete="name" required aria-invalid={Boolean(fieldErrors.name)} />
            </Field>
            <Field label="Measurement units" error={fieldErrors.units?.[0]}>
              <select value={units} onChange={(event) => setUnits(event.target.value as "metric" | "imperial")}>
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </Field>
            <Field label="Timezone" error={fieldErrors.timezone?.[0]} wide>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                {timezones.map((zone) => <option value={zone} key={zone}>{zone.replaceAll("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Current email">
              <Input value={profile.email} readOnly aria-readonly />
            </Field>
            <Field label="Member since">
              <Input value={new Date(profile.account_created_at).toLocaleDateString(undefined, { dateStyle: "long" })} readOnly aria-readonly />
            </Field>
          </div>
          <footer className="profile-card-actions">
            <Button disabled={busy !== null}>
              {busy === "profile" ? <LoaderCircle className="spin" /> : <Save />}
              Save personal details
            </Button>
          </footer>
        </form>

        <form className="profile-card" onSubmit={requestEmailChange}>
          <CardHeading icon={<Mail />} eyebrow="SIGN-IN EMAIL" title="Change email" />
          <p className="profile-card-copy">Your current address stays active until the new one is verified.</p>
          {pendingEmail && (
            <div className="profile-success" role="status">
              <CheckCircle2 /> <span>Verification sent to <strong>{pendingEmail}</strong>.</span>
            </div>
          )}
          <Field label="New email">
            <Input name="newEmail" type="email" autoComplete="email" required />
          </Field>
          <Field label="Current password">
            <Input name="currentPassword" type="password" autoComplete="current-password" required />
          </Field>
          <Button disabled={busy !== null}>
            {busy === "email" ? <LoaderCircle className="spin" /> : <Mail />}
            Send verification
          </Button>
        </form>

        <form className="profile-card" onSubmit={changePassword}>
          <CardHeading icon={<KeyRound />} eyebrow="PASSWORD" title="Protect your account" />
          <Field label="Current password">
            <Input name="currentPassword" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password">
            <Input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
          </Field>
          <Field label="Confirm new password">
            <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
          </Field>
          <Button disabled={busy !== null}>
            {busy === "password" ? <LoaderCircle className="spin" /> : <ShieldCheck />}
            Change password
          </Button>
        </form>

        <section className="profile-card">
          <CardHeading icon={<LogOut />} eyebrow="ACTIVE SESSIONS" title="Other devices" />
          <p className="profile-card-copy">Disconnect every other browser while keeping this session active.</p>
          <Button variant="secondary" onClick={() => void signOutOthers()} disabled={busy !== null}>
            {busy === "sessions" ? <LoaderCircle className="spin" /> : <LogOut />}
            Sign out other devices
          </Button>
        </section>

        <section className="profile-card profile-card--danger">
          <CardHeading icon={<Trash2 />} eyebrow="DANGER ZONE" title="Delete account" />
          <p className="profile-card-copy">Access stops immediately. You can restore the account for 30 days before your data is permanently removed.</p>
          <Button variant="danger" onClick={() => setDeleteOpen(true)} disabled={busy !== null}>
            <Trash2 /> Delete account
          </Button>
        </section>
      </div>

      <Dialog open={Boolean(cropSource)} onOpenChange={(open) => !open && busy !== "avatar" && setCropSource("")}>
        <DialogContent className="avatar-crop-dialog">
          <DialogHeader>
            <DialogTitle>Position your profile photo</DialogTitle>
            <DialogDescription>Move and zoom the image. Bloom will securely normalize the selected square.</DialogDescription>
          </DialogHeader>
          <div className="avatar-crop-stage">
            {cropSource && (
              <Cropper
                image={cropSource}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCropPixels(pixels)}
              />
            )}
          </div>
          <Label className="avatar-zoom">
            Zoom
            <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </Label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setCropSource("")} disabled={busy === "avatar"}>Cancel</Button>
            <Button type="button" onClick={() => void uploadCroppedAvatar()} disabled={!cropPixels || busy === "avatar"}>
              {busy === "avatar" ? <LoaderCircle className="spin" /> : <Camera />}
              Use this photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => busy !== "delete" && setDeleteOpen(open)}>
        <DialogContent className="delete-account-dialog">
          <DialogHeader>
            <DialogTitle>Schedule account deletion?</DialogTitle>
            <DialogDescription>Your account will be disabled now and permanently removed after the 30-day recovery window.</DialogDescription>
          </DialogHeader>
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
          </Field>
          <Field label='Type "DELETE" to confirm'>
            <Input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)} disabled={busy === "delete"}>Keep my account</Button>
            <Button type="button" variant="danger" onClick={() => void deleteAccount()} disabled={!deletePassword || deleteConfirmation !== "DELETE" || busy === "delete"}>
              {busy === "delete" ? <LoaderCircle className="spin" /> : <Trash2 />}
              Start 30-day deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardHeading({
  icon,
  eyebrow,
  title,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="profile-card-heading">
      <span>{icon}</span>
      <div><p>{eyebrow}</p><h2>{title}</h2></div>
    </header>
  );
}

function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label className={wide ? "profile-field profile-field--wide" : "profile-field"}>
      <span>{label}</span>
      {children}
      {error && <small role="alert">{error}</small>}
    </Label>
  );
}

async function authAction<T = Record<string, unknown>>(
  action: string,
  body?: Record<string, unknown>,
) {
  const response = await fetch(`/api/auth/${action}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      result?.message ?? "The request could not be completed.",
      result?.code,
      result?.fieldErrors,
      result?.details,
    );
  }
  return result as T;
}

function supportedTimezones(current: string) {
  const values = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];
  return Array.from(new Set([current, "UTC", ...values])).sort();
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
