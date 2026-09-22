import {
  Activity,
  BarChart3,
  Boxes,
  BrainCircuit,
  Building2,
  Gauge,
  LayoutDashboard,
  PlugZap,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  description: string;
  badgeKey?: "insights" | "risks" | "notifications";
};

export const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, description: "Executive command centre" },
  { label: "Intelligence", href: "/intelligence", icon: BrainCircuit, description: "AI Executive Brief" },
  { label: "Opportunities", href: "/opportunities", icon: Sparkles, description: "Revenue opportunity engine", badgeKey: "insights" },
  { label: "Risks", href: "/risks", icon: ShieldAlert, description: "Risk register", badgeKey: "risks" },
  { label: "Revenue", href: "/revenue", icon: Gauge, description: "Revenue intelligence" },
  { label: "Customers", href: "/customers", icon: Building2, description: "Customer intelligence" },
  { label: "Operations", href: "/operations", icon: Activity, description: "Support, tasks and capacity" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, description: "Advanced analytics & reports" },
  { label: "Automations", href: "/automations", icon: Workflow, description: "Automation engine" },
  { label: "Integrations", href: "/integrations", icon: PlugZap, description: "Data connections" },
  { label: "Team", href: "/team", icon: Users, description: "People, roles and capacity" },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Audit log", href: "/audit", icon: ScrollText, description: "Every action, who and when" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Organization, billing and security" },
  { label: "Systems", href: "/settings?tab=status", icon: Boxes, description: "Jobs, webhooks and data health" },
];

export const MOBILE_PRIMARY = ["/dashboard", "/intelligence", "/opportunities", "/risks", "/customers"];
