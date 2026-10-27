import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { Project } from "garry-client";
import { useConnection } from "../lib/connection";
import { usePalette } from "../lib/theme";
import { Body, Button, Chip, Label, Loading, Notice, Title } from "../lib/ui";
import { confirmWithBiometrics } from "../lib/biometrics";

/** Start work from the phone: pick the project, say what should change. */
export default function NewWork() {
  const { client } = useConnection();
  const router = useRouter();
  const p = usePalette();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client?.projects().then(
      (list) => {
        setProjects(list);
        setProjectId(list[0]?.id ?? "");
      },
      (e: Error) => setError(e.message),
    );
  }, [client]);

  const start = async () => {
    if (!client) return;
    if (!(await confirmWithBiometrics("Start new work in Garry"))) return;
    setBusy(true);
    setError(null);
    try {
      const t = await client.createThread(projectId, prompt);
      router.replace({ pathname: "/thread/[id]", params: { id: t.id } });
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!projects) return error ? <Notice>{error}</Notice> : <Loading />;
  if (!projects.length) return <Notice>No projects yet. On your computer, run garry serve inside a repository, or garry projects add &lt;path&gt;.</Notice>;
  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Title style={{ fontSize: 22 }}>What should change?</Title>
      <Label>Project</Label>
      <View style={s.chips}>
        {projects.map((pr) => (
          <Pressable key={pr.id} onPress={() => setProjectId(pr.id)} accessibilityRole="radio" accessibilityState={{ selected: pr.id === projectId }}>
            <Chip strong={pr.id === projectId}>{pr.name}</Chip>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="For example: add a dark mode toggle to the settings page."
        placeholderTextColor={p.muted}
        multiline
        textAlignVertical="top"
        style={[s.input, { color: p.text, borderColor: p.line, backgroundColor: p.surface }]}
      />
      <Button disabled={!prompt.trim() || !projectId || busy} onPress={() => void start()}>
        {busy ? "Starting…" : "Start"}
      </Button>
      {error ? <Body style={{ color: p.accent }}>{error}</Body> : null}
      <Body muted>An agent on your computer works on it in its own branch. Follow it here, then commit and open the pull request.</Body>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { borderWidth: 1, padding: 12, fontSize: 16, minHeight: 140 },
});
