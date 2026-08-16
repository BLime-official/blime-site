// 상품 카드와 쿠팡 비교 카드. 모양은 페이지의 <template>이 정한다: 상품 카드는 <template id="product-card-template">, 비교 카드는
// <template id="compare-card-template">이다. 둘 다 서버 카드와 같은 Jinja 매크로(app/site_builder/templates/partials/product_card.html,
// compare_card.html)로 모든 칸을 두고 값은 비운 카드다.
// 여기서는 그 카드를 복제해 값을 채우고, 해당 없는 칸을 지운다. 칸 규칙은 매크로의 설명과 같다. 두 카드가 같이 쓰는 껍데기(이미지, 브랜드·이름·용량,
// 재고, 관심상품 버튼. 매크로의 card_image·card_titles·card_footer)는 fillCardShell이 채운다.
// 상품 카드의 값은 app/site_builder/view_models/products.py(card_data)를, 비교 카드의 값은 view_models/compare_list.py(CompareRow.as_card)를 따른다.
// 상품 카드의 쿠팡 줄(`쿠팡 ₩N`과 쿠팡이 더 쌀 때의 `N% 저렴` 칩)은 값이 있는 카드만 채워 보인다. 빈 카드의 줄은 hidden으로 시작한다:
// 배포 직후 최대 10분은 캐시의 옛 cards.js가 새 빈 카드를 만나는데, 옛 스크립트는 이 칸을 모르고 채우지 않으므로 hidden이 아니면 값 없는 줄이
// 모든 카드에 보인다. 반대로 새 cards.js가 옛 빈 카드(줄 칸이 없는 HTML)를 만나면 그 줄을 건너뛰고 오류 없이 줄 없는 카드를 그린다.
// 동기화가 JS·CSS를 템플릿보다 먼저 보내고 정적 파일은 10분 캐시되므로 두 어긋남이 모두 생긴다. 쿠팡 비교 카드(compareCard)에는 이 줄이 없다
// (가격 두 줄이 쿠팡 가격을 이미 보인다).
// 카드의 링크·버튼 밖을 눌러도 상세 페이지로 간다. 서버가 그린 카드도 같다.
(() => {
    const TEMPLATE_ID = "product-card-template";
    const COMPARE_TEMPLATE_ID = "compare-card-template";
    const STORE_NAMES = { coupang: "쿠팡", iherb: "iHerb" };
    const formatPrice = (price) => window.BLIME_FORMAT.price(price);

    // 페이지는 body에 사이트 루트까지의 상대 경로(data-site-root)를 적어 둔다.
    function detailHref(product) {
        const siteRoot = document.body?.dataset.siteRoot ?? "";
        return `${siteRoot}${product.detail_path || `products/product_${product.id}.html`}`;
    }

    function cloneTemplate(id) {
        const template = document.getElementById(id);
        if (!template) throw new Error(`#${id} is missing`);
        return template.content.firstElementChild.cloneNode(true);
    }

    // 두 카드의 껍데기: 상품 번호, 이미지 칸, 브랜드·이름·용량 줄, 재고, 관심상품 버튼.
    function fillCardShell(card, product) {
        const name = product.name || product.full_text || "";
        const href = detailHref(product);

        card.dataset.productId = product.id;

        const imageLink = card.querySelector(".product-image-link");
        imageLink.setAttribute("href", href);
        imageLink.setAttribute("aria-label", `${name} 상세 보기`);
        const image = card.querySelector(".product-image img");
        if (product.image_url) {
            image.setAttribute("src", product.image_url);
            image.setAttribute("alt", name);
            card.querySelector(".product-image .no-image").remove();
        } else {
            image.remove();
        }

        card.querySelector(".product-brand").textContent = product.brand || "-";
        const nameLink = card.querySelector(".product-name a");
        nameLink.setAttribute("href", href);
        nameLink.textContent = name;
        card.querySelector(".product-variant").textContent = product.form_and_quantity || "";

        const stock = card.querySelector(".stock-status");
        stock.classList.remove("in-stock", "out-of-stock");
        stock.classList.add(String(product.availability ?? "").trim() === "재고있음" ? "in-stock" : "out-of-stock");
        stock.textContent = product.availability || "";

        card.querySelector("[data-favorite-toggle]").dataset.productId = product.id;
    }

    function productCard(product) {
        const card = cloneTemplate(TEMPLATE_ID);
        fillCardShell(card, product);
        const isListPriceDrop = product.list_price_drop_percentage !== undefined && product.list_price_drop_percentage !== null;

        const badge = card.querySelector(".sale-badge");
        if (isListPriceDrop) {
            badge.classList.add("list-price-drop-badge");
            badge.textContent = `정가 ${product.list_price_drop_percentage}%↓`;
        } else if (product.is_on_sale) {
            badge.textContent = `${product.discount_percentage ?? 0}% ↓`;
        } else {
            badge.remove();
        }

        const originalPrice = card.querySelector(".original-price");
        if (product.is_on_sale) {
            originalPrice.textContent = `₩${formatPrice(product.original_price)}`;
        } else {
            originalPrice.remove();
        }
        card.querySelector(".current-price").textContent = `₩${formatPrice(product.current_price)}`;

        if (product.unit_price_description) {
            card.querySelector(".unit-price-text").textContent = product.unit_price_description;
        } else {
            card.querySelector(".unit-price-summary").remove();
        }

        const listPriceDropMeta = card.querySelector(".list-price-drop-meta");
        if (isListPriceDrop) {
            // "N일 최고 정가"는 서버가 가격 기록 기간 설정으로 적어 둔다. 여기서는 가격만 채운다.
            listPriceDropMeta.querySelector(".list-price-drop-high").textContent =
                `₩${formatPrice(product.recent_high_original_price)}`;
        } else {
            listPriceDropMeta.remove();
        }

        // 쿠팡 줄. 값이 있으면 가격을 채우고 hidden을 걷는다. 칩 글자(coupang_percent_text)가 없으면(iHerb가 싸거나 비슷하거나 iHerb만 품절)
        // 칩을 지운다. 값이 없으면 줄을 지운다. 옛 빈 카드에는 이 칸이 없다(위 머리 설명).
        const coupangLine = card.querySelector(".card-coupang");
        if (coupangLine) {
            if (typeof product.coupang_price === "number") {
                coupangLine.querySelector(".card-coupang-price").textContent = `₩${formatPrice(product.coupang_price)}`;
                coupangLine.hidden = false;
                const chip = coupangLine.querySelector(".card-coupang-chip");
                if (product.coupang_percent_text) {
                    chip.textContent = `${product.coupang_percent_text} 저렴`;
                } else {
                    chip.remove();
                }
            } else {
                coupangLine.remove();
            }
        }
        return card;
    }

    // 쿠팡 비교 카드. 배지는 더 싼 쪽(winner)의 판매처와 비율 글자, 가격 줄은 더 싼 쪽이 위에 굵게(is-best) 선다. iHerb 줄은 그 기준에서 견준
    // 가격(iherb_price, 적용가 기준이면 코드 적용가)이다. 적용가 칩은 코드 적용가로 견준 카드(code_applied)에만 남긴다. 칩의 글자(운영값 N)는
    // 서버가 빈 카드에 적어 두었다(운영값이 없는 사이트의 빈 카드에는 칩이 없다).
    function compareCard(item) {
        const card = cloneTemplate(COMPARE_TEMPLATE_ID);
        fillCardShell(card, item);
        const winner = item.winner;

        const badge = card.querySelector(".store-badge");
        badge.classList.add(`store-badge--${winner}`);
        badge.textContent = `${STORE_NAMES[winner]} ${item.percent_text} 저렴`;

        const lines = card.querySelector(".compare-lines");
        const line = (store) => lines.querySelector(`.compare-line--${store}`);
        line("coupang").querySelector(".compare-line-price").textContent = `₩${formatPrice(item.coupang_price)}`;
        line("iherb").querySelector(".compare-line-price").textContent = `₩${formatPrice(item.iherb_price)}`;
        if (!item.code_applied) {
            line("iherb").querySelector(".compare-code-chip")?.remove();
        }
        // 빈 카드는 쿠팡 줄이 위다. 더 싼 쪽을 맨 위로 옮긴다.
        line(winner).classList.add("is-best");
        lines.prepend(line(winner));
        return card;
    }

    function openCardDetail(event) {
        const card = event.target.closest(".product-card");
        if (card && !event.target.closest("a, button")) {
            const target = card.querySelector("a[href]")?.getAttribute("href");
            if (target) {
                window.location.href = target;
            }
        }
    }

    document.addEventListener("click", openCardDetail);

    window.BLIME_CARDS = { productCard, compareCard };
})();
