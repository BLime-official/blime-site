// 여러 스크립트가 같이 쓰는 표시 형식. 모든 공개 페이지와 스크래핑 대시보드가 이것을 쓰는 스크립트보다 먼저 싣는다.
// 카드(cards.js), 가격 차트(product_detail.js), 신규 상품 차트(scraping_dashboard.js)가 window.BLIME_FORMAT으로 부른다.
(() => {
    // 원 단위 가격. 소수점은 버리고 세 자리마다 쉼표를 찍는다(서버 템플릿의 price 필터와 같다). 값이 없으면 "N/A".
    function price(value) {
        if (value === null || value === undefined || value === "") return "N/A";
        const number = Number(value);
        if (Number.isNaN(number)) return String(value);
        return Math.trunc(number).toLocaleString("ko-KR");
    }

    // 'YYYY-MM-DD' → 'M/D'. 좁은 화면의 차트 X축은 연도까지 쓰면 라벨이 서로 붙는다. 다른 모양은 그대로 둔다.
    function compactDate(label) {
        const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(label));
        return match ? `${Number(match[1])}/${Number(match[2])}` : label;
    }

    window.BLIME_FORMAT = { price, compactDate };
})();
