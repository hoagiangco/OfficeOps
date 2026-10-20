import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

export const instant = false;

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SidebarLayout user={{ name: session.name, role: session.role }}>
      {children}
    </SidebarLayout>
  );
}
