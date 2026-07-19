import type { ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { IconSun, IconMoon, IconPlugConnectedX } from "@tabler/icons-react";
import DyaLogo from "../assets/dya.svg?react";
import { useTheme } from "../hooks/useTheme";
import { useLanguage } from "../hooks/useLanguage";
import type { ConnectionMethod } from "../components/DeviceConnection";
import { LanguageToggle } from "../components/LanguageToggle";
import { PageTransition } from "../components/PageTransition";

export interface TabItem {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

interface AppLayoutProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  isConnected: boolean;
  deviceName?: string;
  onConnect: (method: ConnectionMethod) => void;
  onDisconnect: () => void;
  isConnecting?: boolean;
}

export function AppLayout({
  tabs,
  activeTab,
  onTabChange,
  isConnected,
  deviceName,
  onConnect,
  onDisconnect,
  isConnecting,
}: AppLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={onTabChange}
      className="flex flex-col h-screen bg-gradient-dark"
    >
      {/* Unified header: brand + tabs + controls on a single row */}
      <header className="flex items-stretch h-14 pl-3 pr-3 sm:pl-6 sm:pr-4 gap-2 sm:gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-sm transition-colors duration-300">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <DyaLogo className="w-7 h-7 sm:w-8 sm:h-8 [&_polygon]:fill-[var(--color-text)]" />
          <div className="hidden desktop:flex items-center gap-2">
            <span className="text-lg font-light tracking-widest text-[var(--color-text)]">
              DYA
            </span>
            <span className="text-xs font-light tracking-wider text-[var(--color-text-muted)] uppercase pt-1">
              Studio
            </span>
          </div>
        </div>

        {/* Tabs (scrollable so they never push out the controls) */}
        <Tabs.List className="flex-1 min-w-0 flex items-stretch justify-start gap-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className="tab-trigger flex items-center gap-2 whitespace-nowrap"
              title={tab.label}
            >
              <span className="opacity-70">{tab.icon}</span>
              <span className="hidden tablet:inline">{tab.label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Connection Status & Toggles */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {isConnected ? (
            <>
              <div className="hidden tablet:flex items-center gap-2">
                <div className="status-indicator connected flex-shrink-0" />
                <span className="text-sm text-[var(--color-text-secondary)] max-w-[10rem] truncate">
                  {deviceName || t("Connected")}
                </span>
              </div>
              <button
                onClick={onDisconnect}
                className="btn-ghost text-sm flex items-center gap-1.5 px-2 sm:px-3"
                title={t("Disconnect")}
                aria-label={t("Disconnect")}
              >
                <IconPlugConnectedX size={18} />
                <span className="hidden desktop:inline">{t("Disconnect")}</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => onConnect("serial")}
              disabled={isConnecting}
              className="btn-electric text-sm"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[var(--color-text-muted)] border-t-[var(--color-text)] rounded-full animate-spin" />
                  {t("Connecting...")}
                </span>
              ) : (
                t("Connect Keyboard")
              )}
            </button>
          )}
          <LanguageToggle />
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label={
              theme === "dark"
                ? t("Switch to light mode")
                : t("Switch to dark mode")
            }
          >
            {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className="h-full outline-none data-[state=inactive]:hidden"
            forceMount
          >
            <PageTransition transitionKey={activeTab === tab.id ? tab.id : ""}>
              {activeTab === tab.id ? tab.content : null}
            </PageTransition>
          </Tabs.Content>
        ))}
      </main>
    </Tabs.Root>
  );
}
