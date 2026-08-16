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

    function pendingStarButton(productId) {
        // 카드 바닥 줄(product_card.html)과 같은 별 둘이다. 눌린 상태는 syncFavoriteButtons가 맞춘다.
        const svgNs = "http://www.w3.org/2000/svg";
        const button = document.createElement("button");
        button.className = "favorite-toggle-btn";
        button.type = "button";
        button.dataset.favoriteToggle = "";
        button.dataset.productId = productId;
        const points = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";
        [["favorite-icon-outline", "none", "currentColor"], ["favorite-icon-filled", "currentColor", null]].forEach(([className, fill, stroke]) => {
            const svg = document.createElementNS(svgNs, "svg");
            svg.setAttribute("class", className);
            svg.setAttribute("width", "16");
            svg.setAttribute("height", "16");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("fill", fill);
            if (stroke) {
                svg.setAttribute("stroke", stroke);
                svg.setAttribute("stroke-width", "2");
            } else {
                svg.setAttribute("aria-hidden", "true");
            }
            const polygon = document.createElementNS(svgNs, "polygon");
            polygon.setAttribute("points", points);
            svg.appendChild(polygon);
            button.appendChild(svg);
        });
        return button;
    }

    // 이름·브랜드는 textContent로만 넣는다. 줄은 링크가 아니다(상세 페이지가 아직 없다).
    function pendingRow(product) {
        const row = document.createElement("li");
        row.className = "pending-row";
        row.dataset.productId = String(product.id);

        if (typeof product.image_url === "string" && product.image_url !== "") {
            const image = document.createElement("img");
            image.src = product.image_url;
            image.alt = "";
            row.appendChild(image);
        } else {
            const placeholder = document.createElement("span");
            placeholder.className = "pending-row-noimg";
            row.appendChild(placeholder);
        }

        const text = document.createElement("div");
        text.className = "pending-row-text";
        const brand = document.createElement("span");
        brand.className = "pending-row-brand";
        brand.textContent = product.brand || "-";
        const name = document.createElement("span");
        name.className = "pending-row-name";
        name.textContent = product.name || "";
        text.append(brand, name);
        if (product.current_price !== null && product.current_price !== undefined) {
            const price = document.createElement("span");
            price.className = "pending-row-price";
            price.textContent = `₩${window.BLIME_FORMAT.price(product.current_price)}`;
            text.appendChild(price);
        }
        row.appendChild(text);
        row.appendChild(pendingStarButton(String(product.id)));
        return row;
    }

    // 인덱스에 없는 번호를 공개 뷰에서 읽는다. 읽지 못하면(오류, 구역 자리가 없는 옛 HTML) 빈 목록을 돌려 모두 번호 목록에 남긴다.
    async function readPendingProducts(missingIds) {
        if (missingIds.length === 0 || !document.getElementById("favorites-pending-list")) return [];
        const supabaseClient = getSupabaseClient();
        if (!supabaseClient) return [];
        try {
            const { data, error } = await supabaseClient
                .from("v_products_active")
                .select("id,name,brand,image_url,current_price")
                .in("id", missingIds.map(productIdValue));
            if (error || !Array.isArray(data)) return [];
            const wanted = new Set(missingIds);
            return data.filter((row) => row && wanted.has(String(row.id)) && typeof row.name === "string" && row.name !== "");
        } catch (error) {
            return [];
        }
    }

    function renderPendingSection(products) {
        const section = document.getElementById("favorites-pending");
        const list = document.getElementById("favorites-pending-list");
        const count = document.getElementById("favorites-pending-count");
        if (!section || !list) return;

        list.replaceChildren(...products.map(pendingRow));
        if (count) count.textContent = String(products.length);
        section.hidden = products.length === 0;
    }

    function showFavoritesLoadError() {
        const content = document.getElementById("favorites-content");
        const grid = document.getElementById("favorites-grid");
        const empty = document.getElementById("favorites-empty");

        hideLoginPanel();
        if (content) content.hidden = false;
        renderPendingSection([]);
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
            const absentIds = Array.from(favoriteProductIds).filter((productId) => !productsById.has(productId));

            // 추적을 막 시작해 아직 인덱스에 없는 상품은 공개 뷰에서 읽어 따로 보인다. 어디에도 없는 번호만 번호 목록에 남는다.
            const pendingProducts = await readPendingProducts(absentIds);
            if (refreshToken !== null && !isLatestRefresh(refreshToken)) return;
            const pendingIds = new Set(pendingProducts.map((product) => String(product.id)));
            const missingIds = absentIds.filter((productId) => !pendingIds.has(productId));

            hideLoginPanel();
            if (content) content.hidden = false;
            // 카드는 다른 목록과 같은 모양이다(cards.js). 별 버튼은 아래 syncFavoriteButtons가 눌린 상태로 맞춘다.
            grid.replaceChildren(...favoriteProducts.map((product) => window.BLIME_CARDS.productCard(product)));
            if (empty) {
                empty.textContent = "아직 추가한 관심상품이 없습니다.";
                empty.hidden = favoriteProducts.length !== 0 || pendingProducts.length !== 0 || missingIds.length !== 0;
            }
            renderPendingSection(pendingProducts);
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

    // --- 앱 공유로 관심상품에 넣기 -------------------------------------------------------------------------------------
    const pendingRequestsKey = "blime:pending-favorite-requests";
    const pendingRequestsMax = 5;
    const pendingRequestsMaxAgeMs = 60 * 60 * 1000;

    function shareResult(result, extra = {}) {
        return { result, productId: null, productName: null, requestId: null, statusToken: null, ...extra };
    }

    // 요청 한 건의 처리. addFromShare와 로그인 뒤 처리가 같이 쓴다. 던지지 않고 결과 코드로 답한다. 로그인 확인과 요청을 합쳐 10초 안에 끝낸다.
    async function requestFavorite(sharedText) {
        if (typeof sharedText !== "string" || sharedText.trim() === "") return shareResult("invalid_url");

        const controller = new AbortController();
        const effects = { renderUser: null };
        let timer;
        const expired = new Promise((resolve) => {
            timer = setTimeout(() => {
                controller.abort();
                resolve(shareResult("failed"));
            }, window.BLIME_LOAD?.LIMIT_MS ?? 10000);
        });
        let outcome;
        try {
            outcome = await Promise.race([sendFavoriteRequest(sharedText, controller.signal, effects), expired]);
        } catch (error) {
            outcome = shareResult("failed");
        } finally {
            clearTimeout(timer);
        }

        // 결과를 먼저 정한 뒤에 관심상품 화면을 다시 그린다. 그리는 일은 기다리지 않는다(10초 한도 밖). 서버에서 관심상품을 다시 읽어 그린다
        // (refreshFavoritesForUser): 첫 읽기가 끝나기 전에 공유 결과가 나오면 이 페이지가 아는 번호는 공유한 상품뿐이라, 그것만으로 그리면
        // 다른 관심상품이 사라져 보인다(2026-11-13 최종 검토). 새 차례를 받으므로 더 늦은 로그아웃·새로고침이 이긴다.
        if (effects.renderUser && (outcome.result === "added" || outcome.result === "already_favorite")
            && document.body?.dataset.page === "favorites") {
            refreshFavoritesForUser(effects.renderUser).catch(() => {});
        }
        return outcome;
    }

    async function sendFavoriteRequest(sharedText, signal, effects) {
        const supabaseClient = getSupabaseClient();
        const functionUrl = window.BLIME_SUPABASE_CONFIG?.requestFunctionUrl;
        const anonKey = window.BLIME_SUPABASE_CONFIG?.anonKey;
        if (!supabaseClient || !functionUrl || !anonKey) return shareResult("failed");

        const { data } = await supabaseClient.auth.getSession();
        const session = data?.session;
        if (!session?.access_token) return shareResult("login_required");
        // 10초가 지난 뒤의 늦은 답은 아무것도 바꾸지 않는다.
        if (signal.aborted) return shareResult("failed");

        const response = await fetch(functionUrl, {
            method: "POST",
            headers: {
                apikey: anonKey,
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ productUrl: sharedText, addToFavorites: true }),
            signal,
        });
        const body = await response.json().catch(() => null);
        if (signal.aborted) return shareResult("failed");

        if (response.status === 401) {
            // 이 함수가 직접 거절한 것만 이 기기의 세션을 지운다. 게이트웨이의 401은 원인을 몰라 세션을 둔다.
            if (body?.code === "login_required") await window.BLIME_AUTH?.dropLocalSession?.();
            return shareResult("login_required");
        }
        if (response.status === 400 && body?.code === "invalid_url") return shareResult("invalid_url");
        if (!response.ok || !body) return shareResult("failed");

        const productId = body.productId ?? null;
        const productName = body.preview?.name ?? null;
        if (body.favorite === "added" || body.favorite === "already") {
            if (productId !== null) {
                favoriteProductIds.add(String(productId));
                syncFavoriteButtons();
            }
            // 관심상품 화면은 서버에서 다시 읽어 그리므로 상품 번호가 없어도 된다.
            effects.renderUser = session.user;
            return shareResult(body.favorite === "added" ? "added" : "already_favorite", { productId, productName });
        }
        if (body.favorite === "pending") {
            // 새로 접수하거나 재접수한 요청만 상태 조회 값이 온다.
            const tracked = typeof body.statusToken === "string" && body.statusToken !== "";
            return shareResult("pending", {
                productId,
                productName,
                requestId: tracked ? (body.requestId ?? null) : null,
                statusToken: tracked ? body.statusToken : null,
            });
        }
        return shareResult("failed");
    }

    let pendingSweepTimer = null;

    // 기록을 읽을 때마다 1시간 지난 항목(과 모양이 틀린 항목)을 버리고, 버린 것이 있으면 다시 쓴다. 남은 것이 없으면 키를 지운다.
    // 처리방침(7절 저장 표)의 "1시간이 지나면 삭제"를 로그아웃한 채 오래 머무는 탭(앱 WebView)에서도 지키려는 것이다(2026-11-13 최종 검토).
    // 예전에는 로그인을 마친 뒤에만 걸러 내 로그아웃한 탭에서는 탭을 닫을 때까지 남았다. 한 화면에 머물러도 지우도록 가장 먼저 만료될 때 다시 읽는다.
    function readPendingRequests() {
        let stored = null;
        try {
            stored = sessionStorage.getItem(pendingRequestsKey);
        } catch (error) {
            return [];
        }
        if (stored === null) return [];

        let entries = null;
        try {
            entries = JSON.parse(stored);
        } catch (error) {
            entries = null;
        }
        const now = Date.now();
        const kept = Array.isArray(entries)
            ? entries.filter((entry) => entry && typeof entry.url === "string" && entry.url !== ""
                && Number.isFinite(entry.savedAt) && now - entry.savedAt < pendingRequestsMaxAgeMs)
            : [];
        if (!Array.isArray(entries) || kept.length !== entries.length) {
            writePendingRequests(kept);
        } else {
            scheduleSweep(kept);
        }
        return kept;
    }

    // 저장 시각이 앞날로 적힌 항목(시계를 되돌린 기기)이 있어도 기다림은 1시간을 넘기지 않는다.
    function scheduleSweep(entries) {
        clearTimeout(pendingSweepTimer);
        pendingSweepTimer = null;
        if (entries.length === 0) return;
        const oldest = Math.min(...entries.map((entry) => entry.savedAt));
        const waitMs = Math.min(pendingRequestsMaxAgeMs, Math.max(0, oldest + pendingRequestsMaxAgeMs - Date.now()));
        pendingSweepTimer = setTimeout(readPendingRequests, waitMs);
    }

    // 쓰고 나면 남긴 목록에서 가장 먼저 만료될 때 다시 읽도록 맞춘다.
    function writePendingRequests(entries) {
        try {
            if (entries.length === 0) {
                sessionStorage.removeItem(pendingRequestsKey);
            } else {
                sessionStorage.setItem(pendingRequestsKey, JSON.stringify(entries));
            }
        } catch (error) {
            // 저장소를 쓸 수 없으면 기억하지 않는다.
        }
        scheduleSweep(entries);
    }

    function takePendingRequests() {
        const entries = readPendingRequests();
        writePendingRequests([]);
        return entries;
    }

    // 같은 URL은 하나만 두고(새로 더하면 최근 것이 된다) 최대 5개까지 둔다. 넘치면 가장 오래된 것부터 뺀다.
    function mergePendingRequests(existing, added) {
        const merged = new Map();
        [...existing, ...added]
            .sort((a, b) => a.savedAt - b.savedAt)
            .forEach((entry) => {
                merged.delete(entry.url);
                merged.set(entry.url, entry);
            });
        return Array.from(merged.values()).slice(-pendingRequestsMax);
    }

    // 합치는 목록은 1시간 지난 항목을 버린 것이다(readPendingRequests).
    function rememberForLogin(url) {
        if (typeof url !== "string" || url.trim() === "") return;
        writePendingRequests(mergePendingRequests(readPendingRequests(), [{ url, savedAt: Date.now() }]));
    }

    // 로그인을 마친 뒤: 로그아웃 때 요청해 둔 URL을 관심상품에 넣는다. 키는 읽자마자 지워 같은 알림이 두 번 와도 한 번만 처리한다.
    // 1시간 지난 항목은 읽을 때 이미 버렸다.
    async function processPendingRequests() {
        const entries = takePendingRequests();
        if (entries.length === 0) return;

        const results = [];
        let refused = null;
        for (let index = 0; index < entries.length; index += 1) {
            const result = await requestFavorite(entries[index].url);
            if (result.result === "login_required") {
                // 세션이 지워졌다. 나머지와 함께 저장 시각 그대로 되돌려 두고, 다음에 정말 로그인할 때 처리한다.
                refused = entries.slice(index);
                break;
            }
            results.push(result.result);
        }
        if (refused) writePendingRequests(mergePendingRequests(readPendingRequests(), refused));

        let message = "";
        if (results.some((result) => result === "added" || result === "already_favorite")) {
            message = "로그인되었습니다. 요청한 상품을 관심상품에 추가했어요.";
        } else if (results.includes("pending")) {
            message = "로그인되었습니다. 추적이 시작되면 요청한 상품을 관심상품에 넣어 드릴게요.";
        } else if (results.length > 0) {
            message = "관심상품에 추가하지 못했어요. 다시 요청해 주세요.";
        }
        if (message) window.BLIME_AUTH?.showFlash?.(message, { durationMs: 4000 });
    }

    // 앱(WebView)이 callAsyncJavaScript로 부른다. DOMContentLoaded를 기다리지 않고 지금 정한다.
    window.BLIME_FAVORITES = { addFromShare: requestFavorite, rememberForLogin };

    // 로그인하지 않아도 페이지를 열 때 한 번 정리한다(1시간 지난 항목 버리기와 다음 정리 맞추기).
    readPendingRequests();

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
        if (event.detail?.user) processPendingRequests();
    });

    // 로그인 확인(auth.js)이 10초 안에 끝나지 않았다. 관심상품 화면은 로그인 안내도 목록도 열지 못한 채 비어 있으므로 지금의 실패 처리로 오류를 보인다.
    // 그 확인의 늦은 답은 auth.js가 버려 알림이 오지 않는다. 차례도 올려 이 화면이 시작한 읽기가 있어도 늦게 그리지 못하게 한다. 다른 페이지는 기다리는 화면이 없다.
    window.addEventListener("blime:auth-check-timeout", () => {
        if (document.body?.dataset.page !== "favorites") return;
        favoriteRefreshToken += 1;
        console.warn("[favorites] 로그인 확인이 10초 안에 끝나지 않아 오류를 보입니다");
        showFavoritesLoadError();
    });

    document.addEventListener("DOMContentLoaded", async () => {
        watchDynamicButtons();
        syncFavoriteButtons();
        // 로그인 스크립트(auth.js)를 받지 못했으면 로그인 확인이 시작되지 않는다. 안내도 목록도 열리지 않은 채 머물지 않게 바로 오류를 보인다.
        if (document.body?.dataset.page === "favorites" && !window.BLIME_AUTH) showFavoritesLoadError();
    });
})();
