// api/cron.js
// 매일 오전 8시(KST) = UTC 23시 실행
// 이카운트 로그인 → 미결재 목록 조회 → 카카오톡 전송

export default async function handler(req, res) {
  // Vercel Cron 또는 수동 실행만 허용
  const authHeader = req.headers['authorization'];
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. 이카운트 로그인
    const ecountItems = await getEcountPendingItems();
    
    // 2. 카카오톡 전송
    if (ecountItems.length === 0) {
      console.log('미결재 건 없음, 전송 생략');
      return res.status(200).json({ message: '미결재 건 없음' });
    }

    await sendKakaoMessage(ecountItems);
    return res.status(200).json({ message: '전송 완료', count: ecountItems.length });

  } catch (err) {
    console.error('오류:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── 이카운트 로그인 & 미결재 목록 조회 ──────────────────────────
async function getEcountPendingItems() {
  const COMPANY_CODE = process.env.ECOUNT_COMPANY;
  const USER_ID      = process.env.ECOUNT_ID;
  const PASSWORD     = process.env.ECOUNT_PW;

  // 1) 로그인 API 호출
  const loginRes = await fetch('https://loginca.ecount.com/ECERP/ECAPI/v2/GetSessionId', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      COM_CODE: COMPANY_CODE,
      USER_ID:  USER_ID,
      API_CERT_KEY: PASSWORD,
      LAN_TYPE: 'ko-KR',
      ZONE: 'CA'
    })
  });

  const loginData = await loginRes.json();
  
  if (!loginData?.Data?.Datas?.SESSION_ID) {
    throw new Error('이카운트 로그인 실패: ' + JSON.stringify(loginData));
  }

  const sessionId = loginData.Data.Datas.SESSION_ID;

  // 2) 미결재 목록 조회 (기안서통합관리 진행중)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

  const listRes = await fetch('https://loginca.ecount.com/ECERP/ECAPI/v2/Approval/GetApprovalList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `ECOUNT_SESSION_ID=${sessionId}`
    },
    body: JSON.stringify({
      SESSION_ID: sessionId,
      COM_CODE: COMPANY_CODE,
      FROM_DATE: dateStr,
      TO_DATE: dateStr,
      STATUS: '2', // 진행중
      LAN_TYPE: 'ko-KR'
    })
  });

  const listData = await listRes.json();
  const items = listData?.Data?.Datas || [];

  return items.map(item => ({
    type: item.APPR_TYPE_NM || '기안',
    title: item.APPR_TITLE || '(제목 없음)',
    requester: item.REG_USER_NM || '',
    date: item.REG_DT || ''
  }));
}

// ── 카카오톡 나에게 보내기 ────────────────────────────────────────
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

  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      template_object: JSON.stringify(templateObject)
    })
  });

  const data = await res.json();
  if (data.result_code !== 0) {
    throw new Error('카카오 전송 실패: ' + JSON.stringify(data));
  }
}
