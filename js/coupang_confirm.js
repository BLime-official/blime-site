// 쿠팡 이동 확인 팝업을 여는 스크립트. 비교 화면에서 쿠팡 구매 버튼을 누르면 쿠팡으로 바로 가지 않고 "한 번 더 확인해 주세요" 창을 먼저 띄운다.
// 비교 화면의 상품 상세에만 싣는다(product_detail.html의 page_scripts, product_compare.js 다음). 전역은 남기지 않는다.
//
// 창은 서버가 숨긴 채 그려 둔 <dialog id="coupang-confirm">이다. 모양과 크기는 product_detail.css가 정한다.
//   안에는 체크 상자([data-coupang-confirm-skip]), 취소 단추([data-coupang-confirm-cancel]), 이동 링크(a[data-coupang-confirm-go])가 있다.
//   이 스크립트는 열고 닫는 일과 "오늘 하루 보지 않기" 기록만 맡는다.
//
// 뜨는 때: 문서의 click을 위임으로 받아, 누른 것이 쿠팡 구매 버튼(a.btn-store--coupang)이면 가로채서 창을 연다(showModal).
//   일반 쪽 버튼 줄도, 할인코드 적용가 쪽 버튼 줄도, 품절 표시(is-unavailable) 버튼도 같다. Ctrl·Cmd·Shift를 누르고 눌러도 가로챈다.
//   판매자 배송 버튼(data-seller-delivery)만 가로채지 않는다: 팝업은 로켓직구 배송을 확인하라는 내용이라, 판매자 배송으로 바뀐 상품에는 맞지 않는다.
//   열 때 체크를 풀고, 이동 링크의 href를 누른 버튼의 href로 맞추고, 처음 포커스를 창 안쪽 상자(.coupang-confirm-body)에 둔다.
//   다음 경우에는 가로채지 않고 링크가 그대로 쿠팡으로 간다.
//   - 오늘 하루 보지 않기로 기록돼 있다.
//   - 창이 없다(옛 HTML이 캐시에 남은 경우), 브라우저가 <dialog>의 showModal을 모르거나 showModal이 던진다.
//     showModal이 던질 때 클릭이 이미 막혀 있으면 팝업도 이동도 없는 죽은 버튼이 되므로, 클릭은 창이 열린 뒤에 막는다.
//   - 가운데 단추 등 주 단추가 아닌 클릭(button이 0이 아님). 엔진에 따라 가운데 단추도 click으로 온다.
//   - 팝업 스타일이 실리지 않았다: 새 CSS는 .coupang-confirm에 --coupang-confirm-ready: 1을 둔다. 옛 CSS에는 없어서 모양 없는 창이 뜨는 것을 막는다.
//   - 다른 스크립트가 이미 이 클릭을 막았다(defaultPrevented).
//
// 끝나는 때: 취소 단추, 창 밖(바탕 막) 누르기, Esc(브라우저 기본)로 닫는다. 닫히면(close 이벤트) 포커스를 누른 버튼으로 돌린다.
//   창 밖 누르기는 다음 두 가지가 모두 맞을 때만 닫는다.
//   - 누른 곳(pointerdown)도 바탕 막이었다. 창 안에서 눌러 바탕 막에서 놓은 끌기(글자 고르기)는 click이 창으로 오지만 닫지 않는다.
//   - 창이 열린 지 outsideGuardMs가 지났다. 더블클릭이나 빠른 두 번 두드림의 두 번째 누름은 이미 열린 창의 바탕 막에 닿는다.
//     그것으로 닫으면 쿠팡에 갈 수 없다(예전에는 더블클릭해도 쿠팡이 열렸다).
//   이동 링크를 누르면 체크돼 있을 때 오늘을 기록하고 창을 닫는다. 링크의 기본 동작(새 탭으로 쿠팡 열기)은 막지 않는다.
//   체크만 하고 취소하거나 닫으면 아무것도 기록하지 않는다.
//
// 저장 형식: localStorage blime:coupang-confirm:skip = 한국 날짜 "YYYY-MM-DD". 저장된 날짜가 오늘(한국)과 같을 때만 건너뛴다. 한국 날짜가 바뀌면 끝난다.
//   날짜를 UTC로 자르면 한국의 아침(09시 전)에는 전날이 되므로, 한국 시각(UTC+9)으로 옮겨 자른다.
//
// 안전장치: 저장소를 읽을 수 없으면(사파리 사생활 보호 모드 등) 건너뛰지 않고 매번 창을 띄운다. 쓰지 못해도 이동은 막지 않는다.
//   저장된 값이 오늘과 다르면(지난 날짜, 깨진 값) 건너뛰지 않는다.
(() => {
    const dialog = document.getElementById("coupang-confirm");
    // 창이 없는 HTML에서는 아무것도 하지 않는다.
    if (!dialog) return;

    const skipKey = "blime:coupang-confirm:skip";
    const buttonSelector = "a.btn-store--coupang:not([data-seller-delivery])";
    const body = dialog.querySelector(".coupang-confirm-body");
    const skip = dialog.querySelector("[data-coupang-confirm-skip]");
    const cancel = dialog.querySelector("[data-coupang-confirm-cancel]");
    const go = dialog.querySelector("[data-coupang-confirm-go]");
    if (!body || !skip || !cancel || !go) return;

    // 창이 열린 직후 이 시간(ms) 동안의 바깥 누르기는 닫지 않는다. 더블클릭 간격(최대 약 500ms)을 덮는다.
    const outsideGuardMs = 500;

    // 창을 연 버튼. 닫히면 포커스를 돌려줄 곳이다.
    let opener = null;
    // 창을 연 때(performance.now())
    let openedAt = 0;
    // 마지막 누름(pointerdown)이 바탕 막(창 자체)이었는가
    let pressedOnBackdrop = false;

    // 한국 날짜 YYYY-MM-DD
    function today() {
        return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    }

    // 오늘 하루 보지 않기로 기록돼 있는가. 저장소를 읽을 수 없으면 아니다(매번 띄운다).
    function skippedToday() {
        try {
            return localStorage.getItem(skipKey) === today();
        } catch (error) {
            return false;
        }
    }

    // 오늘을 기록한다. 기록하지 못해도 이동은 그대로 일어난다(다음에 또 뜰 뿐이다).
    function rememberToday() {
        try {
            localStorage.setItem(skipKey, today());
        } catch (error) {
            // 저장소를 쓸 수 없는 브라우저: 무시한다.
        }
    }

    // 팝업 스타일이 실렸는가
    function stylesLoaded() {
        return getComputedStyle(dialog).getPropertyValue("--coupang-confirm-ready").trim() === "1";
    }

    document.addEventListener("click", (event) => {
        // 주 단추(0)만 다룬다. 가운데 단추 클릭은 브라우저가 새 탭으로 여는 대로 둔다.
        if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
        const button = event.target.closest(buttonSelector);
        if (!button) return;
        const href = button.getAttribute("href");
        if (!href || typeof dialog.showModal !== "function" || dialog.open) return;
        if (skippedToday() || !stylesLoaded()) return;

        skip.checked = false;
        go.setAttribute("href", href);
        try {
            dialog.showModal();
        } catch (error) {
            // 창을 열지 못했다: 클릭을 막지 않았으니 링크가 지금처럼 쿠팡으로 간다.
            return;
        }
        // 창이 열린 뒤에 막는다. 같은 클릭 처리 중이라 링크의 기본 동작은 그대로 취소된다.
        event.preventDefault();
        opener = button;
        openedAt = performance.now();
        pressedOnBackdrop = false;
        // tabindex="-1"인 안쪽 상자는 포커스를 받을 수 있는 첫 요소라 브라우저가 이미 여기에 포커스를 주는 경우가 많다(체크 상자가 아니다).
        // 첫 조작 요소(체크 상자)에 주는 엔진을 위해 확실히 옮긴다. 체크 상자에 가면 포커스 테두리가 생긴다.
        body.focus({ preventScroll: true });
    });

    cancel.addEventListener("click", () => dialog.close());

    // 이동은 막지 않는다(새 탭 열기는 링크의 기본 동작이다). 체크돼 있으면 오늘을 기록하고 창만 닫는다.
    go.addEventListener("click", () => {
        if (skip.checked) rememberToday();
        dialog.close();
    });

    // 창 밖 누르기: 안쪽 여백까지 .coupang-confirm-body가 채우므로, 창 자체가 눌린 것은 바탕 막을 누른 것이다.
    // click의 대상만 보면 안 된다. 창 안에서 눌러 바탕 막에서 놓으면 브라우저는 click을 공통 조상인 창에 보낸다. 그래서 누른 곳(pointerdown)도 함께 본다.
    dialog.addEventListener("pointerdown", (event) => {
        pressedOnBackdrop = event.target === dialog;
    });

    dialog.addEventListener("click", (event) => {
        const outside = event.target === dialog && pressedOnBackdrop;
        pressedOnBackdrop = false;
        // 열린 직후는 더블클릭의 두 번째 누름일 수 있어 닫지 않는다
        if (outside && performance.now() - openedAt >= outsideGuardMs) dialog.close();
    });

    // 무엇으로 닫혔든(취소, 바깥, Esc, 이동) 포커스를 누른 버튼으로 돌린다.
    dialog.addEventListener("close", () => {
        opener?.focus();
        opener = null;
    });
})();
