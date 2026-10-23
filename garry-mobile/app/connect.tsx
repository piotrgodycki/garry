import { useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useConnection } from "../lib/connection";
import { monoFamily, usePalette } from "../lib/theme";
import { Body, Button, Card, Label, Title } from "../lib/ui";

/** Pairs this phone with Garry: scan the QR code from garry serve --host or garry pair. */
export default function Connect() {
  const { connect } = useConnection();
  const router = useRouter();
  const p = usePalette();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const submit = async (value: string) => {
    if (busy || handled.current) return;
    handled.current = true;
    setBusy(true);
    setError(null);
    try {
      await connect(value);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch (e) {
      setError(String((e as Error).message ?? e));
      handled.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Title style={{ fontSize: 24 }}>Pair with your computer</Title>
      <Body muted>
        On the computer running Garry, start it with garry serve --host 0.0.0.0 (or run garry pair), or in the desktop app choose Devices, Pair a Device. Then scan the code it shows.
      </Body>

      <Card style={{ padding: 0 }}>
        {permission?.granted ? (
          <CameraView style={s.camera} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy ? undefined : ({ data }) => void submit(data)} />
        ) : (
          <View style={s.cameraOff}>
            <Body muted>The camera scans the pairing code. Nothing else is recorded.</Body>
            <Button onPress={() => void requestPermission()}>Allow camera</Button>
          </View>
        )}
      </Card>

      <Label>Or paste the pairing link</Label>
      <TextInput
        value={link}
        onChangeText={setLink}
        placeholder="http://192.168.1.20:8123/pair?code=..."
        placeholderTextColor={p.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[s.input, { color: p.text, borderColor: p.line, backgroundColor: p.surface }]}
      />
      <Button disabled={!link.trim() || busy} onPress={() => void submit(link)}>
        {busy ? "Pairing…" : "Pair"}
      </Button>
      {error ? <Body style={{ color: p.accent }}>{error}</Body> : null}
      <Body muted>Pairing gives this phone its own key. You can revoke it any time with garry devices revoke on your computer.</Body>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 14 },
  camera: { width: "100%", aspectRatio: 1 },
  cameraOff: { padding: 16, gap: 12, aspectRatio: 1.6, justifyContent: "center" },
  input: { borderWidth: 1, padding: 12, fontSize: 14, fontFamily: monoFamily },
});
