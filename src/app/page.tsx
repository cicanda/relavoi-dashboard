import { redirect } from "next/navigation";

export default function Home() {
  // The actual session check lives in /dashboard's AuthGuard;
  // for an unauthenticated visitor the guard there will bounce them to /login.
  redirect("/dashboard");
}
