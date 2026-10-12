import { redirect } from "next/navigation";
import { getOptionalUser } from "@/server/page-auth";

export default async function Home() {
  redirect((await getOptionalUser()) ? "/workspaces" : "/login");
}
