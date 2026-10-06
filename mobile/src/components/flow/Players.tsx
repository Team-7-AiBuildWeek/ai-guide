/**
 * The walk's two players, as on the website: the MiniPlayer that is the
 * collapsed sheet, and the Player shown when the sheet is dragged open — stop
 * photo, scrubber, −15 / Play / +15, and the narration to read along.
 */

import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { Btn, Eyebrow } from "@/components/ui";
import { stopPhoto } from "@/lib/api";
import type { Narration } from "@/lib/narration";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { Stop, StopPhoto as Photo } from "@/lib/types";

function mmss(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function Icon({ ios, glyph, color = colors.ink, size: px = 20 }: { ios: string; glyph: string; color?: string; size?: number }) {
  return (
    <SymbolView
      name={{ ios, android: "circle", web: "circle" } as never}
      size={px}
      tintColor={color}
      fallback={<Text style={{ fontSize: px * 0.8, color }}>{glyph}</Text>}
    />
  );
}

export function MiniPlayer({
  stopName,
  index,
  total,
  audio,
  onExpand,
  onAsk,
}: {
  stopName: string;
  index: number;
  total: number;
  audio: Narration;
  onExpand: () => void;
  onAsk: () => void;
}) {
  const pct = audio.duration > 0 ? Math.min(100, (audio.position / audio.duration) * 100) : 0;
  return (
    <View style={styles.miniRow}>
      <Btn variant="primary" icon onPress={audio.toggle} accessibilityLabel={audio.playing ? "Pause" : "Play"}>
        {audio.preparing ? (
          <Text style={styles.dots}>…</Text>
        ) : (
          <Icon ios={audio.playing ? "pause.fill" : "play.fill"} glyph={audio.playing ? "❚❚" : "▶"} />
        )}
      </Btn>
      <Pressable
        onPress={onExpand}
        style={{ flex: 1 }}
        accessibilityRole="button"
        accessibilityLabel={`${stopName}, stop ${index + 1} of ${total}. Open the player.`}
      >
        <View style={styles.miniTop}>
          <Text numberOfLines={1} style={styles.miniName}>
            {stopName}
          </Text>
          <Text style={styles.miniTime}>
            {audio.preparing && audio.waitingFor
              ? audio.waitingFor
              : audio.duration > 0
                ? `${mmss(audio.position)} / ${mmss(audio.duration)}`
                : `${index + 1}/${total}`}
          </Text>
        </View>
        <View style={styles.miniTrack}>
          <View style={[styles.miniFill, { width: `${pct}%` }]} />
        </View>
      </Pressable>
      <Btn icon onPress={onAsk} accessibilityLabel="Ask anything">
        <Icon ios="bubble.left" glyph="💬" />
      </Btn>
    </View>
  );
}

function StopPhoto({ stop, lang }: { stop: Stop; lang: string }) {
  const [photo, setPhoto] = useState<{ id: string; photo: Photo | null }>({ id: "", photo: null });
  useEffect(() => {
    let live = true;
    void stopPhoto(stop, lang).then((p) => {
      if (live) setPhoto({ id: stop.id, photo: p });
    });
    return () => {
      live = false;
    };
  }, [stop, lang]);
  const shown = photo.id === stop.id ? photo.photo : null;
  if (!shown) return null;
  return (
    <View style={styles.photo}>
      <Image source={{ uri: shown.url }} style={styles.photoImage} resizeMode="cover" accessibilityLabel={stop.name} />
      <Pressable onPress={() => void Linking.openURL(shown.page)} style={styles.photoCaption}>
        <Text style={type.caption}>
          <Text style={{ textDecorationLine: "underline" }}>{shown.title}</Text> · Wikimedia
        </Text>
      </Pressable>
    </View>
  );
}

/** The word being spoken, lit, as the website's SpokenLine. */
function SpokenLine({ text, progress }: { text: string; progress: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const at = Math.min(words.length - 1, Math.floor(progress * words.length));
  return (
    <Text style={type.body}>
      {words.map((w, i) => (
        <Text
          key={i}
          style={
            i === at
              ? { backgroundColor: colors.mintWash, color: colors.mintInk }
              : { color: i < at ? colors.ink : colors.inkSoft }
          }
        >
          {w}{" "}
        </Text>
      ))}
    </Text>
  );
}

export function Player({
  stop,
  index,
  total,
  lang,
  audio,
}: {
  stop: Stop;
  index: number;
  total: number;
  lang: string;
  audio: Narration;
}) {
  const [showText, setShowText] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const pct = audio.duration > 0 ? Math.min(1, audio.position / audio.duration) : 0;
  const within =
    audio.chunkDuration > 0
      ? Math.max(0, Math.min(1, (audio.position - audio.chunkStart) / audio.chunkDuration))
      : 0;

  const seekAt = (e: GestureResponderEvent) => {
    if (audio.duration <= 0) return;
    audio.seek((e.nativeEvent.locationX / trackWidth) * audio.duration);
  };

  return (
    <View style={{ gap: 10 }}>
      {audio.usingDeviceVoice ? (
        <Text style={type.caption}>
          Read by your phone — {audio.failReason ?? "the guide's voice was unavailable."}
        </Text>
      ) : null}
      <StopPhoto stop={stop} lang={lang} />
      <View style={styles.titleRow}>
        <Text numberOfLines={1} style={[type.lead, { flex: 1 }]}>
          {stop.name}
        </Text>
        <Text style={styles.count}>
          {index + 1} / {total}
        </Text>
      </View>

      <View>
        <Pressable
          onPress={seekAt}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width || 1)}
          accessibilityRole="adjustable"
          accessibilityLabel="Position in this stop"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
          style={styles.scrub}
        >
          <View style={styles.scrubTrack}>
            <View style={[styles.scrubFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { left: `${pct * 100}%` }]} />
        </Pressable>
        <View style={styles.times}>
          <Text style={styles.time}>{mmss(audio.position)}</Text>
          <Text style={styles.time}>
            {audio.preparing && audio.waitingFor ? audio.waitingFor : audio.duration > 0 ? mmss(audio.duration) : "—"}
          </Text>
        </View>
      </View>

      {audio.failed && !audio.usingDeviceVoice ? (
        <Btn label="Narration failed — try again" onPress={audio.retry} />
      ) : (
        <View style={styles.controls}>
          <Btn label="−15" onPress={() => audio.seek(Math.max(0, audio.position - 15))} accessibilityLabel="Back fifteen seconds" />
          <Btn
            variant="primary"
            label={audio.preparing ? "…" : audio.playing ? "Pause" : "Play"}
            onPress={audio.toggle}
            style={{ flex: 1 }}
          />
          <Btn
            label="+15"
            onPress={() => audio.seek(Math.min(audio.duration, audio.position + 15))}
            accessibilityLabel="Forward fifteen seconds"
          />
        </View>
      )}

      <View style={styles.controls}>
        <Btn
          variant={showText ? "dark" : "quiet"}
          label={showText ? "Hide the text" : "Read along"}
          disabled={audio.chunks.length === 0}
          onPress={() => setShowText((v) => !v)}
          style={{ flex: 1 }}
        />
        <Btn
          variant={audio.speedrun ? "dark" : "quiet"}
          label="Quick summary"
          onPress={() => audio.setSpeedrun(!audio.speedrun)}
          style={{ flex: 1 }}
        />
      </View>

      {showText && audio.chunks.length > 0 ? (
        <View style={styles.textBox}>
          <Eyebrow>{audio.speedrun ? "Quick summary" : "What you are hearing"}</Eyebrow>
          <View style={{ marginTop: 8, gap: 12 }}>
            {(audio.speedrun ? audio.chunks.slice(0, 1) : audio.chunks).map((text, i) =>
              i === audio.chunkIndex ? (
                <SpokenLine key={i} text={text} progress={within} />
              ) : (
                <Text key={i} style={[type.body, { color: i < audio.chunkIndex ? colors.inkMute : colors.inkSoft }]}>
                  {text}
                </Text>
              ),
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  miniRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dots: { fontFamily: fonts.display, fontSize: size.caption, color: colors.ink },
  miniTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  miniName: { flexShrink: 1, fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  miniTime: { fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute, fontVariant: ["tabular-nums"] },
  miniTrack: { marginTop: 6, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  miniFill: { height: 6, borderRadius: 3, backgroundColor: colors.mintInk },

  photo: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, overflow: "hidden" },
  photoImage: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.canvas },
  photoCaption: { paddingHorizontal: 12, paddingVertical: 8 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  count: { fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute, fontVariant: ["tabular-nums"] },
  scrub: { height: 28, justifyContent: "center" },
  scrubTrack: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden" },
  scrubFill: { height: 4, backgroundColor: colors.mintInk },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.mintInk,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: -2 },
  time: { fontFamily: fonts.body, fontSize: size.caption, color: colors.inkMute, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  textBox: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, borderRadius: radius.control, padding: 12 },
});
