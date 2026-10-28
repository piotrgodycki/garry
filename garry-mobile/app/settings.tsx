import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useConnection } from "../lib/connection";
import { Body, Button, Card, Label } from "../lib/ui";
import { biometricsSupported } from "../lib/biometrics";
import { usePalette } from "../lib/theme";
import { disablePush, enablePush, pushWanted } from "../lib/push";

export default function Settings() {
  const { connection, client, forget, biometrics, setBiometrics } = useConnection();
  const router = useRouter();
  const p = usePalette();
  const [push, setPush] = useState(false);
  const [pushNote, setPushNote] = useState<string | null>(null);
  useEffect(() => void pushWanted().then(setPush), []);
  const togglePush = async (on: boolean) => {
    setPushNote(null);
    if (!on) {
      await disablePush(client);
      return setPush(false);
    }
    if (!client) return;
    try {
      const r = await enablePush(client);
      setPush(r.ok);
      if (!r.ok) setPushNote(r.reason);
    } catch (e) {
      setPushNote(String((e as Error).message ?? e));
    }
  };
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Card>
        <Label>Server</Label>
        <Body>{connection?.baseUrl ?? "Not connected"}</Body>
        <Label>This device</Label>
        <Body muted>{connection?.deviceId ?? "Not paired"}</Body>
      </Card>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Label>Notifications</Label>
          <Switch value={push} onValueChange={(on) => void togglePush(on)} trackColor={{ true: p.text }} />
        </View>
        <Body muted>When work needs you (a question, or it stopped) or is ready for review, even with Garry closed. They go through Expo&apos;s push service; your computer decides how much they say.</Body>
        {pushNote && <Body>{pushNote}</Body>}
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
          await disablePush(client);
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
