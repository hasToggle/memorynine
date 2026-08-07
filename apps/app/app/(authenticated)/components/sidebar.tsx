"use client";

import { OrganizationSwitcher, UserButton } from "@repo/auth/client";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@repo/design-system/components/ui/sidebar";
import { cn } from "@repo/design-system/lib/utils";
import { NotificationsTrigger } from "@repo/notifications/components/trigger";
import {
  AnchorIcon,
  BrainIcon,
  ClipboardCheckIcon,
  type LucideIcon,
  NewspaperIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface GlobalSidebarProperties {
  readonly children: ReactNode;
  /** Open review proposals, shown as a badge on the Review entry. */
  readonly reviewCount?: number;
}

interface NavItem {
  badge?: number;
  icon: LucideIcon;
  title: string;
  url: string;
}

const navMain: NavItem[] = [
  {
    icon: BrainIcon,
    title: "Brain",
    url: "/",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Review",
    url: "/review",
  },
  {
    icon: UsersIcon,
    title: "Team",
    url: "/team",
  },
  {
    icon: NewspaperIcon,
    title: "Digest",
    url: "/digest",
  },
];

const navSecondary: NavItem[] = [
  {
    icon: AnchorIcon,
    title: "Webhooks",
    url: "/webhooks",
  },
];

// Review has its own entry now, so it no longer keeps Brain lit.
const isActiveUrl = (url: string, pathname: string): boolean =>
  url === "/" ? pathname === "/" : pathname.startsWith(url);

const NavMenu = ({ items }: { items: NavItem[] }) => {
  const pathname = usePathname();

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            isActive={isActiveUrl(item.url, pathname)}
            tooltip={item.title}
          >
            <Link href={item.url}>
              <item.icon />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
          {item.badge !== undefined && item.badge > 0 ? (
            <SidebarMenuBadge className="rounded-full bg-primary font-medium text-primary-foreground tabular-nums">
              {item.badge}
            </SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
};

export const GlobalSidebar = ({
  children,
  reviewCount = 0,
}: GlobalSidebarProperties) => {
  const sidebar = useSidebar();
  const items = navMain.map((item) =>
    item.url === "/review" ? { ...item, badge: reviewCount } : item
  );

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* No overflow clipping here: the switcher's popover is
                  absolutely positioned and would be cut off. */}
              <div
                className={cn(
                  "h-[36px] transition-all [&>div]:w-full",
                  sidebar.open ? "" : "-mx-1"
                )}
              >
                <OrganizationSwitcher
                  afterSelectOrganizationUrl="/"
                  hidePersonal
                />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <NavMenu items={items} />
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <NavMenu items={navSecondary} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center gap-2">
              <UserButton
                appearance={{
                  elements: {
                    rootBox: "flex overflow-hidden w-full",
                    userButtonBox: "flex-row-reverse",
                    userButtonOuterIdentifier: "truncate pl-0",
                  },
                }}
                showName
              />
              <div className="flex shrink-0 items-center gap-px">
                <ModeToggle />
                <Button
                  asChild
                  className="shrink-0"
                  size="icon"
                  variant="ghost"
                >
                  <div className="h-4 w-4">
                    <NotificationsTrigger />
                  </div>
                </Button>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </>
  );
};
