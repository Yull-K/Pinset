import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, ScrollView, ActivityIndicator, Linking, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { insertLook, listLooks, deleteLook, type Look, type Part, type Row } from "../lib/db";

type Brand = { name: string; why: string; query: string };
type Item = { slot: string; label: string; brands: Brand[] };
type Reco = { wearer: string; items: Item[] };
type Decoded = Look & { error?: string };

const SEASONS = ["봄가을", "여름", "겨울"];
const CODES = ["정장", "비즈니스 캐주얼", "캐주얼"];
const GENDERS = ["여성", "남성"];
const PREVIEW = 4;

const MALLS = [
  { name: "무신사", url: (q: string) => `https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(q)}` },
  { name: "W컨셉", url: (q: string) => `https://www.wconcept.co.kr/Search?keyword=${encodeURIComponent(q)}` },
  { name: "지그재그", url: (q: string) => `https://zigzag.kr/search?keyword=${encodeURIComponent(q)}` },
  { name: "네이버", url: (q: string) => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}` },
];

export default function Home() {
  const decompose = useAction(api.decompose.decompose);
  const recommend = useAction(api.recommend.brands);
  const [gender, setGender] = useState("여성");
  const [uri, setUri] = useState<string | null>(null);
  const [look, setLook] = useState<Look | null>(null);
  const [reco, setReco] = useState<Reco | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listLooks()
      .then(setSaved)
      .catch((e) => console.log(e))
      .finally(() => setLoaded(true));
  }, []);

  const pick = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.6,
      });
      if (res.canceled) return;
      setUri(res.assets[0].uri);
      setLook(null);
      setReco(null);
      setErr(null);
      setExpanded({});
      setBusy(true);

      const out = (await decompose({ base64: res.assets[0].base64!, mediaType: "image/jpeg" })) as Decoded;
      setBusy(false);

      if (out.error === "no_clothes" || (!out.top?.category && !out.bottom?.category)) {
        setErr("옷을 찾지 못했어요. 사람이 옷을 입고 있는 사진이어야 분해할 수 있어요. 전신이 나올수록 정확합니다.");
        setUri(null);
        return;
      }

      setLook(out);
      setFinding(true);
      const r = (await recommend({ look: JSON.stringify(out), gender })) as Reco;
      setReco(r);
    } catch (e) {
      setErr("분해에 실패했어요. 다른 사진으로 다시 해보시겠어요?");
      console.log(e);
      setUri(null);
    } finally {
      setBusy(false);
      setFinding(false);
    }
  };

  const save = async () => {
    if (!look) return;
    try {
      await insertLook(look);
      setSaved(await listLooks());
      setUri(null);
      setLook(null);
      setReco(null);
    } catch (e) {
      setErr("저장에 실패했어요.");
      console.log(e);
    }
  };

  const remove = (id: number) => {
    Alert.alert("삭제할까요?", "저장한 룩이 지워집니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await deleteLook(id);
          setSaved(await listLooks());
        },
      },
    ]);
  };

  const ask = () => {
    Alert.alert("문의하기", "곧 상담 채널이 열립니다. 지금은 준비 중이에요.", [{ text: "확인" }]);
  };

  const Button = () => (
    <Pressable onPress={pick} style={{ backgroundColor: "#2563eb", paddingVertical: 18, paddingHorizontal: 32, borderRadius: 14 }}>
      <Text style={{ color: "white", textAlign: "center", fontSize: 17, fontWeight: "500" }}>사진 고르기</Text>
    </Pressable>
  );

  const ErrorBox = () =>
    err ? (
      <View style={{ backgroundColor: "#fef2f2", borderRadius: 12, padding: 14 }}>
        <Text style={{ color: "#b91c1c", lineHeight: 21 }}>{err}</Text>
      </View>
    ) : null;

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!uri && saved.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", alignItems: "center", justifyContent: "center", padding: 32, gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: "600", textAlign: "center" }}>핀셋</Text>
          <Text style={{ fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22 }}>
            저장해 둔 출근룩을 뜯어서{"\n"}비슷한 브랜드를 찾아 드립니다
          </Text>
        </View>
        <Chips items={GENDERS} value={gender} onPick={setGender} />
        <Button />
        <ErrorBox />
      </View>
    );
  }

  const groups = groupKeys(saved);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "white" }} contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 16 }}>
      <Button />
      <Chips items={GENDERS} value={gender} onPick={setGender} />
      <ErrorBox />

      {uri ? <Image source={{ uri }} style={{ width: "100%", height: 260, borderRadius: 12 }} resizeMode="cover" /> : null}
      {busy ? <ActivityIndicator size="large" /> : null}

      {look ? (
        <View style={{ gap: 4 }}>
          {look.multiple ? (
            <View style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, marginBottom: 8 }}>
              <Text style={{ color: "#92400e", fontSize: 13, lineHeight: 19 }}>
                사람이 여러 명이라 가장 크게 나온 한 명만 분해했어요.
              </Text>
            </View>
          ) : null}

          <Row2 label="상의" value={fmt(look.top)} />
          {look.top?.layered ? <Row2 label="겹쳐 입음" value={look.top.layered} /> : null}
          <Row2 label="하의" value={fmt(look.bottom)} />
          <Row2 label="실루엣" value={look.silhouette} />

          <Pressable onPress={ask} style={{ paddingVertical: 10 }}>
            <Text style={{ color: "#2563eb", fontSize: 13 }}>잘못 분류됐나요? 문의하기</Text>
          </Pressable>

          <Text style={{ fontSize: 15, marginTop: 12 }}>계절</Text>
          <Chips items={SEASONS} value={look.season} onPick={(v) => setLook({ ...look, season: v })} />

          <Text style={{ fontSize: 15, marginTop: 16 }}>드레스코드</Text>
          <Chips items={CODES} value={look.dressCode} onPick={(v) => setLook({ ...look, dressCode: v })} />

          {finding ? <Text style={{ color: "#9ca3af", fontSize: 13, marginTop: 20 }}>비슷한 브랜드를 찾는 중입니다</Text> : null}

          {reco ? (
            <View style={{ marginTop: 24, gap: 10 }}>
              <Text style={{ fontSize: 15 }}>이런 분위기를 좋아하는 사람</Text>
              <View style={{ backgroundColor: "#f3f4f6", padding: 14, borderRadius: 12 }}>
                <Text style={{ color: "#374151", lineHeight: 21 }}>{reco.wearer}</Text>
              </View>

              <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
                AI 추천이라 실제와 다를 수 있어요. 쇼핑몰을 하나씩 눌러 가격을 비교해 보세요.
              </Text>

              {reco.items?.map((it) => {
                const all = it.brands ?? [];
                const open = expanded[it.slot];
                const list = open ? all : all.slice(0, PREVIEW);
                return (
                  <View key={it.slot} style={{ marginTop: 16, gap: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: "500" }}>{slotName(it.slot)}</Text>
                    <Text style={{ fontSize: 13, color: "#6b7280" }}>{it.label}</Text>
                    {list.map((b) => (
                      <View key={b.name} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, gap: 10 }}>
                        <View>
                          <Text style={{ fontWeight: "500", fontSize: 15 }}>{b.name}</Text>
                          <Text style={{ color: "#6b7280", marginTop: 3, fontSize: 13 }}>{b.why}</Text>
                        </View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                          {MALLS.map((m) => (
                            <Pressable
                              key={m.name}
                              onPress={() => Linking.openURL(m.url(b.query))}
                              style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "#eff6ff" }}
                            >
                              <Text style={{ color: "#2563eb", fontSize: 13 }}>{m.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                    {all.length > PREVIEW ? (
                      <Pressable
                        onPress={() => setExpanded({ ...expanded, [it.slot]: !open })}
                        style={{ paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#d1d5db" }}
                      >
                        <Text style={{ textAlign: "center", color: "#374151", fontSize: 14 }}>
                          {open ? "접기" : `${all.length - PREVIEW}개 더 보기`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <Pressable onPress={save} style={{ marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: "#111827" }}>
            <Text style={{ color: "white", textAlign: "center", fontSize: 16 }}>저장하기</Text>
          </Pressable>
        </View>
      ) : null}

      {saved.length > 0 ? (
        <View style={{ marginTop: 24, gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: "600" }}>저장한 룩 {saved.length}개</Text>

          {groups.length > 1 ? (
            <Chips items={["전체", ...groups]} value={filter ?? "전체"} onPick={(v) => setFilter(v === "전체" ? null : v)} />
          ) : null}

          {groups.map((g) => {
            if (filter && filter !== g) return null;
            const list = saved.filter((s) => key(s) === g);
            const p = pattern(list);
            return (
              <View key={g} style={{ gap: 8, marginTop: 8 }}>
                <Text style={{ fontSize: 14, color: "#6b7280" }}>{g} · {list.length}개</Text>
                {p ? (
                  <View style={{ backgroundColor: "#f3f4f6", padding: 14, borderRadius: 12 }}>
                    <Text style={{ color: "#374151", lineHeight: 21 }}>{p}</Text>
                  </View>
                ) : (
                  <Text style={{ color: "#9ca3af", fontSize: 13 }}>2개 이상 모이면 패턴을 알려 드릴게요</Text>
                )}
                {list.map((s) => (
                  <Pressable
                    key={s.id}
                    onLongPress={() => remove(s.id)}
                    style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14 }}
                  >
                    <Text style={{ fontWeight: "500" }}>{fmt(s.top)} + {fmt(s.bottom)}</Text>
                    <Text style={{ color: "#6b7280", marginTop: 4 }}>{s.silhouette}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
          <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>카드를 길게 누르면 삭제됩니다</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function slotName(slot: string) {
  if (slot === "top") return "상의";
  if (slot === "layered") return "겹쳐 입은 이너";
  if (slot === "bottom") return "하의";
  return slot;
}

function key(s: Look) {
  return `${s.season || "계절 미정"} · ${s.dressCode || "코드 미정"}`;
}

function groupKeys(list: Look[]) {
  return Array.from(new Set(list.map(key)));
}

function pattern(list: Look[]) {
  if (list.length < 2) return null;
  const topFit = most(list.map((l) => l.top?.fit).filter(Boolean) as string[]);
  const topColor = most(list.map((l) => l.top?.color).filter(Boolean) as string[]);
  const bottomFit = most(list.map((l) => l.bottom?.fit).filter(Boolean) as string[]);
  if (!topFit || !bottomFit) return null;
  const tail = topColor ? ` 상의 색은 ${topColor}이 가장 많습니다.` : "";
  return `상의 ${topFit} + 하의 ${bottomFit} 조합을 반복해서 저장합니다.${tail}`;
}

function most(arr: string[]) {
  const c: Record<string, number> = {};
  arr.forEach((v) => (c[v] = (c[v] || 0) + 1));
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
}

function fmt(p?: Part) {
  if (!p) return "확인 안 됨";
  return [p.color, p.fit, p.category].filter(Boolean).join(" ") || "확인 안 됨";
}

function Chips({ items, value, onPick }: { items: string[]; value?: string | null; onPick: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {items.map((s) => (
        <Pressable
          key={s}
          onPress={() => onPick(s)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: value === s ? "#2563eb" : "#d1d5db",
            backgroundColor: value === s ? "#e0edff" : "white",
          }}
        >
          <Text style={{ color: value === s ? "#1e40af" : "#374151" }}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row2({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
      <Text style={{ color: "#6b7280" }}>{label}</Text>
      <Text style={{ fontWeight: "500" }}>{value || "확인 안 됨"}</Text>
    </View>
  );
}
