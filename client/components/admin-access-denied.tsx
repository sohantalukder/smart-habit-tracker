import Link from "next/link";
import { ShieldX } from "lucide-react";
import { BloomMark } from "@/components/bloom-mark";

export function AdminAccessDenied({ reason }: { reason: "forbidden" | "unavailable" }) {
  return <main className="access-denied"><div className="brand"><span><BloomMark /></span><strong>Bloom</strong></div><section><span><ShieldX size={26}/></span><p>ADMIN PORTAL</p><h1>{reason === "forbidden" ? "This space is restricted" : "The portal is temporarily unavailable"}</h1><small>{reason === "forbidden" ? "Only approved support and super-admin accounts can enter. If you believe this is a mistake, contact the system owner." : "We could not verify administrator access safely. Please try again shortly."}</small><Link href="/">Return to Bloom</Link></section></main>;
}
