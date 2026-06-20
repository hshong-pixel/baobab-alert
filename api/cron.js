export const config = { runtime: 'edge' };

const ECOUNT_ZONE_URL = 'https://oapi.ecount.com/OAPI/V2/Zone';

export default async function handler(req) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const zoneRes = await fetch(ECOUNT_ZONE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        COM_CODE: process.env.ECOUNT_COMPANY,
        USER_ID: process.env.ECOUNT_ID,
      }),
    });
    const zoneData = await zoneRes.json();
    const zone = zoneData?.Data?.ZONE;
    if (!zone) throw new Error(`Zone fail: ${JSON.stringify(zoneData)}`);

    const loginRes = await fetch(
      `https://sboapi${zone}.ecount.com/OAPI/V2/OAPILogin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify({
          COM_CODE: process.env.ECOUNT_COMPANY,
          USER_ID: process.env.ECOUNT_ID,
          API_CERT_KEY: process.env.ECOUNT_PW,
          LAN_TYPE: 'ko-KR',
          ZONE: zone,
        }),
      }
    );
    const loginData = await loginRes.json();
    const sessionId = loginData?.Data?.Datas?.SESSION_ID;
    if (!sessionId) throw new Error(`Login fail: ${JSON.stringify(loginData)}`);

    const approvalRes = await fetch(
      `https://sboapi${zone}.ecount.com/OAPI/V2/Approval/GetApprovalWaitList`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Cookie': `ecount_session_id=${sessionId}`,
        },
        body: JSON.stringify({
          COM_CODE: process.env.ECOUNT_COMPANY,
          SESSION_ID: sessionId,
          ZONE: zone,
        }),
      }
    );
    const approvalData = await approvalRes.json();
    const waitList = approvalData?.Data?.Datas ?? [];
    const waitCount = waitList.length;

    if (waitCount > 0) {
      const now = new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const message = {
        object_type: 'text',
        text: `🔔 이카운트 결재 알림 (${now})\n\n미결재 ${waitCount}건이 대기 중입니다.\n\n👉 https://sboapi${zone}.ecount.com`,
        link: {
          web_url: `https://sboapi${zone}.ecount.com`,
          mobile_web_url: `https://sboapi${zone}.ecount.com`,
        },
      };
      const kakaoRes = await fetch(
        'https://kapi.kakao.com/v2/api/talk/memo/default/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${process.env.KAKAO_ACCESS_TOKEN}`,
          },
          body: `template_object=${encodeURIComponent(JSON.stringify(message))}`,
        }
      );
      const kakaoData = await kakaoRes.json();
      if (kakaoData.result_code !== 0) throw new Error(`Kakao fail: ${JSON.stringify(kakaoData)}`);

      return new Response(
        JSON.stringify({ ok: true, waitCount, kakao: kakaoData }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, waitCount: 0, message: 'no pending approvals' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[baobab-alert] error:', err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
