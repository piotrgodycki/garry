import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { Thread, ThreadDiff, ThreadEvent } from "garry-client";
import { useConnection } from "../../lib/connection";
import { mono, usePalette } from "../../lib/theme";
import { Body, Button, Card, Label, Loading } from "../../lib/ui";
import { confirmWithBiometrics } from "../../lib/biometrics";

/** One piece of work, live: the conversation with the agent, its changes, commit and pull request. */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useConnection();
  const p = usePalette();
  const [thread, setThread] = useState<Thread | null>(null);
  const [events, setEvents] = useState<ThreadEvent[]>([]);
  const [diff, setDiff] = useState<ThreadDiff | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const refresh = useCallback(async () => {
    if (!client || !id) return;
    const [{ thread }, d] = await Promise.all([client.thread(id), client.threadDiff(id).catch(() => null)]);
    setThread(thread);
    setDiff(d);
  }, [client, id]);

  useEffect(() => {
    if (!client || !id) return;
    const ctl = new AbortController();
    setEvents([]);
    void refresh();
    client
      .threadEvents(
        id,
        (e) => {
          setEvents((l) => [...l, e]);
          if (e.type === "status" || e.type === "git") void refresh();
        },
        ctl.signal,
      )
      .catch(() => undefined);
    return () => ctl.abort();
  }, [client, id, refresh]);

  const act = async (fn: () => Promise<unknown>, confirm?: string) => {
    if (confirm && !(await confirmWithBiometrics(confirm))) return;
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  if (!thread || !client) return <Loading />;
  const running = thread.status === "running";
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: thread.title }} />
      <ScrollView ref={scroll} contentContainerStyle={s.page} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {events.map((e, i) => {
          if (e.type === "user") return <View key={i} style={[s.user, { borderLeftColor: p.text, backgroundColor: p.faint }]}><Body style={{ fontWeight: "700" }}>{e.text}</Body></View>;
          if (e.type === "text") return <Body key={i}>{e.text}</Body>;
          if (e.type === "tool") return <Text key={i} style={[mono, s.tool, { color: p.muted }]}><Text style={{ color: p.text, fontWeight: "700" }}>{e.name}</Text> {e.summary}</Text>;
          if (e.type === "tool_result" && !e.ok) return <Text key={i} style={[mono, s.tool, { color: p.accent }]}>{e.preview}</Text>;
          if (e.type === "turn_end") return <Label key={i}>{e.ok ? "Turn done" : "Turn stopped"}</Label>;
          if (e.type === "git") return <Label key={i}>{e.action === "commit" ? `Committed ${e.detail.slice(0, 7)}` : "Pull request opened"}</Label>;
          if (e.type === "error") return <Body key={i} style={{ color: p.accent }}>{e.message}</Body>;
          return null;
        })}
        {running && <Label live>Working</Label>}

        <Card>
          <Label>Changes · {diff?.files.length ?? 0} {diff?.files.length === 1 ? "file" : "files"}</Label>
          {diff?.files.map((f) => (
            <Text key={f.path} style={[mono, { color: p.text, fontSize: 13 }]}>
              {f.path}  <Text style={{ color: p.muted }}>+{f.additions} −{f.deletions}</Text>
            </Text>
          ))}
          {thread.pr ? (
            <Button onPress={() => void Linking.openURL(thread.pr!.url)}>Open pull request #{thread.pr.number}</Button>
          ) : (
            <View style={{ gap: 8 }}>
              <Button disabled={running || !diff?.uncommitted} onPress={() => void act(() => client.commitThread(id, ""), "Commit these changes")}>Commit</Button>
              <Button kind="ghost" disabled={running || !thread.commit || Boolean(diff?.uncommitted)} onPress={() => void act(() => client.openPullRequest(id), "Open a pull request")}>Open pull request</Button>
            </View>
          )}
        </Card>
        {error ? <Body style={{ color: p.accent }}>{error}</Body> : null}
      </ScrollView>

      <View style={[s.composer, { borderTopColor: p.line, backgroundColor: p.bg }]}>
        <TextInput
          value={message}
          onChangeText={setMessage}
          editable={!running}
          placeholder={running ? "The agent is working…" : "Ask for a change…"}
          placeholderTextColor={p.muted}
          multiline
          style={[s.input, { color: p.text, borderColor: p.line, backgroundColor: p.surface }]}
        />
        {running ? (
          <Button kind="danger" onPress={() => void act(() => client.stopThread(id))}>Stop</Button>
        ) : (
          <Button disabled={!message.trim()} onPress={() => void act(async () => (await client.sendMessage(id, message), setMessage("")))}>Send</Button>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  user: { borderLeftWidth: 3, padding: 10 },
  tool: { fontSize: 12.5 },
  composer: { borderTopWidth: 1, padding: 12, gap: 8 },
  input: { borderWidth: 1, padding: 10, fontSize: 15, maxHeight: 120 },
});
