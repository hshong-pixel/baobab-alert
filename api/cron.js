export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  const now = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const message = {
    object_type: 'text',
    text: `🔔 이카운트 결재 확인 (${now})\n\n미결재 건을 확인해주세요.\n\n👉 https://ecerp.ecount.com`,
    link: {
      web_url: 'https://ecerp.ecount.com',
      mobile_web_url: 'https://ecerp.ecount.com',
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
  return res.status(200).json({ ok: true, kakao: kakaoData });
}
