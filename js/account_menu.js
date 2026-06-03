(() => {
    const menus = Array.from(document.querySelectorAll("[data-account-menu]"));
    if (menus.length === 0) return;

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
                menuItem("할인상품", "deals"),
                menuItem(themeActionLabel(), "theme"),
                menuItem("로그아웃", "logout", "account-menu-item-danger"),
            ]
            : [
                menuItem("로그인", "login"),
                menuItem("관심상품", "favorites"),
                menuItem("할인상품", "deals"),
                menuItem(themeActionLabel(), "theme"),
            ];

        panel.innerHTML = `
            ${items.join("")}
            <p class="account-menu-error" data-account-menu-error ${errorMessage ? "" : "hidden"}>${errorMessage}</p>
        `;
    }

    function setOpen(menu, isOpen) {
        const button = menu.querySelector("[data-account-menu-button]");
        const panel = menu.querySelector("[data-account-menu-panel]");
        if (!button || !panel) return;

        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        panel.hidden = !isOpen;
        menu.classList.toggle("is-open", isOpen);
    }

    function closeAll(exceptMenu = null) {
        menus.forEach((menu) => {
            if (menu !== exceptMenu) setOpen(menu, false);
        });
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

    async function handleLogout(menu) {
        try {
            const client = window.BLIME_AUTH?.getClient?.();
            if (!client?.auth?.signOut) throw new Error("Missing signOut");

            const { error } = await client.auth.signOut();
            if (error) throw error;

            await window.BLIME_AUTH?.refreshSessionState?.();
            await refreshMenus();
            setOpen(menu, false);
            window.BLIME_AUTH?.showFlash?.("로그아웃되었습니다.");
        } catch (error) {
            renderMenu(menu, true, "로그아웃에 실패했습니다.");
            setOpen(menu, true);
        }
    }

    async function handleAction(menu, action) {
        if (action === "login") {
            setOpen(menu, false);
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
            setOpen(menu, false);
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
            setOpen(menu, willOpen);
            if (willOpen) refreshMenus();
        });

        menu.addEventListener("click", (event) => {
            const actionButton = event.target.closest?.("[data-account-action]");
            if (!actionButton) return;
            event.stopPropagation();
            handleAction(menu, actionButton.dataset.accountAction);
        });
    });

    document.addEventListener("click", (event) => {
        if (event.target.closest?.("[data-account-menu]")) return;
        closeAll();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAll();
    });

    window.addEventListener("blime:auth-state-changed", refreshMenus);
    window.addEventListener("blime:theme-changed", refreshMenus);
    refreshMenus();
})();
