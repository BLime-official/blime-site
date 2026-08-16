(function initCouponPage() {
    const page = document.querySelector("[data-coupon-page]");
    if (!page) return;

    // 종류 구분(쿠폰 코드·자동 할인)은 탭 역할의 버튼이고, 구분마다 패널이 하나다. 한 번에 한 패널만 보인다.
    // 이 이름들(data-coupon-segment, data-coupon-panel)은 옛 HTML에 없다. 옛 HTML을 만나면 둘 다 빈 목록이라 아무것도 하지 않는다
    // (동기화가 JS를 템플릿보다 먼저 보낸다). 반대로 옛 스크립트가 아는 이름(data-coupon-type-tab, data-promotion-type·status)은 새 HTML에 쓰지 않는다.
    const segments = Array.from(page.querySelectorAll("[data-coupon-segment]"));
    const panels = Array.from(page.querySelectorAll("[data-coupon-panel]"));
    let selectedType = segments.find((segment) => segment.getAttribute("aria-selected") === "true")?.dataset.couponSegment;

    function renderSelection() {
        segments.forEach((segment) => {
            const isSelected = segment.dataset.couponSegment === selectedType;
            segment.setAttribute("aria-selected", String(isSelected));
            segment.tabIndex = isSelected ? 0 : -1;
        });
        panels.forEach((panel) => {
            panel.hidden = panel.dataset.couponPanel !== selectedType;
        });
    }

    function setupTabGroup(tabs, dataKey, selectTab) {
        tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                selectTab(tab.dataset[dataKey]);
                tab.focus();
            });
            tab.addEventListener("keydown", (event) => {
                const currentIndex = tabs.indexOf(event.currentTarget);
                let nextIndex;
                if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = tabs.length - 1;
                if (nextIndex === undefined) return;

                event.preventDefault();
                const nextTab = tabs[nextIndex];
                selectTab(nextTab.dataset[dataKey]);
                nextTab.focus();
            });
        });
    }

    function selectType(value) {
        selectedType = value;
        renderSelection();
    }

    setupTabGroup(segments, "couponSegment", selectType);

    // 만료된 쿠폰: 목록 끝의 단추가 같은 자리에서 접힌 만료 목록을 열고 닫는다. aria-expanded가 상태를 알리고, 단추 글자는 열려 있는 동안
    // '만료된 쿠폰 접기', 접히면 '만료된 쿠폰 N개 보기'다. 두 글자는 템플릿이 data 속성(data-expanded-label, data-collapsed-label)으로 준다.
    // 속성이 없는 HTML이면(동기화는 JS를 템플릿보다 먼저 보낸다) 글자를 그대로 둔다.
    function toggleExpired(button) {
        const list = document.getElementById(button.getAttribute("aria-controls"));
        if (!list) return;
        const expand = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(expand));
        list.hidden = !expand;
        const { expandedLabel, collapsedLabel } = button.dataset;
        if (expandedLabel && collapsedLabel) button.textContent = expand ? expandedLabel : collapsedLabel;
    }

    page.addEventListener("click", async (event) => {
        const expiredToggle = event.target.closest("[data-coupon-expired-toggle]");
        if (expiredToggle) {
            toggleExpired(expiredToggle);
            return;
        }

        // 빈 화면의 링크("자동 할인 N개 보기 →")는 다른 구분으로 간다. 눌렀던 링크가 숨은 패널에 들어가므로 초점은 고른 구분이 받는다.
        const goTo = event.target.closest("[data-coupon-go]");
        if (goTo) {
            const target = segments.find((segment) => segment.dataset.couponSegment === goTo.dataset.couponGo);
            if (target) {
                selectType(goTo.dataset.couponGo);
                target.focus();
            }
            return;
        }

        const button = event.target.closest("[data-copy-coupon]");
        if (!button) return;
        try {
            await navigator.clipboard.writeText(button.dataset.copyCoupon);
            window.BLIME_AUTH?.showFlash?.("쿠폰 코드가 복사되었습니다.");
        } catch (error) {
            window.BLIME_AUTH?.showFlash?.("코드를 복사하지 못했습니다.");
        }
    });
})();
