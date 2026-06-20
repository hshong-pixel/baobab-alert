// api/cron.js
// 매일 오전 8시(KST) = UTC 23시 실행

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ecountItems = await getEcountPendingItems();
    
    if (ecountItems.length === 0) {
      return res.status(200).json({ message: '미결재 건 없음' });
    }

    await sendKakaoMessage(ecountItems);
    return res.status(200).json({ message: '전송 완료', count: ecountItems.length });

  } catch (err) {
    console.error('오류:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getEcountPendingItems() {
  const COMPANY_CODE = process.env.ECOUNT_COMPANY;
  const USER_ID      = process.env.ECOUNT_ID;
  const API_KEY      = process.env.ECOUNT_PW;

  // 1) ZONE 조회
  const zoneRes = await fetch('https://oapi.ecount.com/ECERP/OAPI/OAPIGetZoneList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ COM_CODE: COMPANY_CODE })
  });
  const zoneData = await zoneRes.json();
  const zone = zoneData?.Data?.Datas?.ZONE || 'CA';

  // 2) 로그인 → SESSION_ID 발급
  const loginRes = await fetch(`https://${zone}oapi.ecount.com/ECERP/OAPI/OAPILogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      COM_CODE: COMPANY_CODE,
      USER_ID: USER_ID,
      API_CERT_KEY: API_KEY,
      LAN_TYPE: 'ko-KR',
      ZONE: zone
    })
  });

  const loginData = await loginRes.json();
  
  if (!loginData?.Data?.Datas?.SESSION_ID) {
    throw new Error('이카운트 로그인 실패: ' + JSON.stringify(loginData));
  }

  const sessionId = loginData.Data.Datas.SESSION_ID;

  // 3) 미결재 목록 조회
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

  const listRes = await fetch(`https://${zone}oapi.ecount.com/ECERP/OAPI/OAPIApproval$GetList`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'SESSION_ID': sessionId
    },
    body: JSON.stringify({
      SESSION_ID: sessionId,
      COM_CODE: COMPANY_CODE,
      FROM_DATE: dateStr,
      TO_DATE: dateStr,
      APPR_STATUS: 'W',
      LAN_TYPE: 'ko-KR'
    })
  });

  const listData = await listRes.json();
  const items = listData?.Data?.Datas || [];

  return items.map(item => ({
    type: item.APPR_TYPE_NM || '기안',
    title: item.APPR_TITLE || '(제목 없음)',
    requester: item.REG_USER_NM || '',
  }));
}

async function sendKakaoMessage(items) {
  const accessToken = process.env.KAKAO_ACCESS_TOKEN;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = `${yesterday.getMonth()+1}월 ${yesterday.getDate()}일`;

  let msg = `🌳 바오밥 결재 알림\n📅 ${dateStr} 미결재 건\n${'─'.repeat(20)}\n\n`;
  items.forEach((item, i) => {
    msg += `${i+1}. [${item.type}] ${item.title}\n   요청자: ${item.requester}\n\n`;
  });
  msg += `${'─'.repeat(20)}\n총 ${items.length}건 결재 대기 중입니다.`;

  const templateObject = {
    object_type: 'text',
    text: msg,
    link: {
      web_url: 'https://erp.ecount.com',
      mobile_web_url: 'https://erp.ecount.com'
    },
    button_title: '이카운트 결재하기'
  };

  const
