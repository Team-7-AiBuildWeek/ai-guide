/**
 * The whole flow, in order — the website's TourFlow, natively.
 *
 *   start -> brief -> points -> generating -> headphones -> tour
 *
 * The map is mounted once and never torn down; only the sheet's contents and
 * height change, so the first screen becomes the second without a transition.
 */

import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Location from "expo-location";
import { Redirect, router, useFocusEffect } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/Glass";
import Sheet, { type SheetHeight } from "@/components/Sheet";
import TourMap from "@/components/TourMap";
import { Btn, Eyebrow, TextLink } from "@/components/ui";
import Brief, { BriefFooter } from "@/components/flow/Brief";
import Generating from "@/components/flow/Generating";
import Headphones from "@/components/flow/Headphones";
import { MiniPlayer, Player } from "@/components/flow/Players";
import Points, { CityPicker, PointsFooter } from "@/components/flow/Points";
import { AskAnything, Directions, StopRow, TurnCard } from "@/components/flow/Walk";
import { ask, buildTour, cityAt } from "@/lib/api";
import {
  clearTour,
  EMPTY_DRAFT,
  loadDraft,
  loadProgress,
  loadTour,
  resetDraft,
  saveDraft,
  saveProgress,
  saveTour,
  tourMinutes,
} from "@/lib/flow";
import { distanceMeters, nextTurn, routePoints, TRUSTED_M } from "@/lib/geo";
import Greeting from "@/components/Greeting";
import { accountsEnabled } from "@/lib/accounts";
import { welcomed } from "@/lib/auth";
import { rememberWalk, takeRebuild } from "@/lib/history";
import { normaliseLang, speechLocale } from "@/lib/languages";
import { prefetchSpeech, useNarration } from "@/lib/narration";
import { t } from "@/lib/strings";
import { colors, fonts, size, type } from "@/lib/theme";
import type { City, Draft, Fix, Stage, StoredTour, TourPlan, TourPreview, TourRequest } from "@/lib/types";

/** Bratislava, until the walker is found. */
const DEFAULT_CENTER = { lat: 48.1435, lng: 17.1077 };
const CITY_RADIUS_M = 30_000;
const PIN_PAUSE_MS = 1000;
const ARRIVAL_M = 35;
const INSET_MINI = 150;
const INSET_PLAYER = 420;

function useLiveLocation(): { fix: Fix | null; denied: boolean } {
  const [fix, setFix] = useState<Fix | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setDenied(true);
        return;
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3 },
        (pos) =>
          setFix({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 999,
          }),
      );
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);
  return { fix, denied };
}

/** The welcome screen comes first, once; after that the app opens on the map. */
export default function Home() {
  const [seen] = useState(welcomed);
  return seen ? <Flow /> : <Redirect href="/welcome" />;
}

function Flow() {
  const insets = useSafeAreaInsets();
  // Whatever the last session left behind, read once as the screen is made.
  const [restored] = useState(() => {
    const saved = loadTour();
    const draft = loadDraft() ?? { ...EMPTY_DRAFT, lang: normaliseLang(Intl.DateTimeFormat().resolvedOptions().locale) };
    return { saved, draft, index: saved ? Math.min(loadProgress(), saved.plan.stops.length - 1) : 0 };
  });
  const [stage, setStage] = useState<Stage>(restored.saved ? "tour" : "start");
  const [draft, setDraft] = useState<Draft>(restored.draft);
  const [tour, setTour] = useState<StoredTour | null>(restored.saved);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  const [pinLanded, setPinLanded] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [phase, setPhase] = useState("stops");
  const [phaseMessage, setPhaseMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<TourPreview | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  /** Built, with the itinerary still on screen until "Continue to tour". */
  const [ready, setReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(restored.index);
  const [askOpen, setAskOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [sheetDrag, setSheetDrag] = useState<SheetHeight | null>(null);
  const [detectingCity, setDetectingCity] = useState(false);
  const [cityPinned, setCityPinned] = useState<City | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [justArrived, setJustArrived] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cityLookup = useRef(false);
  const arrived = useRef<Set<string>>(new Set());
  const pinPause = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fix, denied } = useLiveLocation();

  // The screens that are forms take the whole screen; the tour wants the map.
  const sheetFull =
    stage === "brief" || stage === "points" || stage === "generating" || stage === "headphones" || (stage === "tour" && askOpen);
  // A new screen starts at its own height rather than inheriting a drag.
  const screenKey = `${stage}:${askOpen}`;
  const [shownScreen, setShownScreen] = useState(screenKey);
  if (screenKey !== shownScreen) {
    setShownScreen(screenKey);
    setSheetDrag(null);
  }
  const sheetHeight: SheetHeight = sheetDrag ?? (sheetFull ? "full" : "collapsed");
  const playerOpen = stage === "tour" && !askOpen && sheetHeight !== "collapsed";

  // ------------------------------------------------------------ restore --
  const generateRef = useRef<(again?: { req: TourRequest; plan: TourPlan }) => void>(() => {});

  useEffect(
    () => () => {
      if (pinPause.current) clearTimeout(pinPause.current);
    },
    [],
  );

  // A walk asked for again from the profile wins over the one in progress.
  useFocusEffect(
    useCallback(() => {
      const again = takeRebuild();
      if (again) {
        setDraft((prev) => ({ ...prev, lang: again.req.lang }));
        generateRef.current(again);
      }
    }, []),
  );

  const patchDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
  }, []);

  useEffect(() => {
    saveProgress(currentIndex);
  }, [currentIndex]);

  // ------------------------------------------------------------ generate --
  const generate = useCallback(
    async (again?: { req: TourRequest; plan: TourPlan }) => {
      if (!again && !draft.start) return;
      setStage("generating");
      setReady(false);
      setPhase("stops");
      setPhaseMessage(null);
      setGenError(null);
      setPreview(null);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort("timeout"), 180_000);

      const req: TourRequest = again?.req ?? {
        freeText: draft.freeText.trim() || undefined,
        city: draft.city ?? undefined,
        durationMinutes: draft.durationMinutes,
        detail: draft.detail,
        pace: draft.pace,
        interests: draft.interests,
        start: draft.start!,
        end: draft.end ?? undefined,
        lang: draft.lang,
      };

      try {
        const built = await buildTour(
          req,
          again?.plan,
          (evt) => {
            if (evt.opening) prefetchSpeech(evt.opening, req.lang);
            setPhase(evt.phase);
            if (evt.message) setPhaseMessage(evt.message);
            if (evt.preview) setPreview(evt.preview);
          },
          controller.signal,
        );
        setTour(built);
        saveTour(built);
        rememberWalk(built);
        arrived.current.clear();
        setCurrentIndex(0);
        // Stay on the itinerary: the walker reads the stops, then continues.
        setPreview(
          (p) =>
            p ?? { title: built.plan.title, summary: built.plan.summary, stops: built.plan.stops.map((x) => ({ name: x.name, angle: x.angle })) },
        );
        setReady(true);
      } catch (err) {
        if (controller.signal.aborted) {
          if (controller.signal.reason !== "cancelled") setGenError("Generation took too long and was stopped.");
          return;
        }
        setGenError(err instanceof Error ? err.message : "Could not build the tour.");
      } finally {
        clearTimeout(timeout);
      }
    },
    [draft],
  );
  useEffect(() => {
    generateRef.current = generate;
  }, [generate]);

  // ---------------------------------------------------------------- city --
  useEffect(() => {
    if (!fix || cityLookup.current || cityPinned) return;
    const known = draft.city;
    if (known && distanceMeters(fix, known) < CITY_RADIUS_M) return;
    cityLookup.current = true;
    // Deferred a tick: this is about to wait on the network regardless.
    queueMicrotask(() => setDetectingCity(true));
    cityAt(fix.lat, fix.lng, draft.lang)
      .then((c) => {
        if (c) patchDraft({ city: c });
      })
      .finally(() => {
        setDetectingCity(false);
        cityLookup.current = false;
      });
  }, [fix, draft.city, draft.lang, cityPinned, patchDraft]);

  const chooseCity = useCallback(
    (c: City) => {
      setCityPinned(c);
      const inCity = (p: { lat: number; lng: number } | null) => !!p && distanceMeters(p, c) < CITY_RADIUS_M;
      patchDraft({
        city: c,
        start: inCity(draft.start) ? draft.start : { lat: c.lat, lng: c.lng, label: c.name },
        end: inCity(draft.end) ? draft.end : null,
      });
    },
    [patchDraft, draft.start, draft.end],
  );

  // ------------------------------------------------------------ the walk --
  const route = useMemo(() => routePoints(tour?.route), [tour]);
  const stops = useMemo(
    () => tour?.plan.stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng })) ?? [],
    [tour],
  );
  const currentStop = tour?.plan.stops[currentIndex] ?? null;
  const turn = useMemo(() => nextTurn(route, tour?.maneuvers, fix), [route, tour?.maneuvers, fix]);
  const rideToCurrent = tour?.rides?.find((r) => r.to === currentIndex + 1) ?? null;
  const distanceToStop = fix && currentStop ? distanceMeters(fix, currentStop) : null;

  const advance = useCallback(() => {
    setCurrentIndex((i) => Math.min((tour?.plan.stops.length ?? 1) - 1, i + 1));
  }, [tour]);

  const audio = useNarration({
    tour,
    lang: draft.lang,
    index: currentIndex,
    onAdvance: advance,
    active: stage === "tour",
    warm: stage === "headphones" || (stage === "generating" && ready),
    album: draft.city?.name,
  });

  const pauseAll = audio.pauseAll;
  useEffect(() => {
    if (askOpen) pauseAll();
  }, [askOpen, pauseAll]);

  // Arrival: the nearest unheard stop within 35 m, once the fix can be trusted.
  useEffect(() => {
    if (stage !== "tour" || !autoAdvance || !tour || !fix || fix.accuracy > TRUSTED_M) return;
    let best: { index: number; name: string; id: string; d: number } | null = null;
    tour.plan.stops.forEach((s, i) => {
      if (arrived.current.has(s.id)) return;
      const d = distanceMeters(fix, s);
      if (d <= ARRIVAL_M && (!best || d < best.d)) best = { index: i, name: s.name, id: s.id, d };
    });
    if (!best) return;
    const found = best as { index: number; name: string; id: string };
    arrived.current.add(found.id);
    tour.plan.stops.slice(0, found.index).forEach((s) => arrived.current.add(s.id));
    if (found.index !== currentIndex) setCurrentIndex(found.index);
    setJustArrived(found.name);
  }, [fix, stage, autoAdvance, tour, currentIndex]);

  useEffect(() => {
    if (!justArrived) return;
    const id = setTimeout(() => setJustArrived(null), 6000);
    return () => clearTimeout(id);
  }, [justArrived]);

  const chooseStop = useCallback(
    (index: number) => {
      if (!tour) return;
      tour.plan.stops.slice(0, index).forEach((s) => arrived.current.add(s.id));
      setCurrentIndex(index);
      setJustArrived(null);
    },
    [tour],
  );

  // The screen stays awake for as long as the walk is running.
  useEffect(() => {
    if (stage !== "tour") return;
    void activateKeepAwakeAsync("walk");
    return () => void deactivateKeepAwake("walk");
  }, [stage]);

  const askQuestion = useCallback(
    (question: string) =>
      ask({
        question,
        lang: draft.lang,
        freeText: draft.freeText || undefined,
        interests: draft.interests,
        detail: draft.detail,
        city: draft.city?.label,
        tourTitle: tour?.plan.title,
        stopName: currentStop?.name,
        stopContext: audio.script ?? currentStop?.script,
        lat: fix?.lat ?? currentStop?.lat,
        lng: fix?.lng ?? currentStop?.lng,
      }),
    [draft, tour, currentStop, audio.script, fix],
  );

  const speakCue = useCallback(
    (text: string) => {
      Speech.stop();
      Speech.speak(text, { language: speechLocale(draft.lang), rate: 0.95 });
    },
    [draft.lang],
  );

  /** Back goes exactly one step, and never destroys anything. */
  const goBack = useCallback(() => {
    if (askOpen) return setAskOpen(false);
    if (directionsOpen) return setDirectionsOpen(false);
    if (playerOpen) return setSheetDrag("collapsed");
    audio.pauseAll();
    setStage("start");
  }, [askOpen, directionsOpen, playerOpen, audio]);

  const startOver = useCallback(() => {
    audio.pauseAll();
    clearTour();
    arrived.current.clear();
    setTour(null);
    setDraft((d) => resetDraft(d.lang));
    setPreview(null);
    setPicking(null);
    setStage("start");
    setAskOpen(false);
    setDirectionsOpen(false);
    setCurrentIndex(0);
  }, [audio]);

  // ---------------------------------------------------------------- view --
  const sheetHidden = picking !== null && stage === "points";
  const pins = useMemo(() => {
    const out: { kind: "start" | "end"; point: NonNullable<Draft["start"]> }[] = [];
    if (stage !== "points") return out;
    if (draft.start) out.push({ kind: "start", point: draft.start });
    if (draft.end) out.push({ kind: "end", point: draft.end });
    return out;
  }, [stage, draft.start, draft.end]);

  const top = Math.max(16, insets.top);
  const onWalkMap = stage === "tour" && !askOpen && sheetHeight !== "full";

  return (
    <View style={styles.screen}>
      <TourMap
        center={DEFAULT_CENTER}
        fix={fix}
        route={stage === "tour" ? route : []}
        rides={stage === "tour" ? tour?.rides ?? [] : []}
        stops={stage === "tour" ? stops : []}
        currentStopIndex={stage === "tour" ? currentIndex : -1}
        onSelectStop={chooseStop}
        pins={pins}
        picking={picking !== null && !pinLanded}
        onPick={(p) => {
          const label = `Pin at ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
          patchDraft(picking === "end" ? { end: { ...p, label } } : { start: { ...p, label } });
          setPinLanded(true);
          if (pinPause.current) clearTimeout(pinPause.current);
          pinPause.current = setTimeout(() => {
            setPicking(null);
            setPinLanded(false);
          }, PIN_PAUSE_MS);
        }}
        bottomInset={sheetHeight === "full" ? 0 : sheetHeight === "collapsed" ? INSET_MINI : INSET_PLAYER}
        follow={stage !== "tour" && !cityPinned}
        lookAt={cityPinned && stage !== "tour" ? { lat: cityPinned.lat, lng: cityPinned.lng, key: cityPinned.label } : null}
        fitKey={stage === "tour" ? tour?.plan.title ?? null : null}
      />

      {/* The app's mark, top left, and the way into the profile. */}
      {stage === "start" && !sheetHidden ? (
        <View style={[styles.topBar, { top }]} pointerEvents="box-none">
          <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="My profile">
            <GlassSurface style={styles.logoButton}>
              <Image source={require("../../assets/logo.png")} style={styles.logo} />
            </GlassSurface>
          </Pressable>
        </View>
      ) : null}

      {/* Dropping a pin: the instruction and the way out. */}
      {sheetHidden ? (
        <View style={[styles.topBar, { top }]} pointerEvents="box-none">
          <GlassSurface tone="dark" style={styles.banner}>
            <Text style={styles.bannerText}>
              {pinLanded
                ? `${picking === "end" ? "End" : "Starting"} point set`
                : `Tap the map to place the ${picking === "end" ? "end" : "start"} point`}
            </Text>
            <Btn label="Cancel" onPress={() => setPicking(null)} />
          </GlassSurface>
        </View>
      ) : null}

      {/* Back, top left; the next turn, top right. */}
      {onWalkMap ? (
        <View style={[styles.topBar, styles.walkBar, { top }]} pointerEvents="box-none">
          <Btn
            variant="glass"
            label="←"
            onPress={goBack}
            accessibilityLabel={directionsOpen ? "Close directions" : "Leave the tour"}
            textStyle={{ fontSize: 20 }}
          />
          {turn ? (
            <TurnCard
              kind={turn.maneuver.kind}
              meters={turn.meters}
              street={turn.maneuver.street}
              onOpen={() => setDirectionsOpen((o) => !o)}
            />
          ) : (
            <Btn variant="glassDark" label="⚑" onPress={() => setDirectionsOpen((o) => !o)} accessibilityLabel="Walking directions" />
          )}
        </View>
      ) : null}

      {onWalkMap && directionsOpen && currentStop ? (
        <View style={[styles.topBar, { top }]}>
          <Directions
            stop={currentStop}
            cue={(audio.cue ?? currentStop.walkingCueToHere ?? "").trim()}
            distanceMeters={distanceToStop}
            accuracy={fix?.accuracy ?? null}
            turnInstruction={turn?.maneuver.instruction}
            turnMeters={turn?.meters}
            ride={rideToCurrent}
            onClose={() => setDirectionsOpen(false)}
            onSpeak={speakCue}
          />
        </View>
      ) : null}

      {/* Arrival, and the switch that turns it off. */}
      {onWalkMap && !directionsOpen ? (
        <View style={[styles.arrival, { top: top + 130 }]} pointerEvents="box-none">
          {justArrived ? (
            <GlassSurface tone="dark" style={styles.arrived}>
              <Eyebrow style={{ color: colors.onDarkMute }}>You&apos;ve arrived</Eyebrow>
              <Text style={[styles.bannerText, { fontSize: size.lead, marginTop: 4 }]}>{justArrived}</Text>
            </GlassSurface>
          ) : null}
          <Btn
            small
            variant={autoAdvance ? "primary" : "quiet"}
            label={autoAdvance ? "Auto-play" : "Manual"}
            onPress={() => setAutoAdvance((v) => !v)}
            accessibilityLabel={
              autoAdvance
                ? "Auto-play when you arrive at a stop. Switch to manual."
                : "Stops are played manually. Switch to auto-play on arrival."
            }
          />
        </View>
      ) : null}

      {denied && stage === "start" ? (
        <View style={[styles.topBar, { top: top + 64 }]}>
          <GlassSurface tone="dark" style={styles.banner}>
            <Text style={[styles.bannerText, { flex: 1 }]}>
              Location is off. Choose a city below, or allow location for Walk in Settings.
            </Text>
          </GlassSurface>
        </View>
      ) : null}

      {sheetHidden ? null : (
        <Sheet
          height={sheetHeight}
          onHeightChange={stage === "tour" && !askOpen ? setSheetDrag : undefined}
          title={
            stage === "brief"
              ? t("brief.title")
              : stage === "points"
                ? t("points.title")
                : stage === "tour" && askOpen
                  ? "Ask anything"
                  : undefined
          }
          onCollapse={
            stage === "brief"
              ? () => setStage("start")
              : stage === "points"
                ? () => setStage("brief")
                : stage === "tour" && askOpen
                  ? () => setAskOpen(false)
                  : stage === "tour"
                    ? () => setSheetDrag("collapsed")
                    : undefined
          }
          footer={
            stage === "brief" ? (
              <BriefFooter onChange={patchDraft} onContinue={() => setStage("points")} />
            ) : stage === "points" ? (
              <PointsFooter draft={draft} onContinue={() => void generate()} />
            ) : undefined
          }
          collapsedContent={
            stage === "tour" && tour ? (
              <MiniPlayer
                stopName={currentStop?.name ?? ""}
                index={currentIndex}
                total={tour.plan.stops.length}
                audio={audio}
                onExpand={() => setSheetDrag("half")}
                onAsk={() => setAskOpen(true)}
              />
            ) : tour ? (
              <View>
                <Eyebrow>{t("landing.paused")}</Eyebrow>
                <Text style={[type.h3, { marginTop: 4 }]}>{tour.plan.title}</Text>
                <Text style={[type.body, { marginTop: 8 }]}>
                  {t("landing.stopOf", { n: currentIndex + 1, total: tour.plan.stops.length })} ·{" "}
                  {tour.plan.stops[currentIndex]?.name}
                </Text>
                <Btn variant="primary" large label={t("landing.carryOn")} onPress={() => setStage("tour")} style={{ marginTop: 16 }} />
                <TextLink label={t("landing.different")} onPress={startOver} style={{ marginTop: 8 }} />
              </View>
            ) : (
              <View>
                {accountsEnabled ? <Greeting /> : null}
                <Text style={type.h3}>
                  {draft.city ? t("landing.walkCity", { city: draft.city.name }) : t("landing.walkAnywhere")}
                </Text>
                <Text style={[type.body, { marginTop: 8 }]}>{t("landing.pitch")}</Text>
                <Btn variant="primary" large label={t("landing.build")} onPress={() => setStage("brief")} style={{ marginTop: 16 }} />
                {cityOpen ? (
                  <View style={{ marginTop: 12 }}>
                    <CityPicker
                      city={draft.city}
                      detecting={detectingCity}
                      lang={draft.lang}
                      open
                      onOpenChange={setCityOpen}
                      onChange={chooseCity}
                    />
                  </View>
                ) : (
                  <Btn large label={t("landing.chooseCity")} onPress={() => setCityOpen(true)} style={{ marginTop: 12 }} />
                )}
              </View>
            )
          }
        >
          {stage === "brief" ? (
            <Brief draft={draft} onChange={patchDraft} />
          ) : stage === "points" ? (
            <Points
              draft={draft}
              onChange={patchDraft}
              fix={fix}
              onPick={(target) => setPicking(target)}
              detectingCity={detectingCity}
              onCity={chooseCity}
            />
          ) : stage === "generating" ? (
            <Generating
              phase={phase}
              message={phaseMessage}
              preview={preview}
              error={genError}
              onCancel={() => {
                abortRef.current?.abort("cancelled");
                setStage("points");
              }}
              onRetry={() => void generate()}
              onContinue={ready && tour ? () => setStage("headphones") : undefined}
            />
          ) : stage === "headphones" && tour ? (
            <Headphones
              title={tour.plan.title}
              stopCount={tour.plan.stops.length}
              minutes={tourMinutes(tour) || draft.durationMinutes}
              onStart={() => {
                audio.start();
                setStage("tour");
              }}
            />
          ) : stage === "tour" && tour && askOpen ? (
            <AskAnything onAsk={askQuestion} />
          ) : stage === "tour" && tour && currentStop ? (
            <View style={{ gap: 16 }}>
              <Player
                stop={currentStop}
                index={currentIndex}
                total={tour.plan.stops.length}
                lang={tour.req?.lang ?? draft.lang}
                audio={audio}
              />
              <StopRow
                plan={tour.plan}
                currentIndex={currentIndex}
                onPrev={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                onNext={() => setCurrentIndex((i) => Math.min(tour.plan.stops.length - 1, i + 1))}
                onAsk={() => setAskOpen(true)}
              />
            </View>
          ) : null}
        </Sheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  topBar: { position: "absolute", left: 16, right: 16 },
  walkBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  logoButton: { width: 48, height: 48, borderRadius: 24, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  logo: { width: 48, height: 48 },
  banner: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bannerText: { flexShrink: 1, fontFamily: fonts.display, fontSize: size.body, color: colors.onDark },
  arrival: { position: "absolute", left: 16, right: 16, alignItems: "flex-end", gap: 8 },
  arrived: { alignSelf: "stretch", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12 },
});
