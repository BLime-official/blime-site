// 사이트 자료(JSON)를 기다리는 시간의 한도. 응답이 멈춘 망에서 받는 자리가 영영 기다리지 않게 한다. 넘기면 각 페이지의 실패 처리로 간다.
// base.html이 format.js 다음에 모든 페이지에 싣는다. 쓰는 쪽: home.js, product_list.js, favorites.js.
(() => {
    const LIMIT_MS = 10000;

    async function fetchJson(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LIMIT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`${url} ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    function deadline(onExpire) {
        const timer = setTimeout(onExpire, LIMIT_MS);
        return () => clearTimeout(timer);
    }

    window.BLIME_LOAD = { LIMIT_MS, fetchJson, deadline };
})();
