"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";

export const brands = action({
  args: { look: v.string(), gender: v.string() },
  handler: async (_ctx, { look, gender }) => {
    const prompt = `아래는 한 출근룩의 분해 결과야.

${look}

대상: ${gender}

이 룩을 입을 법한 사람을 한 문장으로 쓰고, 아이템마다 따로 브랜드를 추천해.
반드시 아래 JSON만 출력하고 다른 말은 쓰지 마.

{
  "wearer": "",
  "items": [
    {
      "slot": "",
      "label": "",
      "brands": [ { "name": "", "why": "", "query": "", "color": "" } ]
    }
  ]
}

규칙:
- wearer: 누가 이렇게 입을지 한 문장. 직군, 연차, 분위기. 40자 이내
- items: 아이템마다 하나씩. 상의는 slot "top", 겹쳐 입은 이너는 "layered", 하의는 "bottom"
- layered 값이 비어 있으면 layered 항목은 아예 빼
- label: 그 아이템을 한국어로. 예 "검정 오버핏 니트"
- brands: 아이템마다 정확히 10개. 무신사, W컨셉, 지그재그에서 실제로 취급하는 브랜드로
- 앞의 4개를 가장 잘 맞는 순서로 배치해
- 대상 성별이 주로 입는 브랜드로 골라. 대상이 상관없음이면 성별 구분 없이 유니섹스 브랜드 위주로
- 가격대를 섞어. 저가부터 중고가까지
- name: 브랜드명 한국어 표기
- why: 이 아이템과 맞는 이유 한 줄. 20자 이내
- query: "브랜드명 + 아이템 종류"만. 색과 핏은 절대 넣지 마. 쇼핑몰 검색은 모든 단어가 맞아야 결과가 나와서, 색을 넣으면 결과가 비게 돼
- color: 이 아이템의 색을 영문 대문자 한 단어로. BLACK, WHITE, NAVY, BEIGE, BROWN, GRAY, IVORY, KHAKI, GREEN, BLUE, RED, PINK, PURPLE, YELLOW, ORANGE 중 하나. 애매하면 빈 문자열
- 확실하지 않은 브랜드는 넣지 마`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error("API 호출 실패: " + res.status);

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
