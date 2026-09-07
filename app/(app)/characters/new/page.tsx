import { redirect } from "next/navigation";

// `/characters/new` is the lifepath wizard; nothing else lives under `new`.
// Without this page a visit falls through to the `[id]` route and 404s.
export default function NewCharacterPage() {
  redirect("/characters/new/wizard");
}
