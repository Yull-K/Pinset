import { Stack } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConvexProvider client={convex}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "white" }} edges={["top", "bottom"]}>
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaView>
      </ConvexProvider>
    </SafeAreaProvider>
  );
}
