(() => {
    if (document.body?.dataset.page !== "account") return;

    const providerLabels = {
        google: "Google",
        kakao: "카카오",
        naver: "네이버",
        "custom:naver": "네이버",
        email: "이메일",
    };
    const priceViewHash = "#price-view";
    const priceViewHighlightMs = 2000;
    const priceViewSaveFailedMessage = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    let accountRefreshToken = 0;
    let latestFavoritesCount = null;
    let priceViewPointedAt = false;

    function content() {
        return document.getElementById("account-content");
    }

    function homeHref() {
        const link = document.querySelector('[data-mobile-nav-item="home"]')
            || document.querySelector(".logo a");
        const href = link?.getAttribute("href") || "../";
        return href.split("#")[0] || "../";
    }

    function setText(selector, value) {
        const element = document.querySelector(selector);
        if (element) element.textContent = value;
    }

    function providerLabel(user) {
        const provider = user?.app_metadata?.provider || "";
        return providerLabels[provider] || (provider ? provider : "소셜 로그인");
    }

    function createdLabel(user) {
        if (!user?.created_at) return "-";
        const created = new Date(user.created_at);
        if (Number.isNaN(created.getTime())) return "-";
        return created.toLocaleDateString("ko-KR");
    }

    function renderAccountInfo(user) {
        setText("[data-account-email]", user.email || "미제공");
        setText("[data-account-provider]", providerLabel(user));
        setText("[data-account-created]", createdLabel(user));
    }

    async function loadFavoritesCount(user, refreshToken) {
        const client = window.BLIME_AUTH?.getClient?.();
        if (!client?.from) return;

        try {
            const { count, error } = await client
                .from("user_product_favorites")
                .select("product_id", { count: "exact", head: true })
                .eq("user_id", user.id);
            if (refreshToken !== accountRefreshToken) return;
            if (error || !Number.isInteger(count)) {
                latestFavoritesCount = null;
                setText("[data-account-favorites-count]", "");
                return;
            }
            latestFavoritesCount = count;
            setText("[data-account-favorites-count]", `${count}개`);
        } catch (error) {
            if (refreshToken !== accountRefreshToken) return;
            latestFavoritesCount = null;
            setText("[data-account-favorites-count]", "");
        }
    }

    function setLogoutError(message) {
        const error = document.querySelector("[data-account-logout-error]");
        if (!error) return;
        error.textContent = message || "";
        error.hidden = !message;
    }

    // 로그아웃 결과는 auth.js가 이 기기에 세션이 남았는지로 정한다. 세션이 남은 경우에만 실패로 알린다.
    async function handleLogout() {
        setLogoutError("");
        if (await window.BLIME_AUTH?.signOut?.()) {
            window.BLIME_AUTH?.showFlash?.("로그아웃되었습니다.");
        } else {
            setLogoutError("로그아웃에 실패했습니다.");
        }
    }

    // 가격 보기 카드(운영값이 있을 때만 서버가 그린다)의 스위치를 화면의 표시(BLIME_PRICE_VIEW.isOn())에 맞춘다.
    // 카드가 없거나 price_view.js가 없으면 아무것도 하지 않는다.
    function syncPriceViewSwitch() {
        const view = window.BLIME_PRICE_VIEW;
        const switchButton = document.querySelector("[data-price-view-switch]");
        if (!view || !switchButton) return;
        switchButton.setAttribute("aria-checked", String(view.isOn()));
    }

    // 스위치를 누르면 저장하는 동안 잠근다. price_view.js는 set()이 하나씩 돈다고 보기 때문에(저장이 겹쳐 실패하면 화면과 DB가 어긋난다),
    // 잠긴 단추가 두 번째 누름을 막아 준다. 표시는 set()이 바로 바꾸고 BLIME_PRICE_VIEW가 알려서(blime:iherb-code-changed) 스위치가 따라간다.
    async function togglePriceView(switchButton) {
        if (switchButton.disabled) return;

        const view = window.BLIME_PRICE_VIEW;
        const hadFocus = document.activeElement === switchButton;
        switchButton.disabled = true;
        try {
            // price_view.js를 받지 못했으면(view가 없다) 저장하지 못한 것과 같다.
            if (!(await view?.set(!view.isOn()))) {
                window.BLIME_AUTH?.showFlash?.(priceViewSaveFailedMessage);
            }
        } finally {
            // 표시를 바꾼 알림(blime:iherb-code-changed)이 이미 스위치를 맞췄다. 풀기 전에 한 번 더 맞춰 스위치가 늘 화면과 같은 채로 풀리게 한다.
            syncPriceViewSwitch();
            switchButton.disabled = false;
            // 잠긴 사이 초점이 빠졌다. 키보드로 누른 사람이 이어서 쓸 수 있게 돌려준다(그사이 다른 곳으로 옮긴 초점은 건드리지 않는다).
            if (hadFocus && document.activeElement === document.body) switchButton.focus();
        }
    }

    // 카드로 스크롤해 가운데에 두고 2초 동안 초록 테두리로 짚는다.
    function pointAt(card) {
        card.scrollIntoView({ block: "center" });
        card.classList.add("is-highlight");
        setTimeout(() => card.classList.remove("is-highlight"), priceViewHighlightMs);
    }

    // 말풍선이나 링크로 account/#price-view에 온 사람에게 카드를 보여 준다. 로그인한 화면이 보인 뒤에, 페이지를 연 뒤 처음 한 번만 한다.
    // 카드는 로그인을 확인할 때까지 숨어 있어 브라우저가 주소의 #price-view로 스크롤하지 못한다. 확인이 load보다 먼저 끝나면 크롬이 문서를
    // 다 받을 때까지(load) 레이아웃이 바뀔 때마다 카드를 주소 쪽으로 다시 스크롤해 카드 위쪽을 헤더 바로 아래에 붙인다. 그 전에 가운데로
    // 맞춰 둬도 덮이므로, 문서가 아직 로딩 중이면 load 뒤로 미룬다(짚기도 그때 시작한다). 이미 다 받았으면 바로 한다.
    function pointAtPriceView() {
        if (priceViewPointedAt || window.location.hash !== priceViewHash) return;
        const card = document.getElementById("price-view");
        if (!card) return;

        priceViewPointedAt = true;
        if (document.readyState === "complete") {
            pointAt(card);
        } else {
            window.addEventListener("load", () => pointAt(card), { once: true });
        }
    }

    async function refresh(userFromEvent) {
        const refreshToken = ++accountRefreshToken;
        const section = content();
        if (!section) return;

        let user = userFromEvent;
        if (user === undefined) {
            user = await window.BLIME_AUTH?.getCurrentUser?.();
            if (refreshToken !== accountRefreshToken) return;
        }

        if (!user) {
            latestFavoritesCount = null;
            section.hidden = true;
            return;
        }

        renderAccountInfo(user);
        section.hidden = false;
        syncPriceViewSwitch();
        pointAtPriceView();
        await loadFavoritesCount(user, refreshToken);
    }

    document.addEventListener("click", (event) => {
        if (!event.target.closest) return;

        if (event.target.closest("[data-account-logout]")) {
            handleLogout();
            return;
        }

        const priceViewSwitch = event.target.closest("[data-price-view-switch]");
        if (priceViewSwitch) {
            togglePriceView(priceViewSwitch);
            return;
        }

        if (event.target.closest("[data-account-delete]")) {
            window.BLIME_AUTH?.confirmDeleteAccount?.({
                favoritesCount: latestFavoritesCount,
                homeHref: homeHref(),
            });
        }
    });

    window.addEventListener("blime:auth-state-changed", (event) => {
        refresh(event.detail?.user || null);
    });

    // 설정이 바뀌면(이 스위치, DB 값을 읽은 뒤, 다른 탭, 뒤로 가기) 스위치가 따라간다.
    window.addEventListener("blime:iherb-code-changed", syncPriceViewSwitch);

    document.addEventListener("DOMContentLoaded", () => {
        refresh();
    });
})();
