import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState, type ReactNode } from "react";
import { PageTransition } from "./PageTransition";

export interface TabItem {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
}

interface TabNavigationProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

/**
 * 【2026-07-27 修正】タブを離れてもページをアンマウントしない。
 *
 * 以前は `activeTab === tab.id ? tab.content : null` としていたため、タブを
 * 移動するたびにそのページの全フックが破棄→再生成されていた。これが
 * 「タブを移動するとキー入力を受け付けなくなり、しばらくすると切断する」
 * の直接原因で、具体的には次の2つが同時に起きていた:
 *
 * 1. useInputStream のクリーンアップはアンマウント時に disableStream を
 *    fire-and-forget で投げるだけだった。従って計測中にInsightsタブを
 *    離れると、送信完了を待たずにコンポーネントが消えるため、キーボードが
 *    ストリームモードのまま取り残され→打鍵がホストに届かない。
 * 2. 戻ってきたタブではキーマップ/設定/バッテリー履歴/診断などの
 *    自動取得RPCが一斉に再発行され、BLEの遅い回線でキューが詰まって
 *    タイムアウト→GATT切断に至る。
 *
 * 訪問済みのタブだけをマウントし続ける（=初回訪問時にのみマウント）ことで、
 * 接続直後に全タブ分のRPCが一斉に走るのを避けつつ、タブ往復での
 * 再マウントをなくす。PageTransition の key はタブID固定にして、
 * 非アクティブ化で motion.div が差し替わって子が崩れないようにする。
 */
export function TabNavigation({
  tabs,
  activeTab,
  onTabChange,
}: TabNavigationProps) {
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<string>>(
    () => new Set([activeTab]),
  );

  useEffect(() => {
    setVisitedTabs((previous) => {
      if (previous.has(activeTab)) return previous;
      const next = new Set(previous);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={onTabChange}
      className="flex flex-col h-full"
    >
      {/* Tab List */}
      <Tabs.List className="flex items-center justify-center gap-1 px-6 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50 backdrop-blur-sm overflow-x-auto scrollbar-none transition-colors duration-300">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className="tab-trigger flex items-center gap-2 whitespace-nowrap"
          >
            <span className="opacity-70">{tab.icon}</span>
            <span className="hidden tablet:inline">{tab.label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {tabs.map((tab) => (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className="h-full outline-none data-[state=inactive]:hidden"
            forceMount
          >
            <PageTransition transitionKey={tab.id}>
              {visitedTabs.has(tab.id) ? tab.content : null}
            </PageTransition>
          </Tabs.Content>
        ))}
      </div>
    </Tabs.Root>
  );
}
