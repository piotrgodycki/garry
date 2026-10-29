import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Link, Redirect, Stack, useFocusEffect, useRouter } from "expo-router";
import { GarryError, type Feature, type LiveAsk, type LiveLane, type LiveView } from "garry-client";
import { useConnection } from "../lib/connection";
import { STAGES, usePalette, type State } from "../lib/theme";
import { Body, Button, Card, Chip, CrewFace, Label, Loading, Notice, Pill, Stages, Title } from "../lib/ui";

const WORD: Record<string, string> = { work: "Working", wait: "Needs you", fail: "Failed", done: "Ready" };
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`;
};

/**
 * Garry on the phone: what needs you first, answered right here; the agents
 * at work, each with its face; then the features Garry is driving.
 */
export default function Home() {
  const { ready, client, connection } = useConnection();
  const router = useRouter();
  const p = usePalette();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [live, setLive] = useState<LiveView | null>(null);
  const [error, setError] = useState<GarryError | Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const [f, l] = await Promise.all([client.features(), client.live(24).catch(() => null)]);
      setFeatures(f);
      setLive(l);
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, [client]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // while it is open, keep up with the agents
  useEffect(() => {
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  if (!ready) return <Loading />;
  if (!connection) return <Redirect href="/connect" />;

  const unpaired = error instanceof GarryError && error.unpaired;
  const lanes = (live?.lanes ?? []).filter((l) => l.state === "work" || l.state === "done");
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable accessibilityLabel="Settings" hitSlop={12} style={{ paddingHorizontal: 12 }}>
                <Body>Settings</Body>
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={s.page}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={p.muted} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={s.actions}>
          <View style={{ flex: 1 }}>
            <Button onPress={() => router.push("/new")}>New work</Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button kind="ghost" onPress={() => router.push("/feature/new")}>New feature</Button>
          </View>
        </View>

        {live && (
          <>
            <View style={s.between}>
              <Title>Needs you</Title>
              {live.needsYou.length > 0 && <Pill state="wait">{live.needsYou.length}</Pill>}
            </View>
            {live.needsYou.length === 0 ? (
              <Body muted>Nothing needs you. When an agent asks something or stops, it shows up here.</Body>
            ) : (
              live.needsYou.map((a) => <Ask key={`${a.threadId}:${a.at}`} ask={a} onDone={load} />)
            )}
            {lanes.length > 0 && <Title style={{ marginTop: 6 }}>Agents</Title>}
            {lanes.map((l) => (
              <Agent key={l.threadId} lane={l} />
            ))}
          </>
        )}

        <Title style={{ marginTop: 6 }}>Features</Title>
        {error ? (
          <Notice action={<Button onPress={() => (unpaired ? router.push("/connect") : void load())}>{unpaired ? "Pair again" : "Try again"}</Button>}>
            {unpaired ? "This phone is no longer paired with Garry. Run garry pair on your computer and scan the new code." : `Garry cannot be reached at ${connection.baseUrl}. Is garry serve running with --host, and are you on the same network?`}
          </Notice>
        ) : !features ? (
          <Loading />
        ) : features.length === 0 ? (
          <Notice>No features yet. Tap New feature to plant the first one.</Notice>
        ) : (
          features.map((f) => {
            const stage = STAGES.indexOf(f.status as (typeof STAGES)[number]);
            return (
              <Link key={f.id} href={{ pathname: "/feature/[id]", params: { id: f.id } }} asChild>
                <Pressable accessibilityRole="button" accessibilityLabel={`${f.id} ${f.title}`}>
                  <Card>
                    <View style={s.between}>
                      <Label>{f.id}</Label>
                      <Pill state={stage < 0 ? "done" : "work"}>{stage < 0 ? "Shipped" : f.status}</Pill>
                    </View>
                    <Body style={{ fontWeight: "600" }}>{f.title}</Body>
                    <View style={s.chips}>
                      {f.services.map((svc) => (
                        <Chip key={svc}>{svc}</Chip>
                      ))}
                    </View>
                    <Stages current={stage < 0 ? 7 : stage} />
                  </Card>
                </Pressable>
              </Link>
            );
          })
        )}
      </ScrollView>
    </>
  );
}

/** What needs you, in the agent's own words, answered right here. */
function Ask({ ask, onDone }: { ask: LiveAsk; onDone: () => Promise<void> }) {
  const { client } = useConnection();
  const p = usePalette();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const question = ask.kind === "question";
  const send = async (message: string) => {
    if (!client || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await client.sendMessage(ask.threadId, message.trim());
      setText("");
      await onDone();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card tone={question ? "wait" : "fail"}>
      <View style={s.who}>
        <CrewFace state={question ? "wait" : "fail"} />
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: "600" }}>{ask.title}</Body>
          <Body muted style={s.small}>
            {question ? "Asks a question" : "Stopped before finishing"} · {ago(ask.at)}
          </Body>
        </View>
      </View>
      <View style={[s.msg, { backgroundColor: p.surface2, borderColor: p.line }]}>
        <Body>{question || ask.text !== "Stopped before finishing" ? ask.text : "It did not say why. Let it fix what went wrong, or open the work to look."}</Body>
      </View>
      {question ? (
        <View style={s.answer}>
          <TextInput
            value={text}
            onChangeText={setText}
            editable={!busy}
            placeholder="Your answer"
            placeholderTextColor={p.muted}
            accessibilityLabel={`answer ${ask.title}`}
            style={[s.input, { color: p.text, borderColor: p.lineStrong, backgroundColor: p.surface }]}
            onSubmitEditing={() => void send(text)}
          />
          <Button disabled={busy || !text.trim()} onPress={() => void send(text)}>
            Send
          </Button>
        </View>
      ) : (
        <Button disabled={busy} onPress={() => void send("That stopped before finishing. Look at what went wrong, fix it, and finish the task.")}>
          Let it fix
        </Button>
      )}
      <Link href={{ pathname: "/thread/[id]", params: { id: ask.threadId } }} asChild>
        <Pressable accessibilityRole="link">
          <Body muted style={s.small}>
            Open the work
          </Body>
        </Pressable>
      </Link>
      {error ? <Body style={{ color: p.fail }}>{error}</Body> : null}
    </Card>
  );
}

/** One agent at work or with something ready: its face, what it does, its state. */
function Agent({ lane }: { lane: LiveLane }) {
  const state = (lane.state ?? "idle") as State;
  return (
    <Link href={{ pathname: "/thread/[id]", params: { id: lane.threadId } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${lane.title}, ${WORD[state] ?? "shipped"}`}>
        <Card>
          <View style={s.who}>
            <CrewFace state={state} />
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: "600" }} >{lane.title}</Body>
              <Body muted style={s.small}>
                {lane.doing ?? lane.project}
              </Body>
            </View>
            <Pill state={state}>{WORD[state] ?? "Shipped"}</Pill>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actions: { flexDirection: "row", gap: 10 },
  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  small: { fontSize: 13 },
  msg: { borderWidth: 1, borderRadius: 8, padding: 10 },
  answer: { gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
