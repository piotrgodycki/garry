import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { RegistryService } from "garry-client";
import { useConnection } from "../../lib/connection";
import { usePalette } from "../../lib/theme";
import { Body, Button, Chip, Label, Title } from "../../lib/ui";
import { confirmWithBiometrics } from "../../lib/biometrics";

const CONTRACTS = ["events.json", "remotes.json", "shared-deps.json", "design-tokens.json", "api.json"];

/** Create a feature from the phone: what it is, why, and which services it touches. */
export default function CreateFeature() {
  const { client } = useConnection();
  const router = useRouter();
  const p = usePalette();
  const [services, setServices] = useState<RegistryService[] | null>(null);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [contracts, setContracts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client?.registry().then(
      (r) => setServices(r.services),
      () => setServices([]),
    );
  }, [client]);

  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const create = async () => {
    if (!client) return;
    if (!(await confirmWithBiometrics("Create a feature in Garry"))) return;
    setBusy(true);
    setError(null);
    try {
      const f = await client.createFeature({ title: title.trim(), goal: goal.trim() || undefined, services: picked, contractChanges: contracts });
      router.replace({ pathname: "/feature/[id]", params: { id: f.id } });
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const input = [s.input, { color: p.text, borderColor: p.lineStrong, backgroundColor: p.surface }];
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Title style={{ fontSize: 22 }}>New feature</Title>
      <Label>Feature</Label>
      <TextInput value={title} onChangeText={setTitle} placeholder="Quick cart in the header" placeholderTextColor={p.muted} maxLength={120} style={input} />
      <Label>Goal</Label>
      <TextInput
        value={goal}
        onChangeText={setGoal}
        placeholder="What should it do, for whom, and why."
        placeholderTextColor={p.muted}
        multiline
        textAlignVertical="top"
        style={[...input, s.goal]}
      />
      <Label>Services it touches</Label>
      {services && services.length === 0 ? (
        <Body muted>No services yet. Add them on your computer (Registry, Add service), or leave this for the plan stage.</Body>
      ) : (
        <View style={s.chips}>
          {(services ?? []).map((svc) => (
            <Pressable key={svc.name} onPress={() => setPicked((l) => flip(l, svc.name))} accessibilityRole="checkbox" accessibilityState={{ checked: picked.includes(svc.name) }}>
              <Chip strong={picked.includes(svc.name)}>{svc.name}</Chip>
            </Pressable>
          ))}
        </View>
      )}
      <Label>Contracts it changes</Label>
      <View style={s.chips}>
        {CONTRACTS.map((c) => (
          <Pressable key={c} onPress={() => setContracts((l) => flip(l, c))} accessibilityRole="checkbox" accessibilityState={{ checked: contracts.includes(c) }}>
            <Chip strong={contracts.includes(c)}>{c}</Chip>
          </Pressable>
        ))}
      </View>
      <Button disabled={!title.trim() || busy} onPress={() => void create()}>
        {busy ? "Creating…" : "Create feature"}
      </Button>
      {error ? <Body style={{ color: p.fail }}>{error}</Body> : null}
      <Body muted>It starts at the spec stage. Follow the agents on it from the feature list.</Body>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  goal: { minHeight: 120 },
});
