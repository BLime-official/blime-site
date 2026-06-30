(() => {
    if (document.body?.dataset.page !== "account") return;

    const providerLabels = {
        google: "Google",
        kakao: "카카오",
        naver: "네이버",
        "custom:naver": "네이버",
        email: "이메일",
    };
    let accountRefreshToken = 0;
    let latestFavoritesCount = null;

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

    async function handleLogout() {
        setLogoutError("");
        try {
            const client = window.BLIME_AUTH?.getClient?.();
            if (!client?.auth?.signOut) throw new Error("Missing signOut");

            const { error } = await client.auth.signOut();
            if (error) throw error;

            await window.BLIME_AUTH?.refreshSessionState?.();
            window.BLIME_AUTH?.showFlash?.("로그아웃되었습니다.");
        } catch (error) {
            setLogoutError("로그아웃에 실패했습니다.");
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
        await loadFavoritesCount(user, refreshToken);
    }

    document.addEventListener("click", (event) => {
        if (!event.target.closest) return;

        if (event.target.closest("[data-account-logout]")) {
            handleLogout();
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

    document.addEventListener("DOMContentLoaded", () => {
        refresh();
    });
})();
