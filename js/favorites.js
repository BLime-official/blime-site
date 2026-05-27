(() => {
    const config = window.BLIME_SUPABASE_CONFIG || {};
    const hasSupabase = config.url && config.anonKey && window.supabase?.createClient;
    const supabaseClient = hasSupabase
        ? window.supabase.createClient(config.url, config.anonKey)
        : null;
    const googleClientId = config.googleClientId || "";
    const favoriteProductIds = new Set();
    let favoriteButtonObserver = null;
    let googleIdentityPromise = null;
    let googleIdentityInitialized = false;

    function productsIndexPath() {
        const path = window.location.pathname;
        if (/\/(deals|products|favorites)\//.test(path)) {
            return "../products_index.json";
        }
        return "products_index.json";
    }

    function productIdValue(productId) {
        const numericId = Number(productId);
        return Number.isFinite(numericId) ? numericId : productId;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatPrice(price) {
        if (price === null || price === undefined || price === "") return "N/A";
        const number = Number(price);
        if (!Number.isFinite(number)) return escapeHtml(price);
        return number.toLocaleString("ko-KR");
    }

    const googleIcon = `
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M17.64 9.204c0-.638-.057-1.252-.164-1.841H9v3.482h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"></path>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.71H.958v2.332A8.997 8.997 0 0 0 9 18z"></path>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.958A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.958 4.042l3.006-2.332z"></path>
            <path fill="#EA4335" d="M9 3.58c1.322 0 2.508.454 3.44 1.346l2.582-2.582C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .958 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"></path>
        </svg>
    `;
    const appleIcon = `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"></path>
        </svg>
    `;

    function authProviderButton(provider, label, icon) {
        const disabled = provider === "apple" ? ' disabled aria-disabled="true"' : "";
        return `
            <button class="favorite-auth-provider favorite-auth-provider-${provider}" data-auth-provider="${provider}" type="button"${disabled}>
                <span class="favorite-auth-icon favorite-auth-icon-${provider}" aria-hidden="true">${icon}</span>
                <span>${label}</span>
            </button>
        `;
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
            const user = await currentUser();
            if (!user) return;

            hideLoginPanel();
            const loaded = await loadFavoriteIds(user);
            if (!loaded && document.body?.dataset.page === "favorites") {
                showFavoritesLoadError();
                return;
            }
            if (document.body?.dataset.page === "favorites") {
                await renderFavoritesPage(user);
            }
        } catch (error) {
            return;
        }
    }

    async function renderGoogleSignInButtons() {
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
            <p>관심상품에 등록하려면 로그인해 주세요.</p>
            <div class="favorite-auth-actions">
                ${authProviderButton("google", "Google로 계속", googleIcon)}
                ${authProviderButton("apple", "Apple로 계속", appleIcon)}
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
                    <p>관심상품에 등록하려면 로그인해 주세요.</p>
                    <div class="favorite-auth-actions">
                        ${authProviderButton("google", "Google로 계속", googleIcon)}
                        ${authProviderButton("apple", "Apple로 계속", appleIcon)}
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

    function showAuthPrompt() {
        if (document.body?.dataset.page === "favorites") {
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

    async function signIn(provider) {
        if (!supabaseClient) return;
        if (provider === "google" && googleClientId) {
            await renderGoogleSignInButtons();
            if (document.querySelector("[data-google-rendered]")) return;
        }
        try {
            await supabaseClient.auth.signInWithOAuth({
                provider: provider,
                options: {
                    redirectTo: window.location.href.split("#")[0],
                },
            });
        } catch (error) {
            return;
        }
    }

    function setButtonState(button, isFavorite) {
        button.classList.toggle("is-favorite", isFavorite);
        button.setAttribute("aria-pressed", isFavorite ? "true" : "false");
        button.setAttribute("aria-label", isFavorite ? "관심상품 제거" : "관심상품 추가");
        const label = button.querySelector("[data-favorite-label]");
        const nextLabel = isFavorite ? "관심상품 제거" : "관심상품 추가";
        if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
    }

    function syncFavoriteButtons() {
        document.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
            const productId = button.dataset.productId;
            if (!productId) return;
            setButtonState(button, favoriteProductIds.has(String(productId)));
        });
    }

    function showFavoriteError(button, message) {
        let error = button.parentElement?.querySelector("[data-favorite-error]");
        if (!error) {
            error = document.createElement("span");
            error.dataset.favoriteError = "true";
            error.setAttribute("role", "status");
            button.insertAdjacentElement("afterend", error);
        }
        error.textContent = message;
    }

    async function loadFavoriteIds(user) {
        if (!supabaseClient || !user) return false;
        try {
            const { data, error } = await supabaseClient
                .from("user_product_favorites")
                .select("product_id")
                .eq("user_id", user.id);
            if (error || !Array.isArray(data)) return false;

            favoriteProductIds.clear();
            data.forEach((row) => {
                favoriteProductIds.add(String(row.product_id));
            });
            syncFavoriteButtons();
            return true;
        } catch (error) {
            return false;
        }
    }

    async function addFavorite(user, productId) {
        const { error } = await supabaseClient
            .from("user_product_favorites")
            .upsert({ user_id: user.id, product_id: productIdValue(productId) }, { onConflict: "user_id,product_id" });
        if (error) throw error;
        if (!error) favoriteProductIds.add(String(productId));
    }

    async function removeFavorite(user, productId) {
        const { error } = await supabaseClient
            .from("user_product_favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("product_id", productIdValue(productId));
        if (error) throw error;
        if (!error) favoriteProductIds.delete(String(productId));
    }

    async function toggleFavorite(button) {
        const productId = button.dataset.productId;
        if (!productId) return;
        if (!supabaseClient) {
            showAuthPrompt();
            return;
        }

        const user = await currentUser();
        if (!user) {
            showAuthPrompt();
            return;
        }

        const wasFavorite = favoriteProductIds.has(String(productId));
        try {
            button.disabled = true;
            if (wasFavorite) {
                await removeFavorite(user, productId);
            } else {
                await addFavorite(user, productId);
            }
            syncFavoriteButtons();
            if (document.body?.dataset.page === "favorites") {
                await renderFavoritesPage(user);
            }
        } catch (error) {
            if (wasFavorite) {
                favoriteProductIds.add(String(productId));
            } else {
                favoriteProductIds.delete(String(productId));
            }
            setButtonState(button, wasFavorite);
            showFavoriteError(button, "관심상품 변경에 실패했습니다.");
        } finally {
            button.disabled = false;
        }
    }

    function productCard(product) {
        const productId = String(product.id);
        const detailPath = product.detail_path || `products/product_${escapeHtml(productId)}.html`;
        const image = product.image_url
            ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">`
            : `<div class="no-image"></div>`;
        const saleBadge = product.is_on_sale && product.discount_percentage
            ? `<div class="sale-badge">${escapeHtml(product.discount_percentage)}% ↓</div>`
            : "";

        return `
            <div class="product-card" data-product-id="${escapeHtml(productId)}">
                ${saleBadge}
                <a class="product-image-link" href="../${escapeHtml(detailPath)}" aria-label="${escapeHtml(product.name)} 상세 보기">
                    <div class="product-image">${image}</div>
                </a>
                <div class="product-content">
                    <div class="product-brand">${escapeHtml(product.brand || "-")}</div>
                    <h3 class="product-name">
                        <a href="../${escapeHtml(detailPath)}">${escapeHtml(product.full_text || product.name)}</a>
                    </h3>
                    ${product.form_and_quantity ? `<div class="product-variant">${escapeHtml(product.form_and_quantity)}</div>` : ""}
                    <div class="price-group">
                        <span class="current-price">₩${formatPrice(product.current_price)}</span>
                    </div>
                    <div class="product-footer">
                        <span class="stock-status ${product.availability === "재고있음" ? "in-stock" : "out-of-stock"}">
                            ${escapeHtml(product.availability || "")}
                        </span>
                        <button class="favorite-toggle-btn is-favorite" data-favorite-toggle data-product-id="${escapeHtml(productId)}" aria-label="관심상품 제거" aria-pressed="true" type="button">
                            제거
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderMissingFavorites(productIds) {
        const missingSection = document.getElementById("favorites-missing");
        const missingList = document.getElementById("favorites-missing-list");
        if (!missingSection || !missingList) return;

        missingList.innerHTML = productIds.map((productId) => `<li>${escapeHtml(productId)}</li>`).join("");
        missingSection.hidden = productIds.length === 0;
    }

    function showFavoritesLoadError() {
        const content = document.getElementById("favorites-content");
        const grid = document.getElementById("favorites-grid");
        const empty = document.getElementById("favorites-empty");

        hideLoginPanel();
        if (content) content.hidden = false;
        if (grid) grid.innerHTML = "";
        if (empty) {
            empty.textContent = "관심상품을 불러오지 못했습니다.";
            empty.hidden = false;
        }
        renderMissingFavorites([]);
    }

    async function renderFavoritesPage(user) {
        const grid = document.getElementById("favorites-grid");
        if (!grid) return;

        const content = document.getElementById("favorites-content");
        const empty = document.getElementById("favorites-empty");
        try {
            const response = await fetch(productsIndexPath());
            if (!response.ok) throw new Error("products_index fetch failed");
            const products = await response.json();
            if (!Array.isArray(products)) throw new Error("products_index must be an array");

            const productsById = new Map(products.map((product) => [String(product.id), product]));
            const favoriteProducts = Array.from(favoriteProductIds)
                .map((productId) => productsById.get(productId))
                .filter(Boolean);
            const missingIds = Array.from(favoriteProductIds).filter((productId) => !productsById.has(productId));

            hideLoginPanel();
            if (content) content.hidden = false;
            grid.innerHTML = favoriteProducts.map(productCard).join("");
            if (empty) {
                empty.textContent = "아직 추가한 관심상품이 없습니다.";
                empty.hidden = favoriteProducts.length !== 0 || missingIds.length !== 0;
            }
            renderMissingFavorites(missingIds);
            syncFavoriteButtons();
        } catch (error) {
            showFavoritesLoadError();
        }
    }

    function watchDynamicButtons() {
        if (favoriteButtonObserver) return;

        const containers = document.querySelectorAll("#products-grid, .hot-deals-grid, #favorites-grid, .product-detail");
        if (containers.length === 0) return;

        favoriteButtonObserver = new MutationObserver(() => {
            syncFavoriteButtons();
        });
        containers.forEach((container) => {
            favoriteButtonObserver.observe(container, { childList: true, subtree: true });
        });
    }

    document.addEventListener("click", (event) => {
        if (!event.target.closest) return;

        const closeButton = event.target.closest("[data-favorite-close]");
        if (closeButton) {
            hideAuthModal();
            return;
        }

        const authButton = event.target.closest("[data-auth-provider]");
        if (authButton) {
            if (authButton.disabled) return;
            signIn(authButton.dataset.authProvider);
            return;
        }

        const favoriteButton = event.target.closest("[data-favorite-toggle]");
        if (favoriteButton) {
            toggleFavorite(favoriteButton);
        }
    });

    document.addEventListener("DOMContentLoaded", async () => {
        watchDynamicButtons();
        renderGoogleSignInButtons();

        if (!supabaseClient) {
            if (document.body?.dataset.page === "favorites") showLoginPanel();
            return;
        }

        const user = await currentUser();
        if (!user) {
            if (document.body?.dataset.page === "favorites") showLoginPanel();
            return;
        }

        hideLoginPanel();
        const loaded = await loadFavoriteIds(user);
        if (!loaded && document.body?.dataset.page === "favorites") {
            showFavoritesLoadError();
            return;
        }
        if (document.body?.dataset.page === "favorites") {
            await renderFavoritesPage(user);
        }
    });
})();
