(() => {
    const config = window.BLIME_SUPABASE_CONFIG || {};
    const hasSupabase = config.url && config.anonKey && window.supabase?.createClient;
    const supabaseClient = hasSupabase
        ? window.supabase.createClient(config.url, config.anonKey)
        : null;
    const favoriteProductIds = new Set();
    let favoriteButtonObserver = null;

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
                <button class="favorite-auth-provider" data-auth-provider="google" type="button">Google로 계속</button>
                <button class="favorite-auth-provider" data-auth-provider="apple" type="button">Apple로 계속</button>
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
                        <button class="favorite-auth-provider" data-auth-provider="google" type="button">Google로 계속</button>
                        <button class="favorite-auth-provider" data-auth-provider="apple" type="button">Apple로 계속</button>
                    </div>
                </div>
            </section>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function showAuthModal() {
        const modal = ensureAuthModal();
        modal.hidden = false;
        modal.classList.add("active");
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
