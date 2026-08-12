import { Link } from "@tanstack/react-router";
import {
  Menu,
  Sparkles,
  HelpCircle,
  MessageSquare,
  Truck,
  Gavel,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SUPPORT_EMAIL } from "@/lib/support";

export function AppMenu() {
  const menuItems = [
    {
      to: "/ai",
      label: "AI Assistant",
      icon: Sparkles,
      description: "Chat with LumoroX AI for smart parking advice",
    },
    {
      to: "/pricing",
      label: "Pricing",
      icon: Coins,
      description: "Simple, transparent hosting and renting rates",
    },
    {
      to: "/become-host",
      label: "Become a Host",
      icon: ShieldCheck,
      description: "Verify your identity and start listing parking spots",
    },
    {
      to: "/help",
      label: "Help Center",
      icon: HelpCircle,
      description: "FAQs, search topics, and step-by-step guides",
    },
    {
      to: "/support",
      label: "Contact Support",
      icon: MessageSquare,
      description: "Submit tickets or chat with platform support",
    },
    {
      to: "/guides/rv-parking",
      label: "RV Parking Guide",
      icon: Truck,
      description: "Tips and spots for recreational vehicle storage",
    },
    {
      to: "/terms",
      label: "Terms of Service",
      icon: Gavel,
      description: "User agreement and guidelines",
    },
    {
      to: "/refunds",
      label: "Refund & Cancellation",
      icon: ShieldAlert,
      description: "Driver cancellation policies and payouts",
    },
    {
      to: "/privacy",
      label: "Privacy Policy",
      icon: ShieldCheck,
      description: "Data privacy regulations and cookies",
    },
  ];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-accent/80 transition-colors"
          aria-label="App Navigation"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-6 flex flex-col bg-background/95 backdrop-blur-md">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="text-left font-display text-lg font-bold">
            LumoroX Resources
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.to}
              to={item.to as any}
              className="flex items-start gap-3.5 p-3 rounded-2xl hover:bg-accent/50 transition-all border border-transparent hover:border-border/50 group"
            >
              <div className="p-2 rounded-xl bg-primary/5 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                <item.icon className="h-4.5 w-4.5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-foreground leading-none">
                  {item.label}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-normal font-normal">
                  {item.description}
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="pt-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 border border-border/40">
            <div className="p-2 rounded-xl bg-background text-muted-foreground">
              <Mail className="h-4 w-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-foreground">Support Desk</div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[11px] text-primary hover:underline font-medium block mt-0.5"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
