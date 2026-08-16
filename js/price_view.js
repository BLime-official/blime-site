// 가격 보기 설정(iHerb 할인 적용가 보기)을 화면에 반영한다. 운영값이 있는 사이트의 모든 공개 페이지가 auth.js 다음에 싣는다(base.html).
//
// 설정은 DB 표 user_preferences(user_id, iherb_code_view)에 있고, 브라우저에는 사본(localStorage blime:iherb-code-view)을 둔다.
// 사본은 켜짐이면 "on"이고 꺼짐이면 키가 없다. 화면은 <html data-iherb-code="on"> 표시 하나로 바뀐다(base.css의 두 규칙).
// 첫 화면의 표시는 사본을 읽는 머리 조각(partials/iherb_code_head.html)이 스타일시트보다 먼저 붙이고, 이 파일은 그 뒤를 맞춘다.
//
//   BLIME_PRICE_VIEW.percent   운영값 N(<html data-iherb-code-percent>)
//   BLIME_PRICE_VIEW.isOn()    지금 <html> 표시가 켜짐인가
//   BLIME_PRICE_VIEW.set(on)   사본과 표시를 바로 바꾸고 DB에 쓴다. 저장하면 true를 돌려주는 Promise.
//                              로그인한 사용자가 없으면 바꾸지 않고 false다. 저장하지 못하면 사본과 표시를 되돌리고 false다
//                              (알림은 부르는 쪽이 띄운다). 켜면 새 기능 말풍선 기록(blime:coach:iherb-code)을 끝남으로 바꾼다
//   blime:iherb-code-changed   표시가 실제로 바뀔 때만 window에 보낸다. detail: { on }
//
// 로그인 확인(blime:auth-state-changed)이 올 때마다 사용자가 있으면 DB 값을 읽어 사본·표시를 맞추고, 없으면 사본을 지우고 표시를 끈다.
// 읽기가 실패하면 사본과 화면을 그대로 두고 콘솔에 경고만 남긴다. 다른 탭(storage)과 뒤로 가기 캐시 복원(pageshow)은 사본을 다시 읽고,
// 그때 읽는 중이던 DB 값은 버린다(더 새로운 사본을 늦은 옛 값이 되돌리지 않는다).
// 사본과 말풍선 기록을 못 읽고 쓰는 브라우저(사생활 보호 모드, 차단, 용량 초과)에서는 읽기가 꺼짐이고 쓰기는 무시한다.
// 그래도 이 페이지의 표시와 DB 저장은 그대로 간다.
(() => {
    const root = document.documentElement;
    const percent = Number(root.getAttribute("data-iherb-code-percent"));
    // 운영값이 없는 HTML(기능이 꺼진 사이트)에서는 아무것도 하지 않는다. 전역도 남기지 않는다.
    if (!(percent > 0)) return;

    const markName = "data-iherb-code";
    const mirrorKey = "blime:iherb-code-view";
    const coachKey = "blime:coach:iherb-code";
    const changedEvent = "blime:iherb-code-changed";

    // set()이 불리거나 로그인 확인이 올 때마다, 그리고 다른 탭이나 캐시 복원이 사본을 다시 읽게 할 때마다 올린다. DB 읽기는 시작할 때의 값을
    // 들고 있다가 끝났을 때 다르면 읽은 값을 버린다. 읽는 사이에 누른 선택이나 로그아웃, 다른 탭의 선택을, 늦게 도착한 옛 값이 덮어쓰지 않게 하려는 것이다.
    let version = 0;

    function readMirror() {
        try {
            return localStorage.getItem(mirrorKey) === "on";
        } catch (error) {
            return false;
        }
    }

    function writeMirror(on) {
        try {
            if (on) {
                localStorage.setItem(mirrorKey, "on");
            } else {
                localStorage.removeItem(mirrorKey);
            }
        } catch (error) {
            return;
        }
    }

    function isOn() {
        return root.getAttribute(markName) === "on";
    }

    // 표시를 맞춘다. 실제로 바뀔 때만 알린다(단독 그래프와 비교 화면이 듣고 다시 그린다).
    function showView(on) {
        if (isOn() === on) return;
        if (on) {
            root.setAttribute(markName, "on");
        } else {
            root.removeAttribute(markName);
        }
        window.dispatchEvent(new CustomEvent(changedEvent, { detail: { on } }));
    }

    function readCoachRecord() {
        try {
            const record = JSON.parse(localStorage.getItem(coachKey));
            return record && typeof record === "object" ? record : null;
        } catch (error) {
            return null;
        }
    }

    // 새 기능 말풍선(iherb_code_coach.js)은 설정이 켜지면 다시 띄우지 않는다. 기록은 {"days": [띄운 날짜, ...], "done": 끝남}이다.
    // 기록이 없거나 읽을 수 없으면 새로 쓰고, 있으면 띄운 날짜는 그대로 둔다.
    function markCoachDone() {
        const record = readCoachRecord();
        if (record?.done === true) return;
        const days = Array.isArray(record?.days) ? record.days : [];
        try {
            localStorage.setItem(coachKey, JSON.stringify({ days, done: true }));
        } catch (error) {
            return;
        }
    }

    function getClient() {
        return window.BLIME_AUTH?.getClient?.() || null;
    }

    // 로그인한 사용자의 설정을 읽는다. 행이 없으면 꺼짐이다. 읽지 못하면 { error }를 돌려준다.
    async function readFromDatabase(client, user) {
        try {
            const { data, error } = await client
                .from("user_preferences")
                .select("iherb_code_view")
                .eq("user_id", user.id)
                .maybeSingle();
            return error ? { error } : { on: data?.iherb_code_view === true };
        } catch (error) {
            return { error };
        }
    }

    // 로그인한 사용자의 설정 행을 쓴다(없으면 만들고 있으면 바꾼다). 쓰지 못하면 오류를 돌려준다.
    async function saveToDatabase(client, user, on) {
        try {
            const { error } = await client
                .from("user_preferences")
                .upsert({ user_id: user.id, iherb_code_view: on }, { onConflict: "user_id" });
            return error || null;
        } catch (error) {
            return error;
        }
    }

    // DB 값으로 사본과 표시를 맞춘다. 값을 쓰는 순서는 사본이 먼저, 표시가 다음이다(표시를 듣는 쪽이 사본을 읽어도 맞게).
    async function syncFromDatabase(user, startedAt) {
        const client = getClient();
        if (!client) return;

        const { on, error } = await readFromDatabase(client, user);
        if (startedAt !== version) return;
        if (error) {
            // 표가 없거나 네트워크가 끊겼다. 사본과 화면은 그대로 둔다.
            console.warn("[price_view] 가격 보기 설정을 읽지 못했습니다:", error.message || error);
            return;
        }

        writeMirror(on);
        showView(on);
        if (on) markCoachDone();
    }

    async function set(on) {
        const wanted = Boolean(on);
        version += 1;
        const startedAt = version;

        const client = getClient();
        if (!client) return false;
        const user = await window.BLIME_AUTH?.getCurrentUser?.();
        if (!user) return false;

        // 누른 값을 먼저 화면에 보이고 저장한다. 저장하지 못하면 되돌린다.
        const previous = isOn();
        writeMirror(wanted);
        showView(wanted);

        const error = await saveToDatabase(client, user, wanted);
        if (error) {
            console.warn("[price_view] 가격 보기 설정을 저장하지 못했습니다:", error.message || error);
            // 저장하는 사이에 더 새로운 선택이나 로그아웃이 있었으면 그쪽이 화면을 정한다.
            if (startedAt === version) {
                writeMirror(previous);
                showView(previous);
            }
            return false;
        }
        if (wanted) markCoachDone();
        return true;
    }

    window.BLIME_PRICE_VIEW = { percent, isOn, set };

    window.addEventListener("blime:auth-state-changed", (event) => {
        version += 1;
        const user = event.detail?.user || null;
        if (!user) {
            // 로그인하지 않았거나 로그아웃했다. 이 기기에 앞 회원이 남긴 사본을 이어받지 않는다.
            writeMirror(false);
            showView(false);
            return;
        }
        syncFromDatabase(user, version);
    });

    // 다른 탭이 사본을 바꾸면 이 페이지의 표시를 맞춘다. 사본이 아닌 키(테마, 말풍선 기록)의 변화는 보지 않는다.
    // 읽는 중인 DB 값은 이보다 옛 것이니 버린다(version을 올린다). 그대로 두면 늦게 와서 다른 탭의 선택을 되돌리고 그 탭이 쓴 사본을 지운다.
    window.addEventListener("storage", (event) => {
        if (event.key !== mirrorKey) return;
        version += 1;
        showView(readMirror());
    });

    // 뒤로 가기 캐시에서 복원된 페이지는 스크립트가 다시 돌지 않는다. 떠나 있는 동안 바뀐 사본을 다시 읽는다. 읽는 중인 DB 값을 버리는 까닭은 위와 같다.
    window.addEventListener("pageshow", (event) => {
        if (!event.persisted) return;
        version += 1;
        showView(readMirror());
    });
})();
