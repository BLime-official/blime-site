// Google Apps Script 코드 (최소화: 빠른 응답, 단순 로직)

const SHEET_ID = '1SewQ1csdmjwShAKW5UoZj6dCkd6_15ndYvh-cfl4uYM';
const SHEET_NAME = 'Sheet1'; // 시트 탭 이름

// 웹 앱은 CORS를 자동 처리합니다. 별도 헤더 불필요.

// 날짜를 YYYY-MM-DD HH:MM 형식으로 포맷 (한국 시간대)
function formatTimestamp(date) {
  // date 인자가 없거나 유효하지 않으면 현재 시각 사용
  var d = (date && typeof date.getTime === 'function' && !isNaN(date.getTime()))
    ? date
    : new Date();
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
}

// 텍스트에서 iHerb URL 추출
function extractIHerbUrl(input) {
  if (!input) return null;
  
  // URL 패턴 매칭
  var urlPattern = /https?:\/\/[^\s<>"]+/gi;
  var matches = input.match(urlPattern);
  
  if (!matches) return null;
  
  // iHerb URL 찾기
  for (var i = 0; i < matches.length; i++) {
    var url = matches[i].trim();
    // URL이 iherb.co, iherb.com, *.iherb.com 도메인인지 확인
    if (url.match(/https?:\/\/([\w-]+\.)?iherb\.(co|com)/i)) {
      // 레퍼럴 코드와 UTM 파라미터 제거
      url = url.replace(/[?&](rcode|utm_[^&=]*)=[^&]*/gi, '');
      // 끝에 남은 ? 또는 & 제거
      url = url.replace(/[?&]+$/, '');
      return url;
    }
  }
  
  return null;
}

// POST 요청 처리
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return createResponse({ success: false, message: 'No data received' });
    }
    const data = JSON.parse(e.postData.contents);
    if (!data || !data.productUrl) {
      return createResponse({ success: false, message: 'Missing productUrl' });
    }
    
    // 텍스트에서 URL 추출
    const extractedUrl = extractIHerbUrl(data.productUrl);
    if (!extractedUrl) {
      return createResponse({ success: false, message: 'Invalid iHerb URL' });
    }
    
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const ts = new Date();
    sheet.appendRow([formatTimestamp(ts), extractedUrl]);
    return createResponse({ success: true, message: 'OK', timestamp: formatTimestamp(ts), url: extractedUrl });
  } catch (error) {
    return createResponse({ success: false, message: error.toString() });
  }
}

// GET 요청 처리 (상태 확인 및 URL 추가)
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'status') {
      return createResponse({ success: true, message: 'OK', timestamp: new Date().toISOString() });
    }
    if (action === 'add' && e.parameter.url) {
      const rawInput = decodeURIComponent(e.parameter.url);
      
      // 텍스트에서 URL 추출
      const extractedUrl = extractIHerbUrl(rawInput);
      if (!extractedUrl) {
        return createResponse({ success: false, message: 'Invalid iHerb URL' });
      }
      
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
      const ts = new Date();
      sheet.appendRow([formatTimestamp(ts), extractedUrl]);
      return createResponse({ success: true, message: 'OK', productUrl: extractedUrl });
    }
    return createResponse({ success: false, message: 'Invalid action' });
  } catch (error) {
    return createResponse({ success: false, message: error.toString() });
  }
}

// doOptions, URL 검증, 중복 체크 제거: 단순 저장만 수행

// 응답 생성
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 개발용 보조 함수 제거: 테스트/정리/변환 등 전부 삭제