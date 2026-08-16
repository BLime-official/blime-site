// 새 기능 안내 말풍선. 가격 보기 설정(iHerb 할인 적용가 보기)을 아직 켜지 않은 방문자에게 상품 상세에서 계정 화면을 짚어 준다.
// 운영값이 있는 사이트의 상품 상세 페이지만 싣는다(product_detail.html의 page_scripts 맨 끝). 전역은 남기지 않는다.
//
// 모양과 자리: div.iherb-code-coach[role=note] 안에 본문 링크(a.iherb-code-coach-body, 계정 화면의 #price-view로 간다)와 닫기 단추를 둔다.
//   모바일(768px 이하)은 하단 바(.mobile-bottom-nav)에 붙어 '계정' 탭 위에 걸리고(iherb-code-coach--nav),
//   PC는 헤더의 계정 단추 자리([data-account-menu])에 붙어 그 아래에 걸린다(iherb-code-coach--header). 창이 768px 경계를 넘으면 같은 요소를 다른 자리로 옮긴다.
//   크기·자리·색은 product_detail.css가 정한다. 요소는 DOM API로 만들고 글자는 textContent로 넣는다.
//
// 뜨는 때: 페이지를 연 1초 뒤에 조건을 보고 뜬다(그 1초 안에 price_view.js가 낡은 사본을 DB 값으로 고칠 수 있다). 조건은 모두 만족해야 한다.
//   - 앱 모드(html.app-mode)가 아니다.
//   - 가격 보기가 꺼져 있다(<html data-iherb-code> 표시가 없다).
//   - 이 기기의 기록(localStorage blime:coach:iherb-code = {"days": ["YYYY-MM-DD", ...], "done": 끝남})을 읽을 수 있고,
//     끝나지 않았고, 오늘 아직 띄우지 않았고, 띄운 날이 3일 미만이다. 날짜는 브라우저 지역 시각 기준이다.
//   띄우면 오늘을 기록한다. 기록하지 못하는 브라우저(용량 초과, 사생활 보호 모드)에서는 같은 말풍선이 날마다 되풀이되므로 띄우지 않는다.
//
// 끝나는 때: 닫기를 누르면 지우고 끝남으로 기록한다. 본문을 누르면 끝남으로 기록하고 이동은 그대로 일어난다.
//   설정이 켜지면(blime:iherb-code-changed) 지운다. 그때 기록을 끝남으로 바꾸는 쪽은 price_view.js다.
//   뒤로 가기 캐시에서 되살아난 페이지는 스크립트가 다시 돌지 않아 떠나 있는 동안 끝난 것을 모른다. 그때(pageshow)는 기록을 다시 읽어 맞춘다.
(() => {
    const root = document.documentElement;
    const percent = Number(root.getAttribute("data-iherb-code-percent"));
    // 운영값이 없는 HTML(기능이 꺼진 사이트)에서는 아무것도 하지 않는다.
    if (!(percent > 0)) return;

    const markName = "data-iherb-code";
    const coachKey = "blime:coach:iherb-code";
    const changedEvent = "blime:iherb-code-changed";
    const showDelay = 1000;
    const maxDays = 3;
    const mobileQuery = window.matchMedia("(max-width: 768px)");

    // 지금 떠 있는 말풍선. 없으면 null
    let coach = null;

    function isOn() {
        return root.getAttribute(markName) === "on";
    }

    // 브라우저 지역 날짜 YYYY-MM-DD. toISOString()은 UTC라 한국의 아침에는 전날이 된다.
    function today() {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, "0");
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    // 이 기기의 말풍선 기록. 기록이 없으면 빈 기록이다. 저장소를 읽을 수 없거나 기록이 깨졌으면 null이다(띄우지 않는다).
    function readRecord() {
        try {
            const stored = JSON.parse(localStorage.getItem(coachKey));
            if (stored === null) return { days: [], done: false };
            if (typeof stored !== "object" || !Array.isArray(stored.days)) return null;
            return { days: stored.days, done: stored.done === true };
        } catch (error) {
            return null;
        }
    }

    // 기록을 쓰고 썼는지 알린다.
    function writeRecord(record) {
        try {
            localStorage.setItem(coachKey, JSON.stringify(record));
            return true;
        } catch (error) {
            return false;
        }
    }

    // 말풍선을 끝낸다. 띄운 날은 그대로 두고 끝남으로 바꾼다.
    function finish() {
        const record = readRecord() ?? { days: [] };
        writeRecord({ days: record.days, done: true });
    }

    function remove() {
        coach?.remove();
        coach = null;
    }

    // 지금 띄워도 되면 읽은 기록을, 아니면 null을 돌려준다.
    function showableRecord() {
        if (root.classList.contains("app-mode") || isOn()) return null;
        const record = readRecord();
        if (!record || record.done || record.days.length >= maxDays || record.days.includes(today())) return null;
        return record;
    }

    function createCoach() {
        const element = document.createElement("div");
        element.className = "iherb-code-coach";
        element.setAttribute("role", "note");

        const body = document.createElement("a");
        body.className = "iherb-code-coach-body";
        body.setAttribute("href", `${document.body.dataset.siteRoot ?? ""}account/#price-view`);
        const chip = document.createElement("span");
        chip.className = "iherb-code-coach-new";
        chip.textContent = "NEW";
        const go = document.createElement("span");
        go.className = "iherb-code-coach-go";
        go.textContent = "계정에서 켜기 →";
        body.append(chip, ` iHerb 가격을 ${percent}% 할인 적용가로 볼 수 있어요`, go);
        // 이동은 그대로 일어난다. 끝남만 기록한다.
        body.addEventListener("click", finish);

        const close = document.createElement("button");
        close.className = "iherb-code-coach-close";
        close.type = "button";
        close.setAttribute("aria-label", "닫기");
        close.textContent = "×";
        close.addEventListener("click", () => {
            finish();
            remove();
        });

        element.append(body, close);
        return element;
    }

    // 화면 폭에 맞는 자리에 붙인다: 모바일은 하단 바, PC는 헤더의 계정 단추 자리. 붙일 자리가 없으면 false다.
    function place() {
        const mobile = mobileQuery.matches;
        const anchor = document.querySelector(mobile ? ".mobile-bottom-nav" : "[data-account-menu]");
        if (!anchor) return false;
        coach.classList.toggle("iherb-code-coach--nav", mobile);
        coach.classList.toggle("iherb-code-coach--header", !mobile);
        if (coach.parentNode !== anchor) anchor.appendChild(coach);
        return true;
    }

    function show() {
        const record = showableRecord();
        if (!record) return;

        coach = createCoach();
        // 그린 다음 오늘을 기록한다. 기록하지 못하면 거둔다. 같은 작업 안이라 화면에는 나가지 않는다.
        if (!place() || !writeRecord({ days: [...record.days, today()], done: false })) remove();
    }

    // 창이 768px 경계를 넘으면(태블릿 회전, 창 크기 조절) 떠 있는 말풍선을 다른 자리로 옮긴다.
    function relocate() {
        if (coach) place();
    }

    if (typeof mobileQuery.addEventListener === "function") {
        mobileQuery.addEventListener("change", relocate);
    } else if (typeof mobileQuery.addListener === "function") {
        mobileQuery.addListener(relocate);
    }

    window.addEventListener(changedEvent, (event) => {
        if (event.detail?.on) remove();
    });

    window.addEventListener("pageshow", (event) => {
        if (!event.persisted || !coach) return;
        const record = readRecord();
        if (isOn() || !record || record.done) remove();
    });

    window.setTimeout(show, showDelay);
})();
