/** "Where do you start?": the website's PointsStep and CityPicker. */

import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import GlowButton from "@/components/GlowButton";
import { Btn, Eyebrow, Field, TextLink } from "@/components/ui";
import { searchCities, searchPlaces } from "@/lib/api";
import { inCity } from "@/lib/geo";
import { t } from "@/lib/strings";
import { colors, fonts, radius, size, type } from "@/lib/theme";
import type { City, Draft, Fix, Place, Point } from "@/lib/types";

type Target = "start" | "end";

/** Search after the typing stops, not on every key. */
function useDebounced<T>(query: string, search: (q: string) => Promise<T[]>, deps: unknown[]) {
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) return;
    let live = true;
    const id = setTimeout(async () => {
      setSearching(true);
      const found = await search(query);
      if (live) {
        setResults(found);
        setSearching(false);
      }
    }, 600);
    return () => {
      live = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ...deps]);
  return { results: query.trim().length >= 2 ? results : [], searching };
}

export function CityPicker({
  city,
  detecting,
  lang,
  open,
  onOpenChange,
  onChange,
}: {
  city: City | null;
  detecting: boolean;
  lang: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (c: City) => void;
}) {
  const [query, setQuery] = useState("");
  const { results, searching } = useDebounced(query, (q) => searchCities(q, lang), [lang]);

  if (!open) {
    return (
      <View style={styles.box}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Eyebrow>{t("points.city")}</Eyebrow>
            <Text numberOfLines={1} style={styles.value}>
              {city ? city.label : detecting ? t("points.locating") : t("points.notSet")}
            </Text>
          </View>
          <Btn small label={city ? t("points.change") : t("points.choose")} onPress={() => onOpenChange(true)} />
        </View>
        {!city && !detecting ? (
          <Text style={[type.caption, { marginTop: 8 }]}>Type where you are and the tour is built there.</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.box, { borderColor: colors.lineStrong }]}>
      <View style={styles.rowBetween}>
        <Eyebrow>{t("points.whichCity")}</Eyebrow>
        <Btn
          small
          label={t("points.cancel")}
          onPress={() => {
            onOpenChange(false);
            setQuery("");
          }}
        />
      </View>
      <Field
        autoFocus
        value={query}
        onChangeText={setQuery}
        placeholder="Vienna, Kraków, Porto…"
        autoCorrect={false}
        style={{ marginTop: 8, minHeight: 48 }}
      />
      {searching ? <Text style={[type.caption, { marginTop: 8 }]}>{t("points.searching")}</Text> : null}
      {results.map((c) => (
        <Pressable
          key={c.label}
          onPress={() => {
            onChange(c);
            onOpenChange(false);
            setQuery("");
          }}
          style={styles.result}
        >
          <Text numberOfLines={1} style={styles.resultName}>
            {c.label}
          </Text>
        </Pressable>
      ))}
      {!searching && query.trim().length >= 2 && results.length === 0 ? (
        <Text style={[type.caption, { marginTop: 8 }]}>Nothing by that name. Try the local spelling.</Text>
      ) : null}
    </View>
  );
}

function PointRow({
  target,
  point,
  hasFix,
  cityName,
  near,
  lang,
  onSet,
  onDropPin,
  onUseLocation,
}: {
  target: Target;
  point: Point | null;
  hasFix: boolean;
  cityName?: string;
  near: { lat: number; lng: number } | null;
  lang: string;
  onSet: (p: Point | null) => void;
  onDropPin: () => void;
  onUseLocation: () => void;
}) {
  const [query, setQuery] = useState("");
  const { results, searching } = useDebounced<Place>(query, (q) => searchPlaces(q, lang, near), [near?.lat, near?.lng]);
  const label = target === "start" ? t("points.start") : t("points.end");
  const which = target === "start" ? "a start" : "an end";

  return (
    <View style={styles.box}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Eyebrow>{label}</Eyebrow>
          <Text numberOfLines={1} style={styles.value}>
            {point?.label ?? t("points.notSet")}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Btn
            label={hasFix ? t("points.useLocation") : t("points.locating")}
            disabled={!hasFix}
            onPress={onUseLocation}
            accessibilityLabel={`Use my location as the ${label.toLowerCase()}`}
          />
          {point ? <TextLink label={t("points.clear")} onPress={() => onSet(null)} style={{ minHeight: 24 }} /> : null}
        </View>
      </View>
      <View style={styles.searchRow}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={cityName ? `Search ${cityName} for ${which}` : `Search for ${which}`}
          autoCorrect={false}
          style={{ flex: 1 }}
        />
        <Btn icon onPress={onDropPin} accessibilityLabel={`Drop a pin on the map for the ${label.toLowerCase()}`}>
          <SymbolView
            name={{ ios: "mappin.and.ellipse", android: "location_on", web: "location_on" } as never}
            size={20}
            tintColor={colors.ink}
            fallback={<Text>📍</Text>}
          />
        </Btn>
      </View>
      {searching ? <Text style={[type.caption, { marginTop: 8 }]}>{t("points.searching")}</Text> : null}
      {results.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            onSet({ lat: p.lat, lng: p.lng, label: p.name });
            setQuery("");
          }}
          style={styles.result}
        >
          <Text style={styles.resultName}>{p.name}</Text>
          <Text numberOfLines={1} style={type.caption}>
            {p.address}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function PointsFooter({ draft, onContinue }: { draft: Draft; onContinue: () => void }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={[type.caption, { textAlign: "center", minHeight: 22 }]}>
        {draft.start ? (draft.end ? t("points.bothSet") : t("points.loop")) : t("points.needStart")}
      </Text>
      {/* The press that sets the AI to work: the glow button. */}
      <GlowButton label={t("points.create")} disabled={!draft.start} onPress={onContinue} />
    </View>
  );
}

export default function Points({
  draft,
  onChange,
  fix,
  onPick,
  detectingCity,
  onCity,
}: {
  draft: Draft;
  onChange: (p: Partial<Draft>) => void;
  fix: Fix | null;
  onPick: (target: Target) => void;
  detectingCity: boolean;
  onCity: (c: City) => void;
}) {
  const [showEnd, setShowEnd] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const city = draft.city;
  // Search near the walker when they are in the city, else near the city.
  const near =
    fix && (!city || inCity(fix, city))
      ? { lat: fix.lat, lng: fix.lng }
      : city
        ? { lat: city.lat, lng: city.lng }
        : null;

  const row = (target: Target) => (
    <PointRow
      target={target}
      point={target === "start" ? draft.start : draft.end}
      hasFix={fix !== null}
      cityName={city?.name}
      near={near}
      lang={draft.lang}
      onSet={(p) => onChange(target === "start" ? { start: p } : { end: p })}
      onDropPin={() => onPick(target)}
      onUseLocation={() => {
        if (fix) onChange({ [target]: { lat: fix.lat, lng: fix.lng, label: t("points.hereNow") } });
      }}
    />
  );

  return (
    <View style={{ gap: 12 }}>
      <CityPicker
        city={city}
        detecting={detectingCity}
        lang={draft.lang}
        open={cityOpen}
        onOpenChange={setCityOpen}
        onChange={onCity}
      />
      {row("start")}
      {showEnd || draft.end ? (
        row("end")
      ) : (
        <TextLink label={t("points.addEnd")} onPress={() => setShowEnd(true)} style={{ alignSelf: "flex-start" }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, borderRadius: radius.control, padding: 12 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  value: { marginTop: 4, fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
  searchRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  result: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultName: { fontFamily: fonts.display, fontSize: size.body, color: colors.ink },
});
