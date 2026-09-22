import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * Root entry point.
 *
 * With open workspace access the visitor is sent straight into the product —
 * middleware issues a real session on the way. A deliberate sign-out leaves the
 * `nexus_signed_out` marker behind, and that visitor is taken to the sign-in
 * screen instead of being bounced back through the open-access entry.
 */
export default async function RootPage() {
  const store = await cookies();
  const openAccess = process.env.OPEN_WORKSPACE !== "false";
  const signedOut = Boolean(store.get("nexus_signed_out")?.value);
  if ((openAccess || store.get("nexus_session")?.value) && !signedOut) redirect("/dashboard");
  redirect("/login");
}
