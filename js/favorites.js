(() => {
    const favoriteProductIds = new Set();
    let favoriteButtonObserver = null;
    let favoriteRefreshToken = 0;

    // 페이지는 body에 사이트 루트까지의 상대 경로(data-site-root)를 적어 둔다.
    function sitePath(path) {
        return `${document.body?.dataset.siteRoot ?? ""}${path}`;
    }

    function productsIndexPath() {
        return sitePath("products_index.json");
    }

    // 사이트 자료 받기의 10초 한도(load_limit.js). 그 파일이 없는 옛 HTML(동기화가 JS를 템플릿보다 먼저 보낼 때, 배포 직후 캐시)에서는
    // 지금처럼 한도 없이 받는다.
    const loadLimit = () => window.BLIME_LOAD || {
        fetchJson: async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`${url} ${response.status}`);
            return response.json();
        },
        deadline: () => () => {},
    };

    function productIdValue(productId) {
        const numericId = Number(productId);
        return Number.isFinite(numericId) ? numericId : productId;
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

    function showFavoriteFlash(isFavorite) {
        const message = isFavorite
            ? "관심상품에 추가되었습니다."
            : "관심상품에서 삭제되었습니다.";
        window.BLIME_AUTH?.showFlash?.(message);
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
            showFavoriteFlash(!wasFavorite);
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

    function renderMissingFavorites(productIds) {
        const missingSection = document.getElementById("favorites-missing");
        const missingList = document.getElementById("favorites-missing-list");
        if (!missingSection || !missingList) return;

        missingList.replaceChildren(...productIds.map((productId) => {
            const item = document.createElement("li");
            item.textContent = productId;
            return item;
        }));
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
            // 10초 안에 다 받지 못하면 받기가 끊기고(AbortError) 아래 catch가 오류를 보인다. refreshFavoritesForUser의 마감이 먼저 와서 이 차례가
            // 낡았으면 이미 오류를 보였으므로 catch는 조용히 돌아간다.
            const products = await loadLimit().fetchJson(productsIndexPath());
            if (refreshToken !== null && !isLatestRefresh(refreshToken)) return;
            if (!Array.isArray(products)) throw new Error("products_index must be an array");

            const productsById = new Map(products.map((product) => [String(product.id), product]));
            const favoriteProducts = Array.from(favoriteProductIds)
                .map((productId) => productsById.get(productId))
                .filter(Boolean);
            const missingIds = Array.from(favoriteProductIds).filter((productId) => !productsById.has(productId));

            hideLoginPanel();
            if (content) content.hidden = false;
            // 카드는 다른 목록과 같은 모양이다(cards.js). 별 버튼은 아래 syncFavoriteButtons가 눌린 상태로 맞춘다.
            grid.replaceChildren(...favoriteProducts.map((product) => window.BLIME_CARDS.productCard(product)));
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

    // 관심상품 화면은 관심상품 읽기와 상품 인덱스 받기를 합쳐 10초까지만 기다린다(load_limit.js). 넘기면 지금의 실패 처리대로 오류를 보인다.
    // 관심상품 읽기(SDK의 받기)는 끊지 않고, 마감에 차례를 올려 늦게 온 답을 버린다. 별 버튼만 맞추는 다른 페이지는 기다리는
    // 화면이 없어 마감을 걸지 않는다. 마감은 이 차례가 끝나면(그리거나 오류를 보이거나 낡으면) 거둔다.
    async function refreshFavoritesForUser(user) {
        const refreshToken = ++favoriteRefreshToken;

        if (!user) {
            favoriteProductIds.clear();
            syncFavoriteButtons();
            return null;
        }

        const onFavoritesPage = document.body?.dataset.page === "favorites";
        const cancelDeadline = onFavoritesPage
            ? loadLimit().deadline(() => {
                // 그사이 다른 차례(로그아웃, 새 로그인 확인)가 시작했으면 그 차례의 화면을 건드리지 않는다.
                if (!isLatestRefresh(refreshToken)) return;
                favoriteRefreshToken += 1;
                console.warn("[favorites] 관심상품을 10초 안에 불러오지 못해 오류를 보입니다");
                showFavoritesLoadError();
            })
            : () => {};

        try {
            const loaded = await loadFavoriteIds(user, refreshToken);
            if (!isLatestRefresh(refreshToken)) return null;
            if (!loaded) {
                if (onFavoritesPage) showFavoritesLoadError();
                return user;
            }

            if (onFavoritesPage) {
                await renderFavoritesPage(user, refreshToken);
            }
            return user;
        } finally {
            cancelDeadline();
        }
    }

    function watchDynamicButtons() {
        if (favoriteButtonObserver) return;

        const containers = document.querySelectorAll("#products-grid, #favorites-grid, .product-detail");
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
