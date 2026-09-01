import { redirect } from "next/navigation";

// The root path is the dashboard. Signed-in users land on their characters;
// the (app) layout guard bounces guests on to /login from there, so this file
// deliberately does no auth work of its own.
export default function Home() {
  redirect("/dashboard");
}
