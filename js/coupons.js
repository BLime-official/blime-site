(function initCouponPage() {
    const page = document.querySelector("[data-coupon-page]");
    if (!page) return;

    const typeTabs = Array.from(page.querySelectorAll("[data-coupon-type-tab]"));
    const statusTabs = Array.from(page.querySelectorAll("[data-coupon-status-tab]"));
    const panels = Array.from(page.querySelectorAll("[data-promotion-type][data-promotion-status]"));
    let selectedType = "coupon_code";
    let selectedStatus = "active";

    function renderSelection() {
        const selectedTypeTab = typeTabs.find((tab) => tab.dataset.couponTypeTab === selectedType);
        typeTabs.forEach((tab) => {
            const isSelected = tab.dataset.couponTypeTab === selectedType;
            tab.setAttribute("aria-selected", String(isSelected));
            tab.tabIndex = isSelected ? 0 : -1;
        });
        statusTabs.forEach((tab) => {
            const isSelected = tab.dataset.couponStatusTab === selectedStatus;
            tab.setAttribute("aria-selected", String(isSelected));
            tab.tabIndex = isSelected ? 0 : -1;
            const label = tab.dataset.couponStatusTab === "active" ? "사용 가능" : "만료";
            tab.textContent = `${label} (${selectedTypeTab.dataset[`${tab.dataset.couponStatusTab}Count`]})`;
        });
        panels.forEach((panel) => {
            panel.hidden = panel.dataset.promotionType !== selectedType || panel.dataset.promotionStatus !== selectedStatus;
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

    setupTabGroup(typeTabs, "couponTypeTab", (value) => {
        selectedType = value;
        renderSelection();
    });
    setupTabGroup(statusTabs, "couponStatusTab", (value) => {
        selectedStatus = value;
        renderSelection();
    });

    page.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy-coupon]");
        if (!button) return;
        try {
            await navigator.clipboard.writeText(button.dataset.copyCoupon);
            window.BLIME_AUTH?.showFlash?.("쿠폰 코드가 복사되었습니다.");
        } catch (error) {
            window.BLIME_AUTH?.showFlash?.("코드를 복사하지 못했습니다.");
        }
    });

    renderSelection();
})();
