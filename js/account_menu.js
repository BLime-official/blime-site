(() => {
    const menus = Array.from(document.querySelectorAll("[data-account-menu]"));
    const settingsMenus = Array.from(document.querySelectorAll("[data-settings-menu]"));
    const mobileAccountTriggers = Array.from(document.querySelectorAll("[data-mobile-account-trigger]"));
    if (menus.length === 0 && settingsMenus.length === 0 && mobileAccountTriggers.length === 0) return;
    let mobileAccountRequestToken = 0;

    function themeActionLabel() {
        return window.BLIME_THEME?.getTheme?.() === "dark" ? "라이트모드" : "다크모드";
    }

    function menuItem(label, action, extraClass = "") {
        return `<button class="account-menu-item ${extraClass}" data-account-action="${action}" role="menuitem" type="button">${label}</button>`;
    }

    function menuStatus(label) {
        return `<div class="account-menu-status" role="none">${label}</div>`;
    }

    function renderMenu(menu, isLoggedIn, errorMessage = "") {
        const panel = menu.querySelector("[data-account-menu-panel]");
        if (!panel) return;

        const items = isLoggedIn
            ? [
                menuStatus("로그인됨"),
                menuItem("관심상품", "favorites"),
                menuItem("가격 기회", "deals"),
                menuItem(themeActionLabel(), "theme"),
                menuItem("로그아웃", "logout", "account-menu-item-danger"),
            ]
            : [
                menuItem("로그인", "login"),
                menuItem("관심상품", "favorites"),
                menuItem("가격 기회", "deals"),
                menuItem(themeActionLabel(), "theme"),
            ];

        panel.innerHTML = `
            ${items.join("")}
            <p class="account-menu-error" data-account-menu-error ${errorMessage ? "" : "hidden"}>${errorMessage}</p>
        `;
    }

    function renderMobileAccountPanel(errorMessage = "") {
        let panel = document.querySelector(".mobile-account-panel");
        if (!panel) {
            panel = document.createElement("div");
            panel.className = "mobile-account-panel";
            panel.hidden = true;
            document.body.appendChild(panel);
        }

        panel.innerHTML = `
            <div class="account-menu-status">로그인됨</div>
            <button class="account-menu-item account-menu-item-danger" data-mobile-account-action="logout" type="button">로그아웃</button>
            <p class="account-menu-error" data-mobile-account-error ${errorMessage ? "" : "hidden"}>${errorMessage}</p>
        `;
        return panel;
    }

    function setAccountOpen(menu, isOpen) {
        const button = menu.querySelector("[data-account-menu-button]");
        const panel = menu.querySelector("[data-account-menu-panel]");
        if (!button || !panel) return;

        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        panel.hidden = !isOpen;
        menu.classList.toggle("is-open", isOpen);
    }

    function setSettingsOpen(menu, isOpen) {
        const button = menu.querySelector("[data-settings-menu-button]");
        const panel = menu.querySelector("[data-settings-menu-panel]");
        if (!button || !panel) return;

        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        panel.hidden = !isOpen;
        menu.classList.toggle("is-open", isOpen);
    }

    function closeMobileAccountPanel() {
        mobileAccountRequestToken += 1;
        const panel = document.querySelector(".mobile-account-panel");
        if (panel) panel.hidden = true;
    }

    function closeAll(exceptAccountMenu = null, exceptSettingsMenu = null) {
        menus.forEach((menu) => {
            if (menu !== exceptAccountMenu) setAccountOpen(menu, false);
        });
        settingsMenus.forEach((menu) => {
            if (menu !== exceptSettingsMenu) setSettingsOpen(menu, false);
        });
        closeMobileAccountPanel();
    }

    async function readIsLoggedIn() {
        const client = window.BLIME_AUTH?.getClient?.();
        if (!client?.auth?.getSession) return false;

        try {
            const { data } = await client.auth.getSession();
            return !!data?.session?.user;
        } catch (error) {
            return false;
        }
    }

    async function refreshMenus() {
        const isLoggedIn = await readIsLoggedIn();
        menus.forEach((menu) => renderMenu(menu, isLoggedIn));
    }

    function refreshSettingsMenus() {
        settingsMenus.forEach((menu) => {
            const themeAction = menu.querySelector('[data-settings-action="theme"]');
            if (themeAction) themeAction.textContent = themeActionLabel();
        });
    }

    async function handleLogout(menu) {
        try {
            const client = window.BLIME_AUTH?.getClient?.();
            if (!client?.auth?.signOut) throw new Error("Missing signOut");

            const { error } = await client.auth.signOut();
            if (error) throw error;

            await window.BLIME_AUTH?.refreshSessionState?.();
            await refreshMenus();
            setAccountOpen(menu, false);
            window.BLIME_AUTH?.showFlash?.("로그아웃되었습니다.");
        } catch (error) {
            renderMenu(menu, true, "로그아웃에 실패했습니다.");
            setAccountOpen(menu, true);
        }
    }

    async function handleMobileLogout() {
        const panel = renderMobileAccountPanel();
        try {
            const client = window.BLIME_AUTH?.getClient?.();
            if (!client?.auth?.signOut) throw new Error("Missing signOut");

            const { error } = await client.auth.signOut();
            if (error) throw error;

            await window.BLIME_AUTH?.refreshSessionState?.();
            await refreshMenus();
            closeMobileAccountPanel();
            window.BLIME_AUTH?.showFlash?.("로그아웃되었습니다.");
        } catch (error) {
            renderMobileAccountPanel("로그아웃에 실패했습니다.");
            panel.hidden = false;
        }
    }

    async function handleAction(menu, action) {
        if (action === "login") {
            setAccountOpen(menu, false);
            window.BLIME_AUTH?.showLogin?.();
            return;
        }

        if (action === "favorites") {
            window.location.href = menu.dataset.favoritesHref || "/favorites/";
            return;
        }

        if (action === "deals") {
            window.location.href = menu.dataset.dealsHref || "/deals/";
            return;
        }

        if (action === "theme") {
            window.BLIME_THEME?.toggleTheme?.();
            await refreshMenus();
            refreshSettingsMenus();
            setAccountOpen(menu, false);
            return;
        }

        if (action === "logout") {
            await handleLogout(menu);
        }
    }

    menus.forEach((menu) => {
        const button = menu.querySelector("[data-account-menu-button]");
        button?.addEventListener("click", () => {
            const willOpen = button.getAttribute("aria-expanded") !== "true";
            closeAll(menu);
            setAccountOpen(menu, willOpen);
            if (willOpen) refreshMenus();
        });

        menu.addEventListener("click", (event) => {
            const actionButton = event.target.closest?.("[data-account-action]");
            if (!actionButton) return;
            event.stopPropagation();
            handleAction(menu, actionButton.dataset.accountAction);
        });
    });

    settingsMenus.forEach((menu) => {
        const button = menu.querySelector("[data-settings-menu-button]");
        button?.addEventListener("click", () => {
            const willOpen = button.getAttribute("aria-expanded") !== "true";
            closeAll(null, menu);
            setSettingsOpen(menu, willOpen);
            if (willOpen) refreshSettingsMenus();
        });

        menu.addEventListener("click", (event) => {
            const actionButton = event.target.closest?.("[data-settings-action]");
            if (!actionButton) return;
            event.stopPropagation();

            if (actionButton.dataset.settingsAction === "theme") {
                window.BLIME_THEME?.toggleTheme?.();
                refreshMenus();
                refreshSettingsMenus();
                setSettingsOpen(menu, false);
            }
        });
    });

    mobileAccountTriggers.forEach((trigger) => {
        trigger.addEventListener("click", async (event) => {
            event.stopPropagation();
            closeAll();
            const requestToken = mobileAccountRequestToken + 1;
            mobileAccountRequestToken = requestToken;

            if (!(await readIsLoggedIn())) {
                if (requestToken !== mobileAccountRequestToken) return;
                window.BLIME_AUTH?.showLogin?.();
                return;
            }

            if (requestToken !== mobileAccountRequestToken) return;
            const panel = renderMobileAccountPanel();
            panel.hidden = false;
        });
    });

    document.addEventListener("click", (event) => {
        const actionButton = event.target.closest?.("[data-mobile-account-action]");
        if (actionButton?.dataset.mobileAccountAction === "logout") {
            event.stopPropagation();
            handleMobileLogout();
        }
    });

    document.addEventListener("click", (event) => {
        if (event.target.closest?.("[data-account-menu]")) return;
        if (event.target.closest?.("[data-settings-menu]")) return;
        if (event.target.closest?.(".mobile-account-panel")) return;
        if (event.target.closest?.("[data-mobile-account-trigger]")) return;
        closeAll();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAll();
    });

    window.addEventListener("blime:auth-state-changed", refreshMenus);
    window.addEventListener("blime:theme-changed", () => {
        refreshMenus();
        refreshSettingsMenus();
    });
    refreshMenus();
    refreshSettingsMenus();
})();
