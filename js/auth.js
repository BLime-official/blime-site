(() => {
    const config = window.BLIME_SUPABASE_CONFIG || {};
    const hasSupabase = config.url && config.anonKey && window.supabase?.createClient;
    const supabaseClient = hasSupabase
        ? window.supabase.createClient(config.url, config.anonKey)
        : null;
    const googleClientId = config.googleClientId || "";
    let googleIdentityPromise = null;
    let googleIdentityInitialized = false;
    let sessionRefreshToken = 0;
    const authFlashDurationMs = 2500;
    const pendingLoginFlashKey = "blime:pending-auth-login";
    let authFlashTimer = null;
    const oauthProviderMap = {
        naver: "custom:naver",
    };

    const googleIcon = `
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M17.64 9.204c0-.638-.057-1.252-.164-1.841H9v3.482h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"></path>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.958v2.332A8.997 8.997 0 0 0 9 18z"></path>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.958A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.958 4.042l3.006-2.332z"></path>
            <path fill="#EA4335" d="M9 3.58c1.322 0 2.508.454 3.44 1.346l2.582-2.582C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .958 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"></path>
        </svg>
    `;
    const kakaoIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 4C6.48 4 2 7.57 2 11.98c0 2.86 1.9 5.37 4.76 6.78l-.83 3.04c-.07.26.22.47.44.31l3.65-2.43c.64.09 1.3.14 1.98.14 5.52 0 10-3.57 10-7.98S17.52 4 12 4z"></path>
        </svg>
    `;
    const naverIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M5 4h5.1l4.8 6.9V4H19v16h-5.1L9.1 13.1V20H5V4z"></path>
        </svg>
    `;
    const loginUsageNotice = "비라임은 로그인 상태 확인, 이용자 구분, 관심상품 목록 관리 목적으로만 로그인 기능을 이용합니다. 닉네임, 이름, 프로필 이미지 등은 활용하지 않으며, 제공에 동의하지 않으셔도 이용 가능합니다.";

    function authProviderButton(provider, label, icon) {
        return `
            <button class="favorite-auth-provider favorite-auth-provider-${provider}" data-auth-provider="${provider}" type="button">
                <span class="favorite-auth-icon favorite-auth-icon-${provider}" aria-hidden="true">${icon}</span>
                <span>${label}</span>
            </button>
        `;
    }

    function ensureFlash() {
        let flash = document.getElementById("auth-flash");
        if (flash) return flash;

        flash = document.createElement("div");
        flash.id = "auth-flash";
        flash.className = "auth-flash";
        flash.setAttribute("role", "status");
        flash.setAttribute("aria-live", "polite");
        flash.setAttribute("aria-atomic", "true");
        document.body.appendChild(flash);
        return flash;
    }

    function showFlash(message) {
        if (!message || !document.body) return;

        const flash = ensureFlash();
        flash.textContent = message;
        flash.classList.remove("show");

        window.requestAnimationFrame(() => {
            flash.classList.add("show");
        });

        clearTimeout(authFlashTimer);
        authFlashTimer = setTimeout(() => {
            flash.classList.remove("show");
        }, authFlashDurationMs);
    }

    const pendingFlashKey = "blime:pending-flash";

    function markPendingFlash(message) {
        try {
            sessionStorage.setItem(pendingFlashKey, message);
        } catch (error) {
            return;
        }
    }

    function consumePendingFlash() {
        let message = "";
        try {
            message = sessionStorage.getItem(pendingFlashKey) || "";
            sessionStorage.removeItem(pendingFlashKey);
        } catch (error) {
            return;
        }
        if (message) showFlash(message);
    }

    function markPendingLoginFlash() {
        try {
            sessionStorage.setItem(pendingLoginFlashKey, "1");
        } catch (error) {
            return;
        }
    }

    function consumePendingLoginFlash(user) {
        let shouldShow = false;

        try {
            shouldShow = sessionStorage.getItem(pendingLoginFlashKey) === "1";
            sessionStorage.removeItem(pendingLoginFlashKey);
        } catch (error) {
            return;
        }

        if (user && shouldShow) {
            showFlash("로그인되었습니다.");
        }
    }

    function setupGoogleSignInSlots(root = document) {
        if (!googleClientId || !supabaseClient) return;
        root.querySelectorAll(".favorite-auth-actions").forEach((actions) => {
            if (actions.querySelector("[data-google-signin]")) return;
            const fallback = actions.querySelector('[data-auth-provider="google"]');
            if (!fallback) return;

            const slot = document.createElement("div");
            slot.className = "favorite-google-signin";
            slot.dataset.googleSignin = "true";
            fallback.insertAdjacentElement("beforebegin", slot);
        });
    }

    function loadGoogleIdentityServices() {
        if (window.google?.accounts?.id) return Promise.resolve(window.google);
        if (googleIdentityPromise) return googleIdentityPromise;

        googleIdentityPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
            if (existingScript) {
                existingScript.addEventListener("load", () => resolve(window.google), { once: true });
                existingScript.addEventListener("error", reject, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.src = "https://accounts.google.com/gsi/client";
            script.async = true;
            script.defer = true;
            script.onload = () => {
                if (window.google?.accounts?.id) {
                    resolve(window.google);
                } else {
                    reject(new Error("Google Identity Services failed to load"));
                }
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return googleIdentityPromise;
    }

    function googleButtonWidth(slot) {
        const containerWidth = slot.parentElement?.getBoundingClientRect().width || 320;
        return Math.max(200, Math.min(400, Math.round(containerWidth)));
    }

    async function handleGoogleCredential(response) {
        if (!supabaseClient || !response?.credential) return;

        try {
            const { error } = await supabaseClient.auth.signInWithIdToken({
                provider: "google",
                token: response.credential,
            });
            if (error) return;

            hideAuthModal();
            const user = await refreshSessionState();
            if (user) showFlash("로그인되었습니다.");
        } catch (error) {
            return;
        }
    }

    async function renderGoogleSignInButtons() {
        if (document.documentElement.classList.contains("app-mode")) return;
        if (!googleClientId || !supabaseClient) return;
        setupGoogleSignInSlots();

        const slots = Array.from(document.querySelectorAll("[data-google-signin]:not([data-google-rendered])"));
        if (slots.length === 0) return;

        try {
            const googleIdentity = await loadGoogleIdentityServices();
            if (!googleIdentityInitialized) {
                googleIdentity.accounts.id.initialize({
                    client_id: googleClientId,
                    callback: handleGoogleCredential,
                    ux_mode: "popup",
                    auto_select: false,
                    itp_support: true,
                    use_fedcm_for_prompt: true,
                });
                googleIdentityInitialized = true;
            }

            slots.forEach((slot) => {
                googleIdentity.accounts.id.renderButton(slot, {
                    type: "standard",
                    theme: "outline",
                    size: "large",
                    text: "continue_with",
                    shape: "rectangular",
                    logo_alignment: "left",
                    locale: "ko",
                    width: googleButtonWidth(slot),
                });
                slot.dataset.googleRendered = "true";

                const fallback = slot.parentElement?.querySelector('[data-auth-provider="google"]');
                if (fallback) fallback.hidden = true;
            });
        } catch (error) {
            return;
        }
    }

    function ensureLoginPanel() {
        let panel = document.getElementById("favorites-login-panel");
        if (panel) return panel;

        panel = document.createElement("section");
        panel.id = "favorites-login-panel";
        panel.className = "favorites-login-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <h2>로그인이 필요합니다</h2>
            <p class="favorite-auth-notice">${loginUsageNotice}</p>
            <div class="favorite-auth-actions">
                ${authProviderButton("google", "Google로 계속", googleIcon)}
                ${authProviderButton("kakao", "카카오 로그인", kakaoIcon)}
                ${authProviderButton("naver", "네이버 로그인", naverIcon)}
            </div>
        `;
        document.body.appendChild(panel);
        return panel;
    }

    function hideFavoritesContent() {
        const content = document.getElementById("favorites-content");
        if (content) content.hidden = true;
    }

    function showLoginPanel() {
        const panel = ensureLoginPanel();
        hideFavoritesContent();
        panel.hidden = false;
        renderGoogleSignInButtons();
    }

    function hideLoginPanel() {
        const panel = document.getElementById("favorites-login-panel");
        if (panel) panel.hidden = true;
    }

    function ensureAuthModal() {
        let modal = document.getElementById("favorite-auth-modal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "favorite-auth-modal";
        modal.className = "modal favorite-auth-modal";
        modal.hidden = true;
        modal.innerHTML = `
            <div class="favorite-auth-backdrop" data-favorite-close style="position: absolute; inset: 0;"></div>
            <section class="modal-content favorite-auth-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="favorite-auth-title" style="position: relative; z-index: 1;">
                <div class="modal-header">
                    <h3 id="favorite-auth-title">로그인이 필요합니다</h3>
                    <button class="modal-close favorite-auth-close" data-favorite-close type="button" aria-label="닫기">×</button>
                </div>
                <div class="modal-body">
                    <p class="favorite-auth-notice">${loginUsageNotice}</p>
                    <div class="favorite-auth-actions">
                        ${authProviderButton("google", "Google로 계속", googleIcon)}
                        ${authProviderButton("kakao", "카카오 로그인", kakaoIcon)}
                        ${authProviderButton("naver", "네이버 로그인", naverIcon)}
                    </div>
                </div>
            </section>
        `;
        document.body.appendChild(modal);
        setupGoogleSignInSlots(modal);
        return modal;
    }

    function showAuthModal() {
        const modal = ensureAuthModal();
        modal.hidden = false;
        modal.classList.add("active");
        renderGoogleSignInButtons();
    }

    function hideAuthModal() {
        const modal = document.getElementById("favorite-auth-modal");
        if (!modal) return;
        modal.classList.remove("active");
        modal.hidden = true;
    }

    function isLoginGatePage() {
        const page = document.body?.dataset.page;
        return page === "favorites" || page === "account";
    }

    function showAuthPrompt() {
        if (isLoginGatePage()) {
            showLoginPanel();
            return;
        }
        showAuthModal();
    }

    async function currentUser() {
        if (!supabaseClient) return null;
        try {
            const { data } = await supabaseClient.auth.getSession();
            return data?.session?.user || null;
        } catch (error) {
            return null;
        }
    }

    function notifyAuthState(user) {
        window.dispatchEvent(new CustomEvent("blime:auth-state-changed", {
            detail: { isLoggedIn: !!user, user: user || null },
        }));
    }

    function isLatestRefresh(token) {
        return token === sessionRefreshToken;
    }

    async function refreshSessionState() {
        const refreshToken = ++sessionRefreshToken;

        if (!supabaseClient) {
            if (isLoginGatePage()) showLoginPanel();
            notifyAuthState(null);
            return null;
        }

        const user = await currentUser();
        if (!isLatestRefresh(refreshToken)) return null;

        if (!user) {
            consumePendingLoginFlash(null);
            if (isLoginGatePage()) showLoginPanel();
            notifyAuthState(null);
            return null;
        }

        hideLoginPanel();
        consumePendingLoginFlash(user);
        notifyAuthState(user);
        return user;
    }

    function deleteAccountFunctionUrl() {
        if (!config.url) return "";
        return `${String(config.url).replace(/\/+$/, "")}/functions/v1/delete-account`;
    }

    function deleteModalFavoritesLine(favoritesCount) {
        if (Number.isInteger(favoritesCount) && favoritesCount >= 0) {
            return `관심상품 ${favoritesCount}개가 삭제됩니다`;
        }
        return "관심상품 목록이 삭제됩니다";
    }

    let deleteAccountOptions = {};

    function ensureDeleteAccountModal() {
        let modal = document.getElementById("account-delete-modal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "account-delete-modal";
        modal.className = "modal account-delete-modal";
        modal.hidden = true;
        modal.innerHTML = `
            <div class="favorite-auth-backdrop" data-account-delete-close style="position: absolute; inset: 0;"></div>
            <section class="modal-content account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="account-delete-modal-title" style="position: relative; z-index: 1;">
                <div class="modal-header">
                    <h3 id="account-delete-modal-title">정말 탈퇴하시겠습니까?</h3>
                    <button class="modal-close" data-account-delete-close type="button" aria-label="닫기">×</button>
                </div>
                <div class="modal-body">
                    <ul class="account-delete-warning-list">
                        <li>로그인 정보가 삭제됩니다</li>
                        <li data-account-delete-favorites>관심상품 목록이 삭제됩니다</li>
                        <li>복구할 수 없습니다</li>
                    </ul>
                    <p class="account-delete-rejoin-note">같은 소셜 계정으로 다시 가입할 수 있습니다.</p>
                    <p class="account-delete-progress" data-account-delete-progress role="status" hidden>소셜 연동을 해제하는 중입니다…</p>
                    <p class="account-menu-error" data-account-delete-error hidden></p>
                    <div class="account-delete-actions">
                        <button class="account-delete-cancel" data-account-delete-close type="button">취소</button>
                        <button class="account-delete-confirm" data-account-delete-confirm type="button">
                            <span class="account-delete-spinner" aria-hidden="true"></span>
                            <span data-account-delete-confirm-label>탈퇴하기</span>
                        </button>
                    </div>
                </div>
            </section>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    // 탈퇴 한 번에 네트워크 왕복이 여러 번 일어난다(신원 조회 → 소셜 연동 해제 →
    // 계정 삭제). 그 사이 화면이 멈춘 것처럼 보이지 않도록 진행 상태를 드러낸다.
    const deleteProgressNoticeDelayMs = 2000;
    const deleteSuccessDwellMs = 600;
    let deleteProgressTimer = null;

    function setDeleteBusy(state) {
        const modal = document.getElementById("account-delete-modal");
        if (!modal) return;

        const confirmButton = modal.querySelector("[data-account-delete-confirm]");
        const label = modal.querySelector("[data-account-delete-confirm-label]");
        const progress = modal.querySelector("[data-account-delete-progress]");
        const closers = modal.querySelectorAll("button[data-account-delete-close]");
        const backdrop = modal.querySelector("[data-account-delete-close]:not(button)");

        clearTimeout(deleteProgressTimer);

        if (state) {
            confirmButton?.setAttribute("data-state", state);
        } else {
            confirmButton?.removeAttribute("data-state");
        }
        if (confirmButton) confirmButton.disabled = state !== null;
        if (label) {
            label.textContent = state === "loading"
                ? "처리 중…"
                : state === "success" ? "탈퇴 완료" : "탈퇴하기";
        }

        // 처리 중에는 서버가 이미 삭제를 진행하고 있어 되돌릴 수단이 없다.
        closers.forEach((button) => { button.disabled = state !== null; });
        if (backdrop) backdrop.dataset.locked = state !== null ? "true" : "false";

        if (progress) {
            if (state === "loading") {
                // 빨리 끝나면 굳이 띄우지 않는다. 느릴 때만 이유를 설명한다.
                deleteProgressTimer = setTimeout(() => {
                    progress.hidden = false;
                }, deleteProgressNoticeDelayMs);
            } else {
                progress.hidden = true;
            }
        }
    }

    function setDeleteModalError(message) {
        const error = document.querySelector("[data-account-delete-error]");
        if (!error) return;
        error.textContent = message || "";
        error.hidden = !message;
    }

    function showDeleteAccountModal(options = {}) {
        deleteAccountOptions = options;
        const modal = ensureDeleteAccountModal();
        const favoritesLine = modal.querySelector("[data-account-delete-favorites]");
        if (favoritesLine) {
            favoritesLine.textContent = deleteModalFavoritesLine(options.favoritesCount);
        }
        setDeleteModalError("");
        setDeleteBusy(null);
        modal.hidden = false;
        modal.classList.add("active");
    }

    function hideDeleteAccountModal() {
        const modal = document.getElementById("account-delete-modal");
        if (!modal) return;
        modal.classList.remove("active");
        modal.hidden = true;
    }

    // 연동 해제에 실패하면 계정을 남겨 두므로, 원인을 알려 재시도를 유도한다.
    const deleteFailureMessages = {
        unlink_failed: "카카오 연동 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        identity_lookup_failed: "계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };

    function deleteFailureMessage(code) {
        return deleteFailureMessages[code]
            || "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
    }

    async function performDeleteAccount() {
        if (!supabaseClient) {
            setDeleteModalError("탈퇴 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
            return;
        }

        setDeleteModalError("");
        setDeleteBusy("loading");

        let accessToken = "";
        try {
            const { data } = await supabaseClient.auth.getSession();
            accessToken = data?.session?.access_token || "";
        } catch (error) {
            accessToken = "";
        }
        if (!accessToken) {
            setDeleteBusy(null);
            setDeleteModalError("로그인이 만료되었습니다. 다시 로그인 후 시도해 주세요.");
            return;
        }

        let succeeded = false;
        let failureCode = "";
        let naverManualDisconnect = false;
        try {
            const response = await fetch(deleteAccountFunctionUrl(), {
                method: "POST",
                headers: {
                    apikey: config.anonKey,
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            const payload = await response.json().catch(() => null);
            succeeded = Boolean(response.ok && payload?.success);
            if (!succeeded) failureCode = payload?.code || "";
            naverManualDisconnect = Boolean(payload?.naverManualDisconnect);
        } catch (error) {
            succeeded = false;
        }

        if (!succeeded) {
            setDeleteBusy(null);
            setDeleteModalError(deleteFailureMessage(failureCode));
            return;
        }

        try {
            await supabaseClient.auth.signOut({ scope: "local" });
        } catch (error) {
            // 서버 측 계정은 이미 삭제됨 — 로컬 세션 정리 실패는 흐름을 막지 않는다.
        }

        // 삭제는 끝났지만 세션 정리와 화면 전환이 남았다. 마지막 구간이 다시
        // 멈춘 것처럼 보이지 않도록 완료를 눈으로 확인시킨 뒤 이동한다.
        setDeleteBusy("success");
        await new Promise((resolve) => setTimeout(resolve, deleteSuccessDwellMs));

        hideDeleteAccountModal();
        await refreshSessionState();

        // 토큰이 없거나 만료된 네이버 가입자는 서버가 연동을 대신 끊지 못한다.
        // 이용자가 직접 정리할 수 있게 안내를 덧붙인다.
        const completionMessage = naverManualDisconnect
            ? "회원 탈퇴가 완료되었습니다. 네이버 앱 연결은 네이버 ID 관리 페이지에서 직접 해제해 주세요."
            : "회원 탈퇴가 완료되었습니다.";

        // 탈퇴 후 계정 화면에 그대로 남으면 로그인 패널이 뜨고, 다시 로그인하면
        // 곧바로 계정 화면으로 돌아와 "탈퇴가 안 된 것처럼" 보인다. 홈으로 보낸다.
        const homeHref = deleteAccountOptions.homeHref;
        if (homeHref) {
            markPendingFlash(completionMessage);
            window.location.assign(homeHref);
            return;
        }
        showFlash(completionMessage);
    }

    async function handleDeleteAccountConfirm(confirmButton) {
        // 잠금 해제는 performDeleteAccount가 결과에 따라 처리한다. 성공 시에는
        // 화면이 전환되므로 버튼을 되돌리면 안 된다.
        if (confirmButton.disabled) return;
        await performDeleteAccount();
    }

    function confirmDeleteAccount(options = {}) {
        showDeleteAccountModal(options);
    }

    window.BLIME_AUTH = {
        showLogin: showAuthPrompt,
        refreshSessionState,
        showFlash,
        getClient: () => supabaseClient,
        getCurrentUser: currentUser,
        confirmDeleteAccount,
    };

    async function signIn(provider) {
        // supabase-js 번들이 로드되지 않으면 클라이언트가 null이라 버튼이 아무 반응도
        // 하지 않는다. 조용히 무시하지 말고 원인을 알 수 있게 안내한다.
        if (!supabaseClient) {
            showFlash("로그인 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
            return;
        }
        if (provider === "google" && document.documentElement.classList.contains("app-mode")) return;
        if (provider === "google" && googleClientId) {
            await renderGoogleSignInButtons();
            if (document.querySelector("[data-google-rendered]")) return;
        }
        const oauthProvider = oauthProviderMap[provider] || provider;
        const options = {
            redirectTo: window.location.href.split("#")[0],
        };
        if (provider === "kakao" || provider === "naver") {
            options.queryParams = { scope: "" };
        }
        try {
            markPendingLoginFlash();
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: oauthProvider,
                options,
            });
            if (error) {
                sessionStorage.removeItem(pendingLoginFlashKey);
            }
        } catch (error) {
            try {
                sessionStorage.removeItem(pendingLoginFlashKey);
            } catch (_storageError) {
                return;
            }
            return;
        }
    }

    document.addEventListener("click", (event) => {
        if (!event.target.closest) return;

        const closeButton = event.target.closest("[data-favorite-close]");
        if (closeButton) {
            hideAuthModal();
            return;
        }

        const deleteCloseButton = event.target.closest("[data-account-delete-close]");
        if (deleteCloseButton) {
            // 처리 중에는 배경 클릭으로도 닫히지 않는다.
            if (deleteCloseButton.disabled || deleteCloseButton.dataset.locked === "true") return;
            hideDeleteAccountModal();
            return;
        }

        const deleteConfirmButton = event.target.closest("[data-account-delete-confirm]");
        if (deleteConfirmButton) {
            handleDeleteAccountConfirm(deleteConfirmButton);
            return;
        }

        const authButton = event.target.closest("[data-auth-provider]");
        if (authButton) {
            if (authButton.disabled) return;
            signIn(authButton.dataset.authProvider);
        }
    });

    document.addEventListener("DOMContentLoaded", async () => {
        consumePendingFlash();
        renderGoogleSignInButtons();
        await refreshSessionState();
    });
})();
