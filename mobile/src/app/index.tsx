import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Image, ScrollView, ActivityIndicator, Linking, Alert, Modal } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  insertLook, updateLook, setFolders, listLooks, deleteLook, saveReco, getReco,
  listFolders, addFolder, renameFolder, removeFolder,
  type Look, type Part, type Row, type Folder,
} from "../lib/db";

type Brand = { name: string; why: string; query: string; color?: string };
type Item = { slot: string; label: string; brands: Brand[] };
type Reco = { wearer: string; items: Item[] };
type Decoded = Look & { error?: string };
type Axis = { label: string; value: string; n: number; icon: string };

const SEASONS = ["봄", "여름", "가을", "겨울"];
const GENDERS = ["여성", "남성", "상관없음"];
const EMOJIS = ["📁", "👔", "🛒", "💼", "☕️", "🌙", "✨", "🔥", "🧊", "🎀", "🪄", "💙"];
const PREVIEW = 4;

const MALLS = [
  {
    name: "무신사",
    url: (q: string, color?: string) =>
      `https://www.musinsa.com/search/goods?keyword=${encodeURIComponent(q)}&keywordType=keyword&gf=A` +
      (color ? `&color=${color}` : ""),
  },
  { name: "W컨셉", url: (q: string) => `https://www.wconcept.co.kr/Search?keyword=${encodeURIComponent(q)}` },
  { name: "지그재그", url: (q: string) => `https://zigzag.kr/search?keyword=${encodeURIComponent(q)}` },
  { name: "네이버", url: (q: string) => `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}` },
];

const COLOR_KO: Record<string, string> = {
  BLACK: "검정", WHITE: "흰색", NAVY: "네이비", BEIGE: "베이지", BROWN: "브라운",
  GRAY: "그레이", IVORY: "아이보리", KHAKI: "카키", GREEN: "그린", BLUE: "블루",
  RED: "레드", PINK: "핑크", PURPLE: "퍼플", YELLOW: "옐로우", ORANGE: "오렌지",
};

const SWATCH: Record<string, string> = {
  검정: "#111827", 흰색: "#f9fafb", 아이보리: "#f4efe3", 베이지: "#ddcdb4",
  브라운: "#7c5a3c", 갈색: "#7c5a3c", 카키: "#7a7a52", 그레이: "#9ca3af",
  차콜: "#4b5563", 네이비: "#1e3a5f", 블루: "#3b82f6", 연청: "#9bc0e0",
  진청: "#2d4a6b", 그린: "#3f7d4f", 올리브그린: "#6b7a3f", 레드: "#c0392b",
  와인레드: "#7b2b36", 핑크: "#e8a0b4", 퍼플: "#7c5fa8", 옐로우: "#e8c84a",
  오렌지: "#e07b39",
};

const SEASON_ICON: Record<string, string> = { 봄: "🌸", 여름: "🌊", 가을: "🍂", 겨울: "❄️" };

export default function Home() {
  const decompose = useAction(api.decompose.decompose);
  const recommend = useAction(api.recommend.brands);
  const [gender, setGender] = useState("여성");
  const [uri, setUri] = useState<string | null>(null);
  const [look, setLook] = useState<Look | null>(null);
  const [lookId, setLookId] = useState<number | null>(null);
  const [reco, setReco] = useState<Reco | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState(false);
  const [saved, setSaved] = useState<Row[]>([]);
  const [folders, setFoldersState] = useState<Folder[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState(false);
  const [openRecent, setOpenRecent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lookIdRef = useRef<number | null>(null);

  const reload = async () => {
    setSaved(await listLooks());
    setFoldersState(await listFolders());
  };

  useEffect(() => {
    reload().catch((e) => console.log(e)).finally(() => setLoaded(true));
  }, []);

  const roots = folders.filter((f) => f.parentId == null);
  const kidsOf = (id: number) => folders.filter((f) => f.parentId === id);
  const countOf = (id: number) => {
    const ids = [id, ...kidsOf(id).map((k) => k.id)];
    return saved.filter((s) => s.folders.some((f) => ids.includes(f))).length;
  };

  const goHome = () => {
    setUri(null);
    setLook(null);
    setLookId(null);
    setReco(null);
    setPicked([]);
    setExpanded({});
    setSheet(false);
    setDup(false);
  };

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
      setLookId(null);
      setReco(null);
      setPicked([]);
      setErr(null);
      setDup(false);
      setExpanded({});
      setSheet(false);
      setBusy(true);

      const out = (await decompose({ base64: res.assets[0].base64!, mediaType: "image/jpeg" })) as Decoded;
      setBusy(false);

      if (out.error === "no_clothes" || (!out.top?.category && !out.bottom?.category)) {
        setErr("옷을 찾지 못했어요. 사람이 옷을 입고 있는 사진이어야 살펴볼 수 있어요. 전신이 나올수록 정확합니다.");
        setUri(null);
        return;
      }

      const next: Look = { ...out, seasons: out.season ? [out.season] : [] };
      const all = await listLooks();
      const same = all.find((r) => sig(r) === sig(next));

      if (same) {
        setDup(true);
        setLookId(same.id);
        lookIdRef.current = same.id;
        setLook({ ...next, seasons: same.seasons ?? next.seasons });
        setPicked(same.folders);
      } else {
        setLook(next);
        const newId = await insertLook(next);
        setLookId(newId);
        lookIdRef.current = newId;
      }
      await reload();

      setFinding(true);
      const id = same ? same.id : lookIdRef.current;
      const cached = id ? await getReco(id) : null;
      if (cached) {
        setReco(cached as Reco);
      } else {
        const r = (await recommend({ look: JSON.stringify(out), gender })) as Reco;
        setReco(r);
        if (id) await saveReco(id, r);
      }
    } catch (e) {
      setErr("살펴보지 못했어요. 다른 사진으로 다시 해보시겠어요?");
      console.log(e);
      setUri(null);
    } finally {
      setBusy(false);
      setFinding(false);
    }
  };

  const toggleSeason = async (v: string) => {
    if (!look || !lookId) return;
    const cur = look.seasons ?? [];
    const next = { ...look, seasons: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    setLook(next);
    await updateLook(lookId, next);
    await reload();
  };

  const toggleFolder = async (id: number) => {
    if (!lookId) return;
    const on = picked.includes(id);
    const next = on ? picked.filter((p) => p !== id) : [...picked, id];
    setPicked(next);
    await setFolders(lookId, next);
    await reload();
    const f = folders.find((x) => x.id === id);
    setToast(f ? `${f.emoji} ${f.name}${on ? "에서 뺐어요" : "에 담았어요"}` : null);
    setTimeout(() => setToast(null), 1600);
  };

  const newFolder = (parentId: number | null, parentName?: string) => {
    Alert.prompt?.(
      parentId ? `${parentName} 안에 새 폴더` : "새 폴더",
      "어떻게 묶을까요?",
      async (name) => {
        if (!name?.trim()) return;
        await addFolder(name, parentId ? "📂" : EMOJIS[Math.floor(Math.random() * EMOJIS.length)], parentId);
        await reload();
      }
    );
  };

  const editFolder = (f: Folder) => {
    Alert.alert(`${f.emoji} ${f.name}`, "이 폴더를 어떻게 할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "이름 바꾸기",
        onPress: () =>
          Alert.prompt?.("이름 바꾸기", "", async (name) => {
            if (!name?.trim()) return;
            await renameFolder(f.id, name);
            await reload();
          }, "plain-text", f.name),
      },
      {
        text: "이모지 바꾸기",
        onPress: () =>
          Alert.prompt?.("이모지", "하나만 입력해 주세요", async (e) => {
            if (!e?.trim()) return;
            await renameFolder(f.id, f.name, e.trim());
            await reload();
          }, "plain-text", f.emoji),
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await removeFolder(f.id);
          setPicked(picked.filter((p) => p !== f.id));
          setFilter(filter === f.id ? null : filter);
          await reload();
        },
      },
    ]);
  };

  const unpin = (lid: number, fid: number, fname: string) => {
    Alert.alert(`${fname}에서 뺄까요?`, "기록에는 그대로 남습니다.", [
      { text: "취소", style: "cancel" },
      {
        text: "빼기",
        onPress: async () => {
          const row = saved.find((s) => s.id === lid);
          if (!row) return;
          await setFolders(lid, row.folders.filter((f) => f !== fid));
          await reload();
        },
      },
    ]);
  };

  const reopen = async (row: Row) => {
    setUri("saved");
    setLook(row);
    setLookId(row.id);
    setPicked(row.folders);
    setReco(null);
    setErr(null);
    setDup(false);
    setExpanded({});
    setSheet(false);
    try {
      setFinding(true);
      const cached = await getReco(row.id);
      if (cached) {
        setReco(cached as Reco);
      } else {
        const r = (await recommend({ look: JSON.stringify(row), gender })) as Reco;
        setReco(r);
        await saveReco(row.id, r);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setFinding(false);
    }
  };

  const remove = (id: number) => {
    Alert.alert("기록에서 지울까요?", "", [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: async () => { await deleteLook(id); await reload(); } },
    ]);
  };

  const ask = () => Alert.alert("문의하기", "곧 상담 채널이 열립니다. 지금은 준비 중이에요.", [{ text: "확인" }]);

  const pickedLabel = () => {
    const names = picked.map((id) => {
      const f = folders.find((x) => x.id === id);
      if (!f) return null;
      if (f.parentId != null) {
        const p = folders.find((x) => x.id === f.parentId);
        return p ? `${p.name} > ${f.name}` : f.name;
      }
      return f.name;
    }).filter(Boolean);
    return names.join(", ") + "에 담았어요";
  };

  const genderLine = gender === "상관없음" ? "성별 상관없이 추천해요" : `${gender} 브랜드를 추천해요`;
  const nextGender = () => setGender(GENDERS[(GENDERS.indexOf(gender) + 1) % GENDERS.length]);

  const ErrorBox = () =>
    err ? (
      <View style={{ backgroundColor: "#fef2f2", borderRadius: 12, padding: 14 }}>
        <Text style={{ color: "#b91c1c", lineHeight: 21 }}>{err}</Text>
      </View>
    ) : null;

  const FolderChip = ({ f, sub }: { f: Folder; sub?: boolean }) => {
    const on = picked.includes(f.id);
    return (
      <Pressable
        onPress={() => toggleFolder(f.id)}
        onLongPress={() => editFolder(f)}
        style={{
          paddingVertical: 8, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1,
          borderColor: on ? "#2563eb" : "#d1d5db",
          backgroundColor: on ? "#e0edff" : sub ? "#fafafa" : "white",
        }}
      >
        <Text style={{ color: on ? "#1e40af" : "#374151", fontSize: 13 }}>
          {f.emoji} {f.name}
        </Text>
      </Pressable>
    );
  };

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // ───────── 결과 화면 ─────────
  if (uri) {
    return (
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110, gap: 14 }}>
          <Pressable onPress={goHome} style={{ paddingVertical: 6 }}>
            <Text style={{ color: "#2563eb", fontSize: 15 }}>← 홈으로</Text>
          </Pressable>

          {uri === "saved" ? (
            <View style={{ backgroundColor: "#f9fafb", borderRadius: 12, paddingVertical: 22, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: "#9ca3af" }}>기록에서 다시 불러왔어요. 사진은 저장하지 않습니다.</Text>
            </View>
          ) : (
            <Image source={{ uri }} style={{ width: "100%", height: 260, borderRadius: 12 }} resizeMode="cover" />
          )}
          {busy ? <ActivityIndicator size="large" /> : null}

          {look ? (
            <View style={{ gap: 4 }}>
              {dup ? (
                <View style={{ backgroundColor: "#eff6ff", borderRadius: 12, padding: 13, marginBottom: 8 }}>
                  <Text style={{ color: "#1e40af", fontSize: 13, fontWeight: "500" }}>이미 기록에 있는 룩이에요</Text>
                  <Text style={{ color: "#60a5fa", fontSize: 12, marginTop: 3, lineHeight: 18 }}>
                    같은 조합을 전에 살펴봤습니다. 기록은 하나로 둘게요.
                  </Text>
                </View>
              ) : null}

              {look.multiple ? (
                <View style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 13, marginBottom: 8 }}>
                  <Text style={{ color: "#92400e", fontSize: 13, lineHeight: 19 }}>
                    사람이 여러 명이라 가장 크게 나온 한 명만 살펴봤어요.
                  </Text>
                </View>
              ) : null}

              <PartRow label="상의" part={look.top} />
              {look.top?.layered ? <Row2 label="겹쳐 입음" value={look.top.layered} /> : null}
              <PartRow label="하의" part={look.bottom} />
              <Row2 label="실루엣" value={sil(look)} />

              <Pressable onPress={ask} style={{ paddingVertical: 8 }}>
                <Text style={{ color: "#2563eb", fontSize: 12 }}>잘못 분류됐나요? 문의하기</Text>
              </Pressable>

              {reco ? (
                <View style={{ backgroundColor: "#f5f3ff", borderRadius: 14, padding: 16, gap: 8, marginTop: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 17 }}>🪞</Text>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#5b21b6" }}>이런 분위기를 좋아하는 사람</Text>
                  </View>
                  <Text style={{ color: "#4c1d95", lineHeight: 22, fontSize: 14 }}>{reco.wearer}</Text>
                </View>
              ) : null}

              {finding ? (
                <View style={{ backgroundColor: "#f9fafb", borderRadius: 14, padding: 16, marginTop: 8 }}>
                  <Text style={{ color: "#9ca3af", fontSize: 13 }}>비슷한 브랜드를 찾는 중입니다</Text>
                </View>
              ) : null}

              {reco ? (
                <View style={{ borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 14, padding: 16, gap: 8, marginTop: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 17 }}>🛍️</Text>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#1e40af" }}>비슷한 브랜드</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: "#9ca3af" }}>
                    AI 추천이라 실제와 다를 수 있어요. 쇼핑몰을 하나씩 눌러 가격을 비교해 보세요.
                  </Text>

                  {reco.items?.map((it) => {
                    const all = it.brands ?? [];
                    const open = expanded[it.slot];
                    const list = open ? all : all.slice(0, PREVIEW);
                    return (
                      <View key={it.slot} style={{ marginTop: 12, gap: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>
                          {slotName(it.slot)} · {it.label}
                        </Text>
                        {list.map((b) => (
                          <View key={b.name} style={{ borderWidth: 1, borderColor: "#f3f4f6", borderRadius: 12, padding: 14, gap: 10 }}>
                            <View>
                              <Text style={{ fontWeight: "600", fontSize: 15 }}>{b.name}</Text>
                              <Text style={{ color: "#6b7280", marginTop: 3, fontSize: 13 }}>{b.why}</Text>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                                {b.color && SWATCH[COLOR_KO[b.color] ?? ""] ? (
                                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: SWATCH[COLOR_KO[b.color]], borderWidth: 1, borderColor: "#e5e7eb" }} />
                                ) : null}
                                <Text style={{ color: "#9ca3af", fontSize: 11, flexShrink: 1 }}>
                                  {b.query}
                                  {b.color ? ` · 무신사는 ${COLOR_KO[b.color] ?? b.color} 필터` : ""}
                                </Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                              {MALLS.map((m) => (
                                <Pressable
                                  key={m.name}
                                  onPress={() => Linking.openURL(m.url(b.query, b.color))}
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
                            style={{ paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" }}
                          >
                            <Text style={{ textAlign: "center", color: "#2563eb", fontSize: 13 }}>
                              {open ? "접기" : `${all.length - PREVIEW}개 더 보기`}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {look ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={goHome}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  borderWidth: 1, borderColor: "#d1d5db", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
                }}
              >
                <Text style={{ fontSize: 15, color: "#374151", fontWeight: "500" }}>홈으로</Text>
              </Pressable>
              <Pressable
                onPress={() => setSheet(true)}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
                  backgroundColor: picked.length > 0 ? "#e0edff" : "#2563eb",
                  borderRadius: 14, paddingVertical: 16,
                }}
              >
                <Text style={{ fontSize: 16 }}>📁</Text>
                <Text style={{ fontSize: 15, fontWeight: "600", color: picked.length > 0 ? "#1e40af" : "white" }}>
                  {picked.length > 0 ? "폴더에 담겼어요" : "폴더로 저장하기"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Modal visible={sheet} animationType="slide" transparent onRequestClose={() => setSheet(false)}>
          <Pressable onPress={() => setSheet(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} />
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: "75%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 17, fontWeight: "600" }}>폴더로 저장하기</Text>
              <Pressable onPress={() => setSheet(false)}>
                <Text style={{ fontSize: 15, color: "#2563eb" }}>완료</Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: 12, color: "#9ca3af", lineHeight: 18 }}>
              비슷한 룩이 모이면 내 취향을 알려 드려요. 안 골라도 기록에는 남습니다.
            </Text>
            <Text style={{ fontSize: 11, color: "#9ca3af", lineHeight: 17, marginTop: 4, marginBottom: 10 }}>
              폴더를 길게 누르면 이름과 이모지를 바꾸거나 삭제할 수 있어요.
            </Text>
            {roots.length === 0 ? (
              <View style={{ backgroundColor: "#eff6ff", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: "#1e40af", fontWeight: "600", lineHeight: 18 }}>
                  예) 출근룩, 사고 싶은 것, 면접
                </Text>
                <Text style={{ fontSize: 11, color: "#60a5fa", lineHeight: 17, marginTop: 2 }}>
                  아래 + 새 폴더를 눌러 원하는 이름으로 만들어 보세요.
                </Text>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
              {look ? (
                <>
                  {roots.map((f) => {
                    const kids = kidsOf(f.id);
                    return (
                      <View key={f.id} style={{ marginTop: 12, gap: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <FolderChip f={f} />
                          <Pressable
                            onPress={() => newFolder(f.id, f.name)}
                            style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 14, backgroundColor: "#f3f4f6" }}
                          >
                            <Text style={{ color: "#6b7280", fontSize: 12 }}>+ 하위 폴더</Text>
                          </Pressable>
                        </View>
                        {kids.length > 0 ? (
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: 20 }}>
                            {kids.map((k) => <FolderChip key={k.id} f={k} sub />)}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  <Pressable
                    onPress={() => newFolder(null)}
                    style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#9ca3af", alignSelf: "flex-start", marginTop: 14 }}
                  >
                    <Text style={{ color: "#6b7280", fontSize: 13 }}>+ 새 폴더</Text>
                  </Pressable>

                  <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 24 }}>계절</Text>
                  <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>선택 사항이고 여러 개 고를 수 있어요</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {SEASONS.map((v) => {
                      const on = (look.seasons ?? []).includes(v);
                      return (
                        <Pressable
                          key={v}
                          onPress={() => toggleSeason(v)}
                          style={{
                            paddingVertical: 8, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1,
                            borderColor: on ? "#2563eb" : "#d1d5db",
                            backgroundColor: on ? "#e0edff" : "white",
                          }}
                        >
                          <Text style={{ color: on ? "#1e40af" : "#374151", fontSize: 13 }}>{SEASON_ICON[v]} {v}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {toast ? (
                    <View style={{ backgroundColor: "#111827", borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, marginTop: 16, alignSelf: "flex-start" }}>
                      <Text style={{ color: "white", fontSize: 13 }}>{toast}</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  // ───────── 첫 화면 ─────────
  if (saved.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", alignItems: "center", justifyContent: "center", padding: 32, gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: "600", textAlign: "center" }}>핀셋</Text>
          <Text style={{ fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22 }}>
            저장해 둔 출근룩을 살펴보고{"\n"}비슷한 브랜드를 찾아 드립니다
          </Text>
        </View>
        <Pressable onPress={nextGender} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 13, color: "#6b7280" }}>{genderLine}</Text>
          <Text style={{ fontSize: 13, color: "#2563eb" }}>성별 바꾸기</Text>
        </Pressable>
        <Pressable onPress={pick} style={{ backgroundColor: "#2563eb", paddingVertical: 18, paddingHorizontal: 32, borderRadius: 14 }}>
          <Text style={{ color: "white", textAlign: "center", fontSize: 17, fontWeight: "500" }}>사진 고르기</Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", lineHeight: 18 }}>
          살펴본 룩은 자동으로 기록에 남아요.{"\n"}폴더로 묶어 두면 나중에 찾기 쉽습니다.
        </Text>
        <ErrorBox />
      </View>
    );
  }

  // ───────── 홈 ─────────
  const usedRoots = roots.filter((f) => countOf(f.id) > 0);
  const axes = pattern(saved);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "white" }} contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 14 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>핀셋</Text>
      <Pressable onPress={pick} style={{ backgroundColor: "#2563eb", paddingVertical: 16, borderRadius: 14 }}>
        <Text style={{ color: "white", textAlign: "center", fontSize: 16, fontWeight: "500" }}>사진 고르기</Text>
      </Pressable>
      <Pressable onPress={nextGender} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: 13, color: "#6b7280" }}>{genderLine}</Text>
        <Text style={{ fontSize: 13, color: "#2563eb" }}>성별 바꾸기</Text>
      </Pressable>
      <ErrorBox />

      <View style={{ backgroundColor: "#f5f3ff", borderRadius: 14, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Text style={{ fontSize: 17 }}>✨</Text>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#5b21b6" }}>내 취향</Text>
        </View>
        {axes.length === 0 ? (
          <Text style={{ fontSize: 12, color: "#8b7bb8" }}>3개 이상 살펴보면 반복되는 취향을 알려 드릴게요.</Text>
        ) : (
          <View style={{ gap: 9 }}>
            <Text style={{ fontSize: 12, color: "#8b7bb8" }}>살펴본 {saved.length}개에서 반복되는 것</Text>
            {axes.map((a) => (
              <View key={a.label} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Text style={{ fontSize: 15 }}>{a.icon}</Text>
                <Text style={{ fontSize: 12, color: "#8b7bb8", width: 46 }}>{a.label}</Text>
                <Text style={{ fontSize: 13, color: "#4c1d95", flexShrink: 1, fontWeight: "500" }}>{a.value}</Text>
                <Text style={{ fontSize: 12, color: "#8b7bb8" }}>{a.n}번</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ backgroundColor: "#f9fafb", borderRadius: 14, padding: 16, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Text style={{ fontSize: 17 }}>📁</Text>
          <Text style={{ fontSize: 15, fontWeight: "600" }}>내 폴더</Text>
        </View>

        {usedRoots.length === 0 ? (
          <Text style={{ fontSize: 12, color: "#9ca3af" }}>폴더에 담은 룩이 여기에 모입니다.</Text>
        ) : null}

        {usedRoots.map((f) => {
          const kids = kidsOf(f.id).filter((k) => saved.some((s) => s.folders.includes(k.id)));
          const kidIds = kidsOf(f.id).map((k) => k.id);
          const direct = saved.filter((s) => s.folders.includes(f.id) && !s.folders.some((x) => kidIds.includes(x)));
          const open = filter === f.id;
          return (
            <View key={f.id} style={{ gap: 8 }}>
              <Pressable
                onPress={() => setFilter(open ? null : f.id)}
                onLongPress={() => editFolder(f)}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  backgroundColor: "white", borderWidth: 1,
                  borderColor: open ? "#2563eb" : "#e5e7eb",
                  borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
                }}
              >
                <Text style={{ fontSize: 14, color: open ? "#1e40af" : "#374151" }}>
                  {f.emoji} {f.name}
                </Text>
                <Text style={{ fontSize: 13, color: "#9ca3af" }}>{countOf(f.id)}</Text>
              </Pressable>

              {open ? (
                <View style={{ gap: 8, paddingLeft: 6 }}>
                  {kids.map((k) => {
                    const klist = saved.filter((s) => s.folders.includes(k.id));
                    return (
                      <View key={k.id} style={{ gap: 6 }}>
                        <Pressable onLongPress={() => editFolder(k)} style={{ paddingVertical: 2 }}>
                          <Text style={{ fontSize: 13, color: "#6b7280" }}>{k.emoji} {k.name}  {klist.length}</Text>
                        </Pressable>
                        {klist.map((s) => (
                          <Pressable
                            key={s.id}
                            onPress={() => reopen(s)}
                            onLongPress={() => unpin(s.id, k.id, k.name)}
                            style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, marginLeft: 10 }}
                          >
                            <Text style={{ fontWeight: "500" }}>{fmt(s.top)} + {fmt(s.bottom)}</Text>
                            <Text style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>{sil(s)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    );
                  })}

                  {direct.map((s) => (
                    <Pressable
                      key={s.id}
                      onLongPress={() => unpin(s.id, f.id, f.name)}
                      style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14 }}
                    >
                      <Text style={{ fontWeight: "500" }}>{fmt(s.top)} + {fmt(s.bottom)}</Text>
                      <Text style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>{sil(s)}</Text>
                    </Pressable>
                  ))}
                  <Text style={{ fontSize: 11, color: "#9ca3af" }}>카드를 누르면 다시 열리고, 길게 누르면 폴더에서 빠집니다</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ backgroundColor: "#f9fafb", borderRadius: 14, padding: 16, gap: 10 }}>
        <Pressable
          onPress={() => setOpenRecent(!openRecent)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Text style={{ fontSize: 17 }}>🕑</Text>
            <Text style={{ fontSize: 15, fontWeight: "600" }}>최근 살펴본 룩 {saved.length}개</Text>
          </View>
          <Text style={{ fontSize: 13, color: "#9ca3af" }}>{openRecent ? "닫기" : "열기"}</Text>
        </Pressable>

        {openRecent ? (
          <View style={{ gap: 8 }}>
            {saved.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => reopen(s)}
                onLongPress={() => remove(s.id)}
                style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14 }}
              >
                <Text style={{ fontWeight: "500" }}>{fmt(s.top)} + {fmt(s.bottom)}</Text>
                <Text style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>{sil(s)}</Text>
                {(s.seasons ?? []).length > 0 || s.folders.length > 0 ? (
                  <Text style={{ color: "#9ca3af", marginTop: 6, fontSize: 11 }}>
                    {[
                      ...(s.seasons ?? []).map((v) => `${SEASON_ICON[v] ?? ""} ${v}`),
                      ...s.folders.map((id) => {
                        const f = folders.find((x) => x.id === id);
                        return f ? `${f.emoji} ${f.name}` : null;
                      }).filter(Boolean),
                    ].join("   ")}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            <Text style={{ fontSize: 11, color: "#9ca3af" }}>카드를 누르면 다시 열리고, 길게 누르면 지워집니다</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const TIGHT = ["슬림", "크롭", "타이트", "테이퍼드"];
const LOOSE = ["오버핏", "루즈", "와이드", "세미오버", "부츠컷"];

function band(fit?: string) {
  if (!fit) return null;
  if (TIGHT.includes(fit)) return "붙는";
  if (LOOSE.includes(fit)) return "넉넉한";
  return "적당한";
}

function sig(l: Look) {
  const t = l.top, b = l.bottom;
  return [t?.category, t?.color, t?.fit, t?.layered, b?.category, b?.color, b?.fit]
    .map((x) => x || "")
    .join("|");
}

function sil(l: Look) {
  if (l.top?.fit && l.bottom?.fit) return `상의 ${l.top.fit} + 하의 ${l.bottom.fit}`;
  return l.silhouette || "";
}

function slotName(slot: string) {
  if (slot === "top") return "상의";
  if (slot === "layered") return "겹쳐 입은 이너";
  if (slot === "bottom") return "하의";
  return slot;
}

function pattern(list: Look[]): Axis[] {
  if (list.length < 3) return [];
  const axes: Axis[] = [];

  const push = (label: string, icon: string, arr: (string | undefined | null)[]) => {
    const vals = arr.filter(Boolean) as string[];
    if (vals.length === 0) return;
    const top = most(vals);
    const n = vals.filter((v) => v === top).length;
    if (n >= 2) axes.push({ label, value: top, n, icon });
  };

  push("실루엣", "📐", list.map((l) => {
    const t = band(l.top?.fit), b = band(l.bottom?.fit);
    return t && b ? `상의는 ${t} 핏 + 하의는 ${b} 핏` : null;
  }));
  push("상의 색", "🎨", list.map((l) => l.top?.color));
  push("상의", "👕", list.map((l) => l.top?.category));
  push("하의 색", "🎨", list.map((l) => l.bottom?.color));
  push("하의", "👖", list.map((l) => l.bottom?.category));
  push("계절", "📅", list.flatMap((l) => l.seasons ?? (l.season ? [l.season] : [])));

  return axes;
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

function PartRow({ label, part }: { label: string; part?: Part }) {
  if (!part) return <Row2 label={label} value="확인 안 됨" />;
  const sw = part.color ? SWATCH[part.color] : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f6f7f8" }}>
      <Text style={{ color: "#9ca3af", fontSize: 13 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 1 }}>
        {sw ? (
          <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: sw, borderWidth: 1, borderColor: "#e5e7eb" }} />
        ) : null}
        {part.color || part.fit ? (
          <Text style={{ color: "#6b7280", fontSize: 12 }}>
            {[part.color, part.fit].filter(Boolean).join(" ")}
          </Text>
        ) : null}
        <Text style={{ fontSize: 14, fontWeight: "600" }}>{part.category || "확인 안 됨"}</Text>
      </View>
    </View>
  );
}

function Row2({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f6f7f8" }}>
      <Text style={{ color: "#9ca3af", fontSize: 13 }}>{label}</Text>
      <Text style={{ fontWeight: "600", fontSize: 14 }}>{value || "확인 안 됨"}</Text>
    </View>
  );
}
