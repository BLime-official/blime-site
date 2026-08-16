// 상품 검색. 홈과 검색 페이지의 product_list.js가 window.BLIME_SEARCH.score로 상품마다 점수를 매긴다(0이면 결과에서 뺀다).
// 동의어 사전은 synonyms.js(window.BLIME_SYNONYMS)에 있다. admin/build_synonyms.py가 admin/synonyms_config.json으로 만든다.
//
// 정규화: 소문자로 바꾸고, 숫자·영문 소문자·한글이 아닌 글자는 한 칸 공백으로 바꾼다. 검색어, 사전의 말, 상품 텍스트에
// 모두 쓴다. 상품 인덱스의 검색 필드(app/site_builder/view_models/search.py)와 같은 규칙이고, 두 쪽은
// tests/site/search_normalization.json의 같은 예로 검사한다. 예전에는 검색어와 사전이 구두점을 남겨
// "doctor's best"나 "omega-3"가 인덱스의 "doctor s best", "omega 3"와 맞지 않았다(P3-6에서 합침).
(() => {
    const NON_WORD = /[^0-9a-z가-힣]+/g;

    function normalize(value) {
        return String(value || "").toLowerCase().replace(NON_WORD, " ").trim();
    }

    // 사전의 묶음마다 정규화한 말들. 한 말이 여러 묶음에 있어도 된다.
    const groups = Object.entries(window.BLIME_SYNONYMS || {}).map(([key, synonyms]) => {
        const terms = new Set([key, ...synonyms].map(normalize));
        terms.delete("");
        return terms;
    });
    const knownTerms = new Set(groups.flatMap((terms) => Array.from(terms)));

    function synonymsOf(word) {
        const expanded = new Set([word]);
        groups.forEach((terms) => {
            if (terms.has(word)) terms.forEach((term) => expanded.add(term));
        });
        return expanded;
    }

    // 검색 낱말(정규화한 말)을 같은 뜻의 말들로 넓힌다. 여러 낱말로 된 말(예: "vitamin d")은 앞 두 낱말을
    // 각각 넓혀 모든 조합("비타민 d", "vitamin 비타민d" …)도 더한다. 예전에는 낱말마다 앞 3개, 조합 5개까지만
    // 더해 결과가 사전의 배열 순서에 따라 달라졌다.
    const expansionCache = new Map();

    function expand(term) {
        if (expansionCache.has(term)) return expansionCache.get(term);
        const expanded = synonymsOf(term);
        const words = term.split(" ");
        if (words.length > 1) {
            const first = synonymsOf(words[0]);
            const second = synonymsOf(words[1]);
            first.forEach((a) => second.forEach((b) => expanded.add(`${a} ${b}`)));
        }
        const terms = Array.from(expanded);
        expansionCache.set(term, terms);
        return terms;
    }

    // 검색어를 낱말로 나눈다. 사전에 있는 여러 낱말 말(예: "fish oil")은 가장 긴 것부터 한 낱말로 묶는다.
    function tokenize(query) {
        const words = normalize(query).split(" ").filter(Boolean);
        const tokens = [];
        let index = 0;
        while (index < words.length) {
            let length = words.length - index;
            while (length > 1 && !knownTerms.has(words.slice(index, index + length).join(" "))) length -= 1;
            tokens.push(words.slice(index, index + length).join(" "));
            index += length;
        }
        return tokens;
    }

    // 영문 한두 글자 별칭(mg, ca, fe …)은 낱말로 설 때만 맞는다. 350mg의 mg는 마그네슘이 아니다.
    function termMatchesText(text, term) {
        if (!term) return false;
        if (!/^[a-z]{1,2}$/.test(term)) return text.includes(term);
        return new RegExp(`(^| )${term}($| )`).test(text);
    }

    function textMatchesTerm(text, term) {
        return expand(term).some((expandedTerm) => termMatchesText(text, expandedTerm));
    }

    function textMatchesTerms(text, terms) {
        return terms.every((term) => textMatchesTerm(text, term));
    }

    // 상품 인덱스는 정규화한 검색 필드(search)를 싣는다. 페이지에 심은 목록처럼 search가 없으면 필드로 만든다.
    function productSearch(product) {
        const search = product.search || {};
        const text = normalize(search.text || [product.brand, product.name, product.full_text, product.form_and_quantity].filter(Boolean).join(" "));
        const tokens = Array.isArray(search.tokens) && search.tokens.length > 0
            ? search.tokens.map(normalize).filter(Boolean)
            : Array.from(new Set(text.split(" ").filter(Boolean)));
        return {
            brand: normalize(search.brand || product.brand),
            name: normalize(search.name || product.name),
            text,
            tokens: tokens.join(" "),
        };
    }

    // 모든 검색 낱말이 한 곳(브랜드, 상품명, 전체 텍스트, 토큰)에 맞아야 결과다. 점수는 브랜드 100, 상품명 80(낱말마다),
    // 브랜드+상품명에 모두 40, 전체 텍스트 20, 토큰 10을 더한다.
    function score(product, query) {
        const terms = tokenize(query);
        if (terms.length === 0) return 0;
        const search = productSearch(product || {});
        if (![search.brand, search.name, search.text, search.tokens].some((text) => textMatchesTerms(text, terms))) return 0;

        let total = 0;
        terms.forEach((term) => {
            if (textMatchesTerm(search.brand, term)) total += 100;
            if (textMatchesTerm(search.name, term)) total += 80;
        });
        if (textMatchesTerms(normalize(`${search.brand} ${search.name}`), terms)) total += 40;
        if (textMatchesTerms(search.text, terms)) total += 20;
        if (textMatchesTerms(search.tokens, terms)) total += 10;
        return total;
    }

    window.BLIME_SEARCH = { normalize, tokenize, expand, score };
})();
