"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";

const PROMPT = `출근룩 사진에서 옷을 분해해. 반드시 아래 JSON만 출력하고 다른 말은 쓰지 마.

{
  "top": { "category": "", "color": "", "fit": "", "layered": "", "confidence": "" },
  "bottom": { "category": "", "color": "", "fit": "", "length": "", "confidence": "" },
  "silhouette": "",
  "dressCode": "",
  "season": "",
  "multiple": false
}

규칙:
- category: 셔츠, 블라우스, 니트, 가디건, 하프집니트, 티셔츠, 반팔티, 패딩, 코트, 슬랙스, 데님, 스커트 등 한국어로
- color: 검정, 네이비, 아이보리, 베이지, 차콜, 연청 등 한국어로
- fit: 슬림, 레귤러, 오버핏, 와이드 중 하나
- layered: 안에 겹쳐 입은 것이 보이면 적고, 없으면 빈 문자열
- length: 하의 기장. 긴 기장, 발목, 무릎, 미니 중 하나
- silhouette: "상의 타이트 + 하의 와이드" 같은 형태로
- dressCode: 정장, 비즈니스 캐주얼, 캐주얼 중 하나
- season: 봄가을, 여름, 겨울 중 하나. 옷의 두께와 소매 길이로 판단해
- confidence: 확실, 추정, 확인불가 중 하나
- 하의가 바지인지 치마인지 헷갈리면 다리 사이에 솔기나 가랑이 선이 보이는지 확인해. 보이면 바지야
- 사진에서 확인할 수 없으면 지어내지 말고 빈 문자열로 두고 confidence를 확인불가로
- 소재, 신발, 모자, 가방은 판단하지 말 것
- 사람이 여러 명이면 가장 크게 나온 한 명만 분해하고 multiple을 true로
- 사람이 옷을 입고 있는 사진이 아니거나 옷을 알아볼 수 없으면 {"error": "no_clothes"} 만 출력해`;

export const decompose = action({
  args: { base64: v.string(), mediaType: v.string() },
  handler: async (_ctx, { base64, mediaType }) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) throw new Error("API 호출 실패: " + res.status + " " + (await res.text()));

    const data = await res.json();
    const text = data.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    return JSON.parse(text);
  },
});
