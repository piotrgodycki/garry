import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Link, Redirect, Stack, useFocusEffect, useRouter } from "expo-router";
import { GarryError, type Feature, type Thread } from "garry-client";
import { useConnection } from "../lib/connection";
import { STAGES, usePalette } from "../lib/theme";
import { Body, Button, Card, Chip, Label, Loading, Notice, Stages, Title } from "../lib/ui";

/** The features Garry is driving, with the stage each one is at. */
export default function Home() {
  const { ready, client, connection } = useConnection();
  const router = useRouter();
  const p = usePalette();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [work, setWork] = useState<Thread[]>([]);
  const [error, setError] = useState<GarryError | Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const [f, w] = await Promise.all([client.features(), client.threads().catch(() => [])]);
      setFeatures(f);
      setWork(w);
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

  if (!ready) return <Loading />;
  if (!connection) return <Redirect href="/connect" />;

  const unpaired = error instanceof GarryError && error.unpaired;
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
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={p.text} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Button onPress={() => router.push("/new")}>New feature</Button>
        {work.length > 0 && <Label>Work</Label>}
        {work.map((t) => (
          <Link key={t.id} href={{ pathname: "/thread/[id]", params: { id: t.id } }} asChild>
            <Pressable accessibilityRole="button">
              <Card>
                <View style={s.between}>
                  <Label live={t.status === "running"}>{t.status === "running" ? "Working" : t.pr ? "PR open" : t.commit ? "Committed" : t.status === "error" ? "Stopped" : "Ready for review"}</Label>
                </View>
                <Title>{t.title}</Title>
                <Body muted>{t.branch}</Body>
              </Card>
            </Pressable>
          </Link>
        ))}
        <Label>Features</Label>
        {error ? (
          <Notice action={<Button onPress={() => (unpaired ? router.push("/connect") : void load())}>{unpaired ? "Pair again" : "Try again"}</Button>}>
            {unpaired ? "This phone is no longer paired with Garry. Run garry pair on your computer and scan the new code." : `Garry cannot be reached at ${connection.baseUrl}. Is garry serve running with --host, and are you on the same network?`}
          </Notice>
        ) : !features ? (
          <Loading />
        ) : features.length === 0 ? (
          <Notice>No features yet. Drop an idea on the dashboard to start one.</Notice>
        ) : (
          features.map((f) => {
            const stage = STAGES.indexOf(f.status as (typeof STAGES)[number]);
            return (
              <Link key={f.id} href={{ pathname: "/feature/[id]", params: { id: f.id } }} asChild>
                <Pressable accessibilityRole="button">
                  <Card>
                    <View style={s.between}>
                      <Label live={stage >= 0}>{f.id}</Label>
                      <Chip strong>{f.status}</Chip>
                    </View>
                    <Title>{f.title}</Title>
                    <View style={s.chips}>
                      {f.services.map((svc) => (
                        <Chip key={svc}>{svc}</Chip>
                      ))}
                    </View>
                    <Stages current={stage < 0 ? 7 : stage} />
                    <Body muted>{stage < 0 ? "Shipped" : `Stage ${stage + 1} of 7`}</Body>
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

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
