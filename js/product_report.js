// 상품 정보 오류 알리기 스크립트. 상세 페이지의 "정보가 다르면 알려 주세요" 줄을 보이고, 누르면 입력 창을 열어 제보를 Edge Function(report-product-issue)에 보낸다.
// 비교 화면에서는 쿠팡에 다녀온 사람에게 한 번 묻기도 한다(아래 "쿠팡에서 돌아왔을 때").
// 상품 상세의 두 갈래(쿠팡 비교, iHerb 단독)에 싣는다(product_detail.html의 page_scripts: 단독은 product_detail.js 다음, 비교는 coupang_confirm.js 다음, 말풍선 앞). 전역은 남기지 않는다.
//
// 서버가 숨긴 채 그려 둔 마크업을 쓴다. 모양과 크기는 product_detail.css가 정한다.
//   진입점 [data-report-entry](hidden) 안에 단추 [data-report-open]과 보낸 뒤 글자 [data-report-sent], 닫힌 <dialog id="product-report">,
//   제보 데이터 <script id="product-report-data">({product_id, view, function_url, shown}).
//   비교 화면에는 진입점 바로 다음에 보조안 [data-report-return](hidden)도 있다. 안에 알려 주기 단추 [data-report-return-open]와 닫기(×) 단추 [data-report-return-close]가 있다.
//   이 스크립트는 진입점을 보이고, 창을 열고 닫고, 입력을 살피고, 제보를 보내고, 그날 보낸 기록을 남기고, 보조안을 띄우고 닫는 일을 맡는다.
//
// 뜨는 때: 아래를 모두 확인한 뒤에만 진입점의 hidden을 지운다. 하나라도 아니면 아무것도 하지 않아, 눌러도 아무 일 없는 단추가 보이지 않는다.
//   - 제보 데이터를 읽을 수 있고 function_url이 있다. 창과 진입점 마크업이 있고, 브라우저가 <dialog>의 showModal을 안다.
//   - window.BLIME_SUPABASE_CONFIG.anonKey(공개 키)가 비어 있지 않다.
//   - 제보 스타일이 실렸다: 새 CSS는 창(.report-dialog)에 --report-ready: 1을 둔다. 캐시된 옛 CSS에는 없어서 모양 없는 창이 뜨는 것을 막는다.
//   그날 이 상품의 제보를 이미 보냈으면 처음부터 단추 대신 "알려 주셔서 고마워요"를 보인다.
//
// 열 때: 진입점 단추를 누르면 폼을 비우고(열 때마다 빈 상태로 시작한다) showModal()로 연 뒤, 처음 포커스를 창 안쪽 상자(.report-body)에 둔다.
//   유형(라디오)을 고르면 그 라디오의 data-link, data-text, data-placeholder가 링크 칸(선택·필수), 자세히의 (선택), 자리표시를 정한다.
//   보내기는 유형을 고르고 그 유형의 필수 칸이 공백만이 아니고 자세히가 300자(코드 포인트, 서버와 같게)를 넘지 않을 때만 켠다.
//   필수 칸에는 aria-required="true"를 달고, 필수가 아니게 되면 뗀다. 자세히 칸 아래에 글자 수(N/300)를 보이고 300 이상이면 is-full을 붙인다.
//
// 보낼 때: 링크 칸이 보이고 값이 있으면 먼저 쿠팡 주소인지와 길이(2,000자)를 본다(서버와 같은 규칙, 아래 링크 규칙). 아니면 오류를 보이고 링크 칸에 포커스를 주고 멈춘다.
//   링크 칸이 숨어 있으면 거기 남은 값은 보내지도 검사하지도 않는다. 보내는 동안 보내기를 꺼서 두 번 눌러도 한 번만 가고, 15초 안에 답이 없으면 실패로 본다.
//   2xx면 창 안을 "고마워요!"로 바꾸고 그날 기록을 남긴다. 그 밖(4xx, 5xx, 네트워크 오류, 시간 초과)은 실패 줄을 보이고 입력을 그대로 둔다.
//   실패하면 콘솔에 HTTP 상태나 오류 이름만 경고로 남긴다(이용자가 쓴 글과 링크는 남기지 않는다).
//   보내는 중에 창을 닫으면 요청을 끊고 보내지 않은 것으로 친다.
//
// 끝나는 때: 취소 단추, Esc(브라우저 기본), 창 밖(바탕 막) 누르기, 보낸 뒤 화면의 닫기 단추로 닫는다. 닫히면(close 이벤트) 포커스를 연 요소로 돌린다.
//   보낸 뒤라 그 요소가 숨었으면 보낸 뒤 글자로 돌린다.
//   창 밖 누르기는 쿠팡 이동 확인 팝업(coupang_confirm.js)과 같은 규칙이다. 다음 두 가지가 모두 맞을 때만 닫는다.
//   - 누른 곳(pointerdown)도 바탕 막이었다. 창 안에서 눌러 바탕 막에서 놓은 끌기(글자 고르기)는 click이 창으로 오지만 닫지 않는다.
//   - 창이 열린 지 OUTSIDE_GUARD_MS가 지났다. 더블클릭이나 빠른 두 번 두드림의 두 번째 누름은 이미 열린 창의 바탕 막에 닿는다.
//
// 쿠팡에서 돌아왔을 때(보조안, 비교 화면만): 이 페이지에서 쿠팡으로 실제로 떠났다가 숨겨졌던 페이지가 다시 보이면, 진입점 자리에 "쿠팡에서 본 상품이나 가격이 달랐나요?"를 한 번 묻는다.
//   떠남: 문서의 click 가운데 기본 동작이 막히지 않은 주 단추 클릭이 쿠팡 구매 버튼(a.btn-store--coupang)이나 확인 팝업의 쿠팡으로 이동(a[data-coupang-confirm-go])에 닿은 것이다.
//     이 스크립트는 확인 팝업(coupang_confirm.js)보다 뒤에 실려 같은 click을 그 뒤에 받는다. 그래서 팝업이 가로챈 클릭은 이미 defaultPrevented라 아직 떠난 것이 아니다.
//     판매자 배송 버튼(data-seller-delivery)은 떠남으로 치지 않는다: 이 질문은 로켓직구 연결이 맞는지 묻는 것이라, 판매자 배송으로 바뀐 상품에는 맞지 않는다.
//   돌아옴: 떠난 뒤 페이지가 숨겨졌다가(visibilitychange) 다시 보인다. 떠난 뒤 한 번도 숨겨지지 않았으면(Ctrl+클릭으로 뒤에 연 탭 등) 돌아온 것이 아니다.
//     같은 탭에서 쿠팡에 갔다가 뒤로 가기 캐시(bfcache)에서 되살아난 페이지는 visibilitychange가 오지 않을 수 있다. 떠남 표시는 되살아난 페이지에 그대로 남아 있으니 pageshow(persisted)도 돌아옴으로 본다.
//   돌아오면 떠남 표시를 지우고, 이 상품의 오늘 제보 기록(blime:report:sent)도 보조안 기록(blime:report:return)도 없고 입력 창이 닫혀 있을 때만 띄운다. 띄우면 진입점 줄을 숨기고 오늘을 blime:report:return에 남긴다.
//     이 페이지에서 이미 보냈으면(보낸 뒤 글자가 보인다) 띄우지 않는다. 저장소가 막혀 그날 기록을 남기지 못했어도 같다.
//   알려 주기는 입력 창을 "쿠팡 상품이 달라요"로 골라 연다. ×는 보조안을 닫고 진입점 줄을 돌려놓은 뒤 진입점 단추에 포커스를 준다(단추가 숨어 있으면 보낸 뒤 글자에). 제보를 보내면 보조안도 닫는다(진입점 줄은 보낸 뒤 글자로 돌아온다).
//   앱 모드(BlimeApp 웹뷰)에서 쿠팡이 다른 앱·브라우저로 열렸다 돌아올 때 visibilitychange가 오는지는 자동 테스트로 볼 수 없다. 오지 않으면 보조안이 뜨지 않을 뿐이고 진입점은 그대로다.
//
// 저장 형식: localStorage blime:report:sent = JSON 객체 {"<상품 번호>": "YYYY-MM-DD"}(한국 날짜). 오늘 날짜인 항목만 쓰고, 쓸 때 오늘이 아닌 항목을 지운다.
//   보조안을 띄운 날은 같은 형식으로 blime:report:return에 남긴다.
//   날짜를 UTC로 자르면 한국의 아침(09시 전)에는 전날이 되므로, 한국 시각(UTC+9)으로 옮겨 자른다. 한국 날짜가 바뀌면 다시 단추다.
//   readDays, rememberToday는 키를 받아, 같은 형식의 두 기록(보낸 기록, 보조안 기록)이 함께 쓴다.
//
// 안전장치: 저장소를 읽을 수 없거나(사파리 사생활 보호 모드 등) 값이 깨졌거나 객체가 아니면(배열, null 등) 기록이 없는 것으로 본다. 다른 상품이나 지난 날짜의 기록도 세지 않는다.
//   쓰지 못하면 기록만 건너뛴다. 어느 경우에도 제보는 그대로 보낼 수 있다. 보조안은 그러면 돌아올 때마다 뜰 수 있다.
(() => {
    // 보낸 기록의 키
    const SENT_KEY = "blime:report:sent";
    // 보조안(쿠팡에서 돌아왔을 때 묻는 줄)을 띄운 기록의 키. 보낸 기록과 같은 형식이다.
    const RETURN_KEY = "blime:report:return";
    // 보조안의 알려 주기가 입력 창을 열 때 미리 고르는 유형
    const RETURN_KIND = "coupang_product";
    // 쿠팡으로 떠나는 링크: 쿠팡 구매 버튼(일반 쪽, 할인코드 적용가 쪽, 품절 표시 포함. 판매자 배송 버튼은 뺀다)과 쿠팡 이동 확인 팝업의 이동 링크
    const LEAVE_SELECTOR = "a.btn-store--coupang:not([data-seller-delivery]), a[data-coupang-confirm-go]";
    // 자세히 칸의 글자 수 한도. 칸의 maxlength, 서버의 한도와 같다. 글자 수 표시(N/300)는 칸이 maxlength로 세는 대로 value.length(UTF-16 단위)로 세고,
    // 보내기를 켜는 조건(canSend)은 서버처럼 앞뒤 공백을 뺀 글을 코드 포인트로 센다.
    const MESSAGE_MAX = 300;
    // 링크 칸에서 읽은 주소의 최대 길이. 표의 link CHECK(char_length <= 2000), Edge Function(link.ts)의 LINK_MAX와 같다.
    // 넘으면 쿠팡 주소가 아닐 때와 같은 링크 오류를 보인다(서버가 400으로 거절하면 이용자에게는 "잠시 뒤 다시"만 보인다).
    const LINK_MAX = 2000;
    // 창이 열린 직후 이 시간(ms) 동안의 바깥 누르기는 닫지 않는다. 더블클릭 간격(최대 약 500ms)을 덮는다.
    const OUTSIDE_GUARD_MS = 500;
    // 보낸 지 이 시간(ms) 안에 답이 없으면 실패로 본다.
    const SEND_TIMEOUT_MS = 15000;
    const LINK_LABEL_REQUIRED = "쿠팡 상품 링크";
    const SENDING_LABEL = "보내는 중…";

    // 링크 규칙의 본문(양 끝 기호는 뺐다). SQL CHECK(admin/sql/018_product_reports.sql)와 Edge Function(supabase/functions/report-product-issue/link.ts)이 같은 글자를 쓴다.
    // 정적 사이트는 Deno 모듈을 가져올 수 없어 한 벌 더 둔다. tests/test_product_reports_sql.py가 이 글자가 공용 본문과 같음을 고정하고,
    // tests/site/test_product_report.py가 공용 케이스(link_cases.json)에 같게 답하는지 본다. 그래서 이 템플릿 안에는 본문만 둔다.
    const COUPANG_LINK_BODY = String.raw`https?://([a-z0-9-]+\.)*coupang\.com(:[0-9]*)?([/?#][\x21-\x5b\x5d-\x7e]*)?`;
    const COUPANG_LINK = new RegExp("^" + COUPANG_LINK_BODY + "$", "i");

    // 링크 칸의 값에서 주소를 읽는다. 쿠팡 앱의 공유 문구처럼 글과 주소가 섞여 붙여 넣어져도 받도록, 앞뒤 공백을 뺀 값에서 첫 http(s) 덩어리를 쓰고 없으면 값 전체를 쓴다.
    // link.ts의 extractLink와 같다.
    function extractLink(raw) {
        const trimmed = raw.trim();
        const found = trimmed.match(/https?:\/\/\S+/i);
        return found ? found[0] : trimmed;
    }

    function isCoupangLink(link) {
        return COUPANG_LINK.test(link);
    }

    // 한국 날짜 YYYY-MM-DD
    function today() {
        return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    }

    // 키에 남은 기록 가운데 오늘 날짜인 항목만 {상품 번호: 날짜}로 돌려준다.
    // 읽지 못하거나(저장소 막힘) 깨졌거나 객체가 아니면(배열, null 등) 기록이 없는 것이다.
    function readDays(key) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return {};
            const stored = JSON.parse(raw);
            if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return {};
            const day = today();
            return Object.fromEntries(Object.entries(stored).filter(([, value]) => value === day));
        } catch (error) {
            return {};
        }
    }

    // 이 상품의 오늘을 기록한다. 오늘이 아닌 기록은 이때 지워 값이 계속 늘지 않게 한다. 쓰지 못해도 그냥 넘어간다.
    function rememberToday(key) {
        try {
            localStorage.setItem(key, JSON.stringify({ ...readDays(key), [productId]: today() }));
        } catch (error) {
            // 저장소를 쓸 수 없는 브라우저: 기록만 건너뛴다.
        }
    }

    // 제보 데이터({product_id, view, function_url, shown})를 읽는다. 없거나 깨졌거나 값이 모자라면 null이다.
    function readData() {
        try {
            const node = document.getElementById("product-report-data");
            const parsed = node ? JSON.parse(node.textContent) : null;
            if (!parsed || typeof parsed !== "object") return null;
            if (!Number.isInteger(parsed.product_id) || parsed.product_id <= 0) return null;
            if (typeof parsed.view !== "string" || !parsed.view) return null;
            if (typeof parsed.function_url !== "string" || !parsed.function_url) return null;
            // 서버가 채운 화면 값은 운영자가 보는 참고용이다. 없거나 깨졌어도 제보는 보낸다.
            const shown = parsed.shown && typeof parsed.shown === "object" ? parsed.shown : {};
            return { productId: parsed.product_id, view: parsed.view, functionUrl: parsed.function_url, shown };
        } catch (error) {
            return null;
        }
    }

    const data = readData();
    const dialog = document.getElementById("product-report");
    const entry = document.querySelector("[data-report-entry]");
    // 제보 데이터, 창, 진입점 중 하나라도 없는 HTML(옛 HTML이 캐시에 남았거나 배포가 어긋난 경우)에서는 아무것도 하지 않는다.
    if (!data || !dialog || !entry) return;

    const productId = data.productId;
    const config = window.BLIME_SUPABASE_CONFIG;
    const anonKey = config && typeof config.anonKey === "string" ? config.anonKey : "";
    const openButton = entry.querySelector("[data-report-open]");
    const sentText = entry.querySelector("[data-report-sent]");
    const dialogBody = dialog.querySelector(".report-body");
    const form = dialog.querySelector("[data-report-form]");
    const done = dialog.querySelector("[data-report-done]");
    const doneTitle = dialog.querySelector(".report-done-title");
    const closeButton = dialog.querySelector("[data-report-close]");
    const cancelButton = dialog.querySelector("[data-report-cancel]");
    const send = dialog.querySelector("[data-report-send]");
    const kinds = dialog.querySelectorAll("input[type=radio][name=kind]");
    const linkField = dialog.querySelector("[data-report-link-field]");
    const linkLabel = dialog.querySelector("[data-report-link-label]");
    const linkOptional = dialog.querySelector("[data-report-link-optional]");
    const linkInput = dialog.querySelector("input[name=link]");
    const linkError = dialog.querySelector("[data-report-link-error]");
    const textInput = dialog.querySelector("textarea[name=message]");
    const textOptional = dialog.querySelector("[data-report-text-optional]");
    const count = dialog.querySelector("[data-report-count]");
    const trap = dialog.querySelector("input[name=website]");
    const fail = dialog.querySelector("[data-report-fail]");
    // 보조안: 비교 화면의 마크업에만 있다(단독 화면과 옛 HTML에는 없다).
    const returnBox = document.querySelector("[data-report-return]");
    const returnOpen = returnBox && returnBox.querySelector("[data-report-return-open]");
    const returnClose = returnBox && returnBox.querySelector("[data-report-return-close]");

    // 제보 스타일이 실렸는가
    function stylesLoaded() {
        return getComputedStyle(dialog).getPropertyValue("--report-ready").trim() === "1";
    }

    const markup = [openButton, sentText, dialogBody, form, done, doneTitle, closeButton, cancelButton, send];
    const fields = [linkField, linkLabel, linkOptional, linkInput, linkError, textInput, textOptional, count, trap, fail];
    if (![...markup, ...fields].every(Boolean) || kinds.length === 0) return;
    if (!anonKey || typeof dialog.showModal !== "function" || !stylesLoaded()) return;

    // 보조안을 쓸 수 있는가: 비교 화면이고 마크업이 다 있다. 아니면 보조안은 없는 것으로 두고, 진입점과 창은 그대로 쓴다.
    const returnReady = data.view === "compare" && Boolean(returnOpen && returnClose);

    // 마크업에 있는 글자는 되돌릴 때 쓰려고 읽어 둔다(글자를 스크립트에 한 벌 더 두지 않는다).
    const linkLabelOptional = linkLabel.textContent;
    const textPlaceholder = textInput.getAttribute("placeholder") || "";
    const sendLabel = send.textContent.trim();

    // 창을 연 요소. 닫히면 포커스를 돌려줄 곳이다.
    let opener = null;
    // 창을 연 때(performance.now())
    let openedAt = 0;
    // 마지막 누름(pointerdown)이 바탕 막(창 자체)이었는가
    let pressedOnBackdrop = false;
    // 보내는 중인 요청을 끊는 장치. 보내는 중이 아니면 null이다(보내는 중인지의 기준이기도 하다).
    let pending = null;
    // 쿠팡으로 떠났는가: 기본 동작이 막히지 않은 쿠팡 링크 클릭이 있었다(보조안)
    let left = false;
    // 떠난 뒤 이 페이지가 숨겨졌는가(보조안)
    let away = false;

    // 진입점을 보이거나 숨긴다. 서버는 숨긴 채 그려 두고, 위의 확인을 모두 마친 뒤에만 보인다.
    function showEntry(visible) {
        entry.hidden = !visible;
    }

    // 단추 대신 "알려 주셔서 고마워요"를 보인다(보기만 바꾸고 기록은 하지 않는다).
    function showSentText() {
        openButton.hidden = true;
        sentText.hidden = false;
    }

    // 보조안을 닫고 진입점 줄을 돌려놓는다. 보조안이 없거나 떠 있지 않으면 아무것도 하지 않는다.
    function hideReturn() {
        if (!returnReady || returnBox.hidden) return;
        returnBox.hidden = true;
        showEntry(true);
    }

    // 제보를 보냈다: 단추를 숨기고 보낸 뒤 글자를 보이고 오늘을 기록한다. 보조안이 떠 있었으면 닫는다(진입점 줄이 보낸 뒤 글자로 돌아온다).
    function markSent() {
        showSentText();
        hideReturn();
        rememberToday(SENT_KEY);
    }

    function selectedKind() {
        return form.querySelector("input[name=kind]:checked");
    }

    // 보내기를 켤 수 있는가: 유형을 골랐고, 그 유형의 필수 칸이 공백만이 아니고, 자세히가 MESSAGE_MAX자를 넘지 않는다.
    // 칸의 maxlength가 막아도 한글 조합(IME) 중에는 값이 그 길이를 넘을 수 있다. 서버(handler.ts)처럼 앞뒤 공백을 뺀 글을 코드 포인트로 센다.
    function canSend() {
        const kind = selectedKind();
        if (!kind) return false;
        if (kind.dataset.text === "required" && !textInput.value.trim()) return false;
        if (kind.dataset.link === "required" && !linkInput.value.trim()) return false;
        if ([...textInput.value.trim()].length > MESSAGE_MAX) return false;
        return true;
    }

    // 필수 칸을 화면 읽기 프로그램에도 필수로 알린다. 필수가 아니면 속성을 뗀다.
    function setRequired(input, required) {
        if (required) input.setAttribute("aria-required", "true");
        else input.removeAttribute("aria-required");
    }

    // 고른 유형과 입력에 맞춰 링크 칸, 자세히의 (선택), 자리표시, 글자 수, 보내기를 고친다.
    function sync() {
        const kind = selectedKind();
        const linkMode = kind ? kind.dataset.link : "";
        linkField.hidden = !linkMode;
        if (linkMode) {
            const required = linkMode === "required";
            linkLabel.textContent = required ? LINK_LABEL_REQUIRED : linkLabelOptional;
            linkOptional.hidden = required;
        }
        setRequired(linkInput, linkMode === "required");
        const textRequired = Boolean(kind) && kind.dataset.text === "required";
        textOptional.hidden = textRequired;
        setRequired(textInput, textRequired);
        textInput.placeholder = kind ? kind.dataset.placeholder : textPlaceholder;
        const length = textInput.value.length;
        count.textContent = `${length}/${MESSAGE_MAX}`;
        count.classList.toggle("is-full", length >= MESSAGE_MAX);
        send.disabled = pending !== null || !canSend();
    }

    // 링크 오류는 보일 때만 칸이 가리킨다(aria-invalid와 aria-describedby를 함께 달고 함께 뗀다). 숨은 오류 글이 늘 읽히지 않게 하려는 것이다.
    function showLinkError() {
        linkInput.setAttribute("aria-invalid", "true");
        linkInput.setAttribute("aria-describedby", linkError.id);
        linkError.hidden = false;
    }

    function clearLinkError() {
        linkInput.removeAttribute("aria-invalid");
        linkInput.removeAttribute("aria-describedby");
        linkError.hidden = true;
    }

    // 보내는 중이면(controller) 회전 표시와 "보내는 중…"을 보이고 끈다. 아니면(null) "보내기"로 되돌린다.
    function setSending(controller) {
        pending = controller;
        if (controller) {
            const spinner = document.createElement("span");
            spinner.className = "report-spinner";
            send.replaceChildren(spinner, SENDING_LABEL);
        } else {
            send.textContent = sendLabel;
        }
        sync();
    }

    // 열 때마다 빈 상태로 시작한다.
    function resetForm() {
        form.reset();
        clearLinkError();
        fail.hidden = true;
        form.hidden = false;
        done.hidden = true;
        setSending(null);
    }

    // 입력 창을 연다. from은 닫힌 뒤 포커스를 돌려줄 요소(없으면 null), presetKind는 미리 골라 둘 유형 값이다.
    function openDialog(from, presetKind) {
        if (dialog.open) return;
        resetForm();
        const preset = presetKind ? Array.from(kinds).find((input) => input.value === presetKind) : null;
        if (preset) {
            preset.checked = true;
            sync();
        }
        dialog.showModal();
        opener = from || null;
        openedAt = performance.now();
        pressedOnBackdrop = false;
        // tabindex="-1"인 안쪽 상자는 포커스를 받을 수 있는 첫 요소라 브라우저가 이미 여기에 주는 경우가 많다(첫 라디오가 아니다).
        // 첫 조작 요소(라디오)에 주는 엔진을 위해 확실히 옮긴다. 라디오에 가면 포커스 테두리가 생긴다.
        dialogBody.focus({ preventScroll: true });
    }

    // 제보를 보낸다. 쿠팡 주소가 아니면 보내지 않고 오류를 보인다.
    async function submit() {
        if (pending || !canSend()) return;
        const kind = selectedKind();

        // 링크 칸이 보이고 값이 있을 때만 읽어 검사한다. 숨은 칸에 남은 값은 보내지 않는다.
        let link = null;
        if (!linkField.hidden && linkInput.value.trim()) {
            link = extractLink(linkInput.value);
            if (link.length > LINK_MAX || !isCoupangLink(link)) {
                showLinkError();
                linkInput.focus();
                return;
            }
        }

        const root = document.documentElement;
        const payload = JSON.stringify({
            productId,
            view: data.view,
            kind: kind.value,
            message: textInput.value.trim() || null,
            link,
            // 서버가 채운 화면 값에, 보내는 때의 브라우저 값 둘을 더한다.
            shown: { ...data.shown, code_view: root.dataset.iherbCode === "on", app: root.classList.contains("app-mode") },
            website: trap.value,
        });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
        fail.hidden = true;
        setSending(controller);
        let ok = false;
        // 보내지 못한 까닭: HTTP 상태나 오류 이름. 콘솔 경고에만 쓴다(이용자가 쓴 글과 링크는 남기지 않는다).
        let reason = "";
        try {
            const response = await fetch(data.functionUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
                body: payload,
                signal: controller.signal,
            });
            ok = response.ok;
            reason = `HTTP ${response.status}`;
        } catch (error) {
            // 네트워크 오류(TypeError), 시간 초과(AbortError), 창을 닫아 끊음: 보내지 못한 것이다.
            reason = (error && error.name) || "unknown";
        } finally {
            clearTimeout(timer);
        }
        // 창이 닫혀 끊은 요청의 답은 화면에 쓰지 않는다.
        if (pending !== controller) return;
        setSending(null);
        if (!ok) {
            console.warn("[product_report] 제보를 보내지 못했습니다:", reason);
            fail.hidden = false;
            // 보내는 동안 꺼진 보내기 단추가 포커스를 쥐고 있었다면 포커스가 body로 빠진다. 다시 보낼 수 있게 단추로 돌린다.
            if (document.activeElement === document.body) send.focus();
            return;
        }
        form.hidden = true;
        done.hidden = false;
        doneTitle.focus();
        markSent();
    }

    openButton.addEventListener("click", () => openDialog(openButton));

    form.addEventListener("change", (event) => {
        if (event.target.name !== "kind") return;
        clearLinkError();
        sync();
    });
    textInput.addEventListener("input", sync);
    linkInput.addEventListener("input", () => {
        clearLinkError();
        sync();
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        submit();
    });

    cancelButton.addEventListener("click", () => dialog.close());
    closeButton.addEventListener("click", () => dialog.close());

    // 창 밖 누르기: 안쪽 여백까지 .report-body가 채우므로, 창 자체가 눌린 것은 바탕 막을 누른 것이다.
    // click의 대상만 보면 안 된다. 창 안에서 눌러 바탕 막에서 놓으면 브라우저는 click을 공통 조상인 창에 보낸다. 그래서 누른 곳(pointerdown)도 함께 본다.
    dialog.addEventListener("pointerdown", (event) => {
        pressedOnBackdrop = event.target === dialog;
    });

    dialog.addEventListener("click", (event) => {
        const outside = event.target === dialog && pressedOnBackdrop;
        pressedOnBackdrop = false;
        // 열린 직후는 더블클릭의 두 번째 누름일 수 있어 닫지 않는다
        if (outside && performance.now() - openedAt >= OUTSIDE_GUARD_MS) dialog.close();
    });

    // 무엇으로 닫혔든(취소, 바깥, Esc, 닫기) 보내는 중이던 요청을 끊고 포커스를 연 요소로 돌린다.
    dialog.addEventListener("close", () => {
        if (pending) {
            const controller = pending;
            setSending(null);
            controller.abort();
        }
        const from = opener;
        opener = null;
        if (from && from.isConnected) {
            from.focus();
            if (document.activeElement === from) return;
        }
        // 보낸 뒤라 그 요소가 숨었으면 보낸 뒤 글자로 돌린다.
        if (!sentText.hidden) sentText.focus();
    });

    // 문서의 click: 기본 동작이 막히지 않은 주 단추 클릭이 쿠팡 링크에 닿았으면 쿠팡으로 떠난 것이다.
    // 이 스크립트가 coupang_confirm.js보다 뒤에 실려 같은 click을 그 뒤에 받으므로, 확인 팝업이 가로챈 클릭은 이미 defaultPrevented다.
    function noteLeaving(event) {
        if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
        if (event.target.closest(LEAVE_SELECTOR)) left = true;
    }

    // 쿠팡에서 돌아왔다. 떠남 표시를 지우고, 이 상품의 오늘 제보나 보조안 기록이 없고 창이 닫혀 있을 때만 보조안을 띄운다(진입점 줄은 그동안 숨긴다).
    // 이 페이지에서 이미 보냈으면(보낸 뒤 글자가 보인다) 띄우지 않는다. 저장소가 막히면 보낸 기록을 읽지 못하므로 화면을 함께 본다.
    function cameBack() {
        left = false;
        away = false;
        if (dialog.open || !sentText.hidden) return;
        if (readDays(SENT_KEY)[productId] || readDays(RETURN_KEY)[productId]) return;
        showEntry(false);
        returnBox.hidden = false;
        rememberToday(RETURN_KEY);
    }

    if (returnReady) {
        document.addEventListener("click", noteLeaving);
        // 떠난 뒤 페이지가 숨겨졌다가 다시 보이면 돌아온 것이다.
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                if (left) away = true;
            } else if (away) {
                cameBack();
            }
        });
        // 같은 탭에서 쿠팡에 갔다가 뒤로 가기 캐시에서 되살아난 페이지는 visibilitychange가 오지 않을 수 있다. 떠남 표시는 되살아난 페이지에 그대로 남아 있다.
        window.addEventListener("pageshow", (event) => {
            if (event.persisted && left) cameBack();
        });
        returnOpen.addEventListener("click", () => openDialog(returnOpen, RETURN_KIND));
        returnClose.addEventListener("click", () => {
            hideReturn();
            // 진입점 단추가 숨어 있으면(이 페이지에서 이미 보냈다) 포커스는 보낸 뒤 글자로 간다.
            (openButton.hidden ? sentText : openButton).focus();
        });
    }

    if (readDays(SENT_KEY)[productId]) showSentText();
    showEntry(true);
})();
