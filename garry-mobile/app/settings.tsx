import { ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useConnection } from "../lib/connection";
import { Body, Button, Card, Label } from "../lib/ui";

export default function Settings() {
  const { connection, forget } = useConnection();
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Card>
        <Label>Server</Label>
        <Body>{connection?.baseUrl ?? "Not connected"}</Body>
        <Label>This device</Label>
        <Body muted>{connection?.deviceId ?? "Not paired"}</Body>
      </Card>
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
