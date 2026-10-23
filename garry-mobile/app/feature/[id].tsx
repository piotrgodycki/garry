import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import type { LogEntry, Plan, PullRequest } from "garry-client";
import { useConnection } from "../../lib/connection";
import { mono, usePalette } from "../../lib/theme";
import { Body, Button, Card, Chip, Label, Loading, Notice, Title } from "../../lib/ui";

/** One feature live: the delegation order, what each agent is doing now, the pull requests. */
export default function FeatureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useConnection();
  const p = usePalette();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [now, setNow] = useState<string>("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const follow = useCallback(async () => {
    if (!client || !id) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setLog([]);
    setRunning(true);
    try {
      await client.stream(
        id,
        (e) => {
          if (e.type === "task") setNow(e.text);
          if (e.type === "log") setLog((l) => [e.entry, ...l].slice(0, 200));
          if (e.type === "done") setNow("All stages done.");
        },
        ctl.signal,
      );
    } catch (e) {
      if (!ctl.signal.aborted) setError(String((e as Error).message ?? e));
    } finally {
      if (abort.current === ctl) setRunning(false);
    }
  }, [client, id]);

  useEffect(() => {
    if (!client || !id) return;
    client.plan(id).then(setPlan, (e: Error) => setError(e.message));
    client.pullRequests(id).then(setPrs, () => setPrs([]));
    void follow();
    return () => abort.current?.abort();
  }, [client, id, follow]);

  if (error && !plan) return <Notice>{error}</Notice>;
  if (!plan) return <Loading />;

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Stack.Screen options={{ title: plan.feature.id }} />
      <Title style={{ fontSize: 22 }}>{plan.feature.title}</Title>

      <Card>
        <Label>Delegation order, contract first</Label>
        <View style={s.order}>
          {plan.order.map((svc, i) => (
            <View key={svc} style={s.orderItem}>
              {i > 0 && <Body muted>→</Body>}
              <Chip>{svc}</Chip>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <View style={s.between}>
          <Label live={running}>{running ? "Live" : "Work log"}</Label>
          {!running && (
            <Pressable onPress={() => void follow()} hitSlop={10}>
              <Body>Run again</Body>
            </Pressable>
          )}
        </View>
        {now ? <Body>{now}</Body> : null}
        {log.slice(0, 40).map((e, i) => (
          <View key={`${e.index}-${e.skill}-${i}`} style={[s.logRow, { borderTopColor: p.faint }]}>
            <Text style={[s.logWho, { color: p.text }]}>{e.who}</Text>
            <Text style={[s.logText, { color: p.muted }]}>
              {e.action} <Text style={mono}>({e.skill})</Text>
            </Text>
          </View>
        ))}
        {error ? <Body style={{ color: p.accent }}>{error}</Body> : null}
      </Card>

      <Card>
        <Label>Pull requests</Label>
        {prs.length === 0 ? (
          <Body muted>None yet.</Body>
        ) : (
          prs.map((pr) => (
            <View key={pr.service} style={[s.pr, { borderTopColor: p.faint }]}>
              <View style={s.between}>
                <Text style={[s.logWho, { color: p.text }]}>{pr.service}</Text>
                <Chip strong={pr.state === "open"}>{pr.state}</Chip>
              </View>
              <Body muted>
                {pr.branch} · checks {pr.checks}
              </Body>
              {pr.url ? <Button kind="ghost" onPress={() => void Linking.openURL(pr.url)}>Open on GitHub</Button> : null}
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  order: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  orderItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  logRow: { borderTopWidth: 1, paddingTop: 8, gap: 2 },
  logWho: { fontSize: 14, fontWeight: "700" },
  logText: { fontSize: 14, lineHeight: 19 },
  pr: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
});
