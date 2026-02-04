import { useState, useContext, useEffect } from "react";
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
import { ThemeProvider } from "./contexts/ThemeContext";
import { SerialConsoleProvider } from "./contexts/SerialConsoleContext";
import { useSerialConsoleContext } from "./contexts/SerialConsoleContextDef";
import { TabNavigation } from "./components/TabNavigation";
import type { TabItem } from "./components/TabNavigation";
import { AppLayout } from "./layouts/AppLayout";
import { BatteryPage } from "./pages/BatteryPage";
import { BLEConnectionsPage } from "./pages/BLEConnectionsPage";
import { HealthCheckPage } from "./pages/HealthCheckPage";
import { KeymapPage } from "./pages/KeymapPage";
import { TrackballPage } from "./pages/TrackballPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DebugConsolePage } from "./pages/DebugConsolePage";
import { DraggableWindow } from "./components/DraggableWindow";
import { SerialConsole } from "./components/SerialConsole";

function App() {
  return (
    <ThemeProvider>
      <SerialConsoleProvider>
        <DeviceConnectionProvider>
          <AppContent />
        </DeviceConnectionProvider>
      </SerialConsoleProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const connection = useContext(ConnectionContext);
  const consoleContext = useSerialConsoleContext();
  const [activeTab, setActiveTab] = useState("battery");
  const [showConsoleFallback, setShowConsoleFallback] = useState(false);

  // Tabs array - conditionally include debug console tab
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
    // Add debug console tab when connected to ZMK Studio
    ...(connection.isConnected
      ? [
          {
            id: "console",
            label: "Console",
            icon: <IconTerminal2 size={18} />,
            content: <DebugConsolePage />,
          },
        ]
      : []),
  ];

  // Handle tab changes - move console to/from window
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);

    // If switching away from console tab while console has active connection
    if (
      activeTab === "console" &&
      tabId !== "console" &&
      consoleContext.hasActiveConnection
    ) {
      consoleContext.showAsWindow();
    }

    // If switching to console tab while console is in window
    if (tabId === "console" && consoleContext.position === "window") {
      consoleContext.showInTab();
    }
  };

  // Monitor ZMK connection errors and show console fallback
  useEffect(() => {
    if (!connection.isConnected && connection.error && !connection.isLoading) {
      // Check if this is an unexpected error (not user cancellation)
      if (
        !connection.error.includes("cancelled") &&
        !connection.error.includes("User") &&
        !connection.error.includes("selected")
      ) {
        // Use setTimeout to avoid setState within effect
        setTimeout(() => {
          setShowConsoleFallback(true);
          consoleContext.showAsWindow();
        }, 0);
      }
    }
  }, [connection.error, connection.isConnected, connection.isLoading, consoleContext]);

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

      {/* Draggable Console Window */}
      {consoleContext.position === "window" && (
        <DraggableWindow
          open={true}
          onClose={() => {
            consoleContext.hide();
            setShowConsoleFallback(false);
          }}
          title="Serial Console"
        >
          <SerialConsole
            autoConnect={showConsoleFallback}
            onConnectionChange={(connected) =>
              consoleContext.setConnectionState(connected)
            }
          />
        </DraggableWindow>
      )}
    </>
  );
}

export default App;
