// app/page.tsx
//
// Pagina de start trimite direct la demo-ul de blog.

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/blog");
}
