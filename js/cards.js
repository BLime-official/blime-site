// 상품 카드. 모양은 페이지의 <template id="product-card-template">이 정한다. 서버 카드와 같은 Jinja 매크로
// (app/site_builder/templates/partials/product_card.html)로 모든 칸을 두고 값은 비운 카드다.
// 여기서는 그 카드를 복제해 상품 값을 채우고, 해당 없는 칸을 지운다. 칸 규칙은 매크로의 설명과 같다.
// 상품 값의 모양은 app/site_builder/view_models/products.py(card_data)를 따른다.
// 카드의 링크·버튼 밖을 눌러도 상세 페이지로 간다. 서버가 그린 카드도 같다.
(() => {
    const TEMPLATE_ID = "product-card-template";
    const formatPrice = (price) => window.BLIME_FORMAT.price(price);

    // 페이지는 body에 사이트 루트까지의 상대 경로(data-site-root)를 적어 둔다.
    function detailHref(product) {
        const siteRoot = document.body?.dataset.siteRoot ?? "";
        return `${siteRoot}${product.detail_path || `products/product_${product.id}.html`}`;
    }

    function productCard(product) {
        const template = document.getElementById(TEMPLATE_ID);
        if (!template) throw new Error(`#${TEMPLATE_ID} is missing`);
        const card = template.content.firstElementChild.cloneNode(true);
        const name = product.name || product.full_text || "";
        const href = detailHref(product);
        const isListPriceDrop = product.list_price_drop_percentage !== undefined && product.list_price_drop_percentage !== null;

        card.dataset.productId = product.id;

        const badge = card.querySelector(".sale-badge");
        if (isListPriceDrop) {
            badge.classList.add("list-price-drop-badge");
            badge.textContent = `정가 ${product.list_price_drop_percentage}%↓`;
        } else if (product.is_on_sale) {
            badge.textContent = `${product.discount_percentage ?? 0}% ↓`;
        } else {
            badge.remove();
        }

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

        const originalPrice = card.querySelector(".original-price");
        if (product.is_on_sale || isListPriceDrop) {
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

        const stock = card.querySelector(".stock-status");
        stock.classList.remove("in-stock", "out-of-stock");
        stock.classList.add(String(product.availability ?? "").trim() === "재고있음" ? "in-stock" : "out-of-stock");
        stock.textContent = product.availability || "";

        card.querySelector("[data-favorite-toggle]").dataset.productId = product.id;
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

    window.BLIME_CARDS = { productCard };
})();
