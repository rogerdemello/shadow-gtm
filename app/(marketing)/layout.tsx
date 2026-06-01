import MarketingShell from "@/components/marketing/MarketingShell";

export default function MarketingGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MarketingShell>{children}</MarketingShell>;
}
