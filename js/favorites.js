(() => {
    const favoriteProductIds = new Set();
    let favoriteButtonObserver = null;
    let favoriteRefreshToken = 0;

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

    function getSupabaseClient() {
        return window.BLIME_AUTH?.getClient?.() || null;
    }

    async function getCurrentUser() {
        try {
            return await window.BLIME_AUTH?.getCurrentUser?.() || null;
        } catch (error) {
            return null;
        }
    }

    function showLoginPrompt() {
        window.BLIME_AUTH?.showLogin?.();
    }

    function hideLoginPanel() {
        const panel = document.getElementById("favorites-login-panel");
        if (panel) panel.hidden = true;
    }

    function isLatestRefresh(token) {
        return token === favoriteRefreshToken;
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
        const actionButtons = button.closest(".action-buttons");
        const errorScope = actionButtons?.parentElement || button.parentElement;
        let error = errorScope?.querySelector("[data-favorite-error]");
        if (!error) {
            error = document.createElement("span");
            error.dataset.favoriteError = "true";
            error.setAttribute("role", "status");
            if (actionButtons) {
                actionButtons.insertAdjacentElement("afterend", error);
            } else {
                button.insertAdjacentElement("afterend", error);
            }
        }
        error.textContent = message;
    }

    async function loadFavoriteIds(user, refreshToken = null) {
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient || !user) return false;

        try {
            const { data, error } = await supabaseClient
                .from("user_product_favorites")
                .select("product_id")
                .eq("user_id", user.id);
            if (error || !Array.isArray(data)) return false;
            if (refreshToken !== null && !isLatestRefresh(refreshToken)) return false;

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
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) throw new Error("Missing Supabase client");

        const { error } = await supabaseClient
            .from("user_product_favorites")
            .insert({ user_id: user.id, product_id: productIdValue(productId) });
        if (error && error.code !== "23505") throw error;
        favoriteProductIds.add(String(productId));
    }

    async function removeFavorite(user, productId) {
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) throw new Error("Missing Supabase client");

        const { error } = await supabaseClient
            .from("user_product_favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("product_id", productIdValue(productId));
        if (error) throw error;
        favoriteProductIds.delete(String(productId));
    }

    async function toggleFavorite(button) {
        const productId = button.dataset.productId;
        if (!productId) return;
        if (!getSupabaseClient()) {
            showLoginPrompt();
            return;
        }

        const user = await getCurrentUser();
        if (!user) {
            showLoginPrompt();
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
                    <div class="product-variant">${escapeHtml(product.form_and_quantity || "")}</div>
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

    async function renderFavoritesPage(user, refreshToken = null) {
        const grid = document.getElementById("favorites-grid");
        if (!grid) return;

        const content = document.getElementById("favorites-content");
        const empty = document.getElementById("favorites-empty");
        try {
            const response = await fetch(productsIndexPath());
            if (refreshToken !== null && !isLatestRefresh(refreshToken)) return;
            if (!response.ok) throw new Error("products_index fetch failed");
            const products = await response.json();
            if (refreshToken !== null && !isLatestRefresh(refreshToken)) return;
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
            if (refreshToken !== null && !isLatestRefresh(refreshToken)) return;
            showFavoritesLoadError();
        }
    }

    async function refreshFavoritesForUser(user) {
        const refreshToken = ++favoriteRefreshToken;

        if (!user) {
            favoriteProductIds.clear();
            syncFavoriteButtons();
            return null;
        }

        const loaded = await loadFavoriteIds(user, refreshToken);
        if (!isLatestRefresh(refreshToken)) return null;
        if (!loaded) {
            if (document.body?.dataset.page === "favorites") showFavoritesLoadError();
            return user;
        }

        if (document.body?.dataset.page === "favorites") {
            await renderFavoritesPage(user, refreshToken);
        }
        return user;
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

        const favoriteButton = event.target.closest("[data-favorite-toggle]");
        if (favoriteButton) {
            toggleFavorite(favoriteButton);
        }
    });

    window.addEventListener("blime:auth-state-changed", (event) => {
        refreshFavoritesForUser(event.detail?.user || null);
    });

    document.addEventListener("DOMContentLoaded", async () => {
        watchDynamicButtons();
        syncFavoriteButtons();
    });
})();
