import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getUserPermissions } from "@/lib/rbacService";
import { SidebarLayout } from "@/components/layout/SidebarLayout";

export const instant = false;

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Kiểm tra thiết bị truy cập qua User-Agent và Cookie ưu tiên giao diện
  const headersList = await headers();
  const userAgent = headersList.get("user-agent") || "";
  const isMobileUA = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);

  const cookiesList = await cookies();
  const preferredView = cookiesList.get("preferred_view")?.value;

  // Khi mở app bằng mobile hoặc tài khoản KTV, mặc định kích hoạt giao diện mobile (/tech)
  // Trừ trường hợp người dùng chủ động chọn chế độ desktop ("preferred_view=desktop")
  if ((isMobileUA || session.role === "FIELD_TECH") && preferredView !== "desktop") {
    redirect("/tech");
  }

  const userPerms = await getUserPermissions(session.userId);

  return (
    <SidebarLayout
      user={{
        name: session.name,
        role: session.role,
        permissions: userPerms.permissions,
      }}
    >
      {children}
    </SidebarLayout>
  );
}
