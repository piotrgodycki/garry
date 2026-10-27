import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useConnection } from "../lib/connection";
import { Body, Button, Card, Label } from "../lib/ui";
import { biometricsSupported } from "../lib/biometrics";
import { usePalette } from "../lib/theme";

export default function Settings() {
  const { connection, forget, biometrics, setBiometrics } = useConnection();
  const router = useRouter();
  const p = usePalette();
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Card>
        <Label>Server</Label>
        <Body>{connection?.baseUrl ?? "Not connected"}</Body>
        <Label>This device</Label>
        <Body muted>{connection?.deviceId ?? "Not paired"}</Body>
      </Card>
      {biometricsSupported && (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Label>Require Face ID</Label>
            <Switch value={biometrics} onValueChange={(on) => void setBiometrics(on)} trackColor={{ true: p.text }} />
          </View>
          <Body muted>Face ID unlocks Garry, guards its key to your computer, and confirms new work, commits and pull requests.</Body>
        </Card>
      )}
      <Button kind="ghost" onPress={() => router.push("/connect")}>Pair with another server</Button>
      <Button
        kind="danger"
        onPress={async () => {
          await forget();
          router.replace("/connect");
        }}
      >
        Forget this server
      </Button>
      <Body muted>Forgetting removes the key from this phone. To cut it off on the computer as well, run garry devices revoke there.</Body>
    </ScrollView>
  );
}

const s = StyleSheet.create({ page: { padding: 16, gap: 12 } });
