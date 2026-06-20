// api/cron.js
// 이카운트 결재대기 → 카카오톡 나에게 보내기 알림

export const config = {
  runtime: 'edge',
};

const ECOUNT_ZONE_URL = 'https://sboapi.ecount.com/OAPI/V2/Zone';

export default async function handler(req) {
  // Vercel Cron 인증 체크
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // ── 1단계: Zone 조회 ──────────────────────────────────────
    const zoneRes = await fetch(ECOUNT_ZONE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        COM_CODE: process.env.ECOUNT_COMPANY,
        USER_ID:  process.env.ECOUNT_ID,
      }),
    });

    const zoneData = await zoneRes.json();
    const zone = zoneData?.Data?.ZONE;

    if (!zone) {
      throw new Error(`Zone 조회 실패: ${JSON.stringify(zoneData)}`);
    }

    // ── 2단계: 로그인 → 세션 토큰 발급 ──────────────────────
    const loginRes = await fetch(
      `https://sboapi${zone}.ecount.com/OAPI/V2/OAPILogin`,
      {
        method: 'POST',
        headers: {
