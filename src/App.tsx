import { useState, useContext, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconBattery2,
  IconBluetooth,
  IconHeartRateMonitor,
  IconKeyboard,
  IconPointer,
  IconSettings,
  IconTerminal2,
} from "@tabler/icons-react";

import { SplashScreen } from "./components/SplashScreen";
import {
  DeviceConnectionProvider,
  ConnectionContext,
} from "./components/DeviceConnection";
import { ConsoleContext } from "./contexts/ConsoleContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ConsoleProvider } from "./contexts/ConsoleContext";
import { TabNavigation } from "./components/TabNavigation";
import type { TabItem } from "./components/TabNavigation";
import { AppLayout } from "./layouts/AppLayout";
import { BatteryPage } from "./pages/BatteryPage";
import { BLEConnectionsPage } from "./pages/BLEConnectionsPage";
import { HealthCheckPage } from "./pages/HealthCheckPage";
import { KeymapPage } from "./pages/KeymapPage";
import { TrackballPage } from "./pages/TrackballPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ConsolePage } from "./pages/ConsolePage";

const tabs: TabItem[] = [
  {
    id: "battery",
    label: "Battery",
    icon: <IconBattery2 size={18} />,
    content: <BatteryPage />,
  },
  {
    id: "ble",
    label: "BLE",
    icon: <IconBluetooth size={18} />,
    content: <BLEConnectionsPage />,
  },
  {
    id: "health",
    label: "Health",
    icon: <IconHeartRateMonitor size={18} />,
    content: <HealthCheckPage />,
  },
  {
    id: "keymap",
    label: "Keymap",
    icon: <IconKeyboard size={18} />,
    content: <KeymapPage />,
  },
  {
    id: "trackball",
    label: "Trackball",
    icon: <IconPointer size={18} />,
    content: <TrackballPage />,
  },
  {
    id: "settings",
    label: "Settings",
    icon: <IconSettings size={18} />,
    content: <SettingsPage />,
  },
  {
    id: "console",
    label: "Console",
    icon: <IconTerminal2 size={18} />,
    content: <ConsolePage />,
  },
];

function App() {
  return (
    <ThemeProvider>
      <ConsoleProvider>
        <DeviceConnectionProvider>
          <AppContent />
        </DeviceConnectionProvider>
      </ConsoleProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const connection = useContext(ConnectionContext);
  const consoleContext = useContext(ConsoleContext);
  const [activeTab, setActiveTab] = useState("battery");

  const handleTabChange = useCallback(
    (tabId: string) => {
      // Handle console tab transitions
      if (activeTab === "console" && tabId !== "console") {
        // Leaving console tab - convert to window mode
        consoleContext?.exitToWindowMode();
      } else if (activeTab !== "console" && tabId === "console") {
        // Entering console tab - restore snap state
        consoleContext?.restoreSnapState();
      }
      setActiveTab(tabId);
    },
    [activeTab, consoleContext],
  );

  return (
    <>
      <AnimatePresence>
        {!connection.isConnected && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SplashScreen
              onConnect={connection.onConnect}
              onConnectWithFallback={connection.onConnectWithFallback}
              isConnecting={connection.isLoading}
              error={connection.error}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {connection.isConnected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="h-screen"
        >
          <AppLayout
            isConnected={connection.isConnected}
            deviceName={connection.deviceName}
            onConnect={connection.onConnect}
            onDisconnect={connection.onDisconnect}
            isConnecting={connection.isLoading}
          >
            <TabNavigation
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </AppLayout>
        </motion.div>
      )}
    </>
  );
}

export default App;
