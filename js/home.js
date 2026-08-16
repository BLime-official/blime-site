// 홈(index.html)의 스크립트. 홈만 싣는다(main_dashboard.html의 page_scripts). 상품 목록과 검색은 검색 화면(product_list.js)이 맡는다.
// - 페이지 안 링크(#…)는 주소를 바꾸지 않고 부드럽게 스크롤한다. 홈에서 이런 링크는 로고·헤더 메뉴의 홈·하단 탭의 홈(#home)이고, 누르면
//   홈 맨 위(머리 section#home)로 올라간다(2026-09-27 결정. product_list.js에 있던 것을 웹 개편 3단계에서 옮겼다). 가리키는 요소가 없으면
//   아무 일도 하지 않는다.
// - 사용 가능한 쿠폰 줄([data-home-row="coupons"])을 쿠폰 JSON으로 그린다(아래 initCouponRow).
// - 로그인한 사람의 관심상품 줄([data-home-row="favorites"])을 내 관심상품 번호와 혜택 인덱스로 그린다(아래 loadFavorites). 열어 둔 자리를
//   10초 안에 그리지 못하면 접고 이 페이지에서는 다시 열지 않는다(아래 startFavoritesDeadline).
(() => {
    const siteRoot = () => document.body?.dataset.siteRoot ?? '';

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

    const initSmoothScroll = () => {
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener('click', (event) => {
                event.preventDefault();
                const target = document.getElementById(anchor.getAttribute('href').slice(1));
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    };

    // 사용 가능한 쿠폰 줄. 쿠폰은 쿠폰 전용 빌드가 10분마다 바꾸지만 홈 HTML은 전체 빌드 때만 바뀌어서, 두 빌드가 같은 함수로 쓰는
    // coupons/active.json({"codes": [{code, title, percent, ends_at}]}, 쿠폰 페이지 순서의 사용 가능한 쿠폰 코드)을 받아 그린다.
    // 받는 동안은 서버가 그린 빈 칸 넷과 개수 자리가 받은 칸과 같은 크기로 자리를 잡아, 받은 뒤 아래 줄이 움직이지 않는다.
    // 파일은 다음 쿠폰 빌드와 캐시(각 10분) 동안 그대로라 그사이 끝난 코드가 실려 있을 수 있다. 열 때의 시각으로 끝난 코드를 빼고(끝나는 시각이
    // 없는 코드는 남긴다) 개수를 센다. 남은 코드가 없거나 받지 못하면(응답 오류, 10초 안에 다 받지 못함, 읽지 못하는 JSON, codes가 목록이 아님)
    // 줄을 접는다. 줄 자리가 없는 페이지(옛 홈)에서는 아무것도 하지 않는다.
    const COUPON_CELLS = 4;

    const isLive = (code, now) => !code.ends_at || Date.parse(code.ends_at) > now;

    const readLiveCoupons = async () => {
        const codes = (await loadLimit().fetchJson(`${siteRoot()}coupons/active.json`))?.codes;
        if (!Array.isArray(codes)) throw new Error('coupons/active.json에 codes 목록이 없다');
        const now = Date.now();
        return codes.filter((code) => typeof code?.code === 'string' && code.code !== '' && isLive(code, now));
    };

    // 복사는 쿠폰 페이지(coupons.js)와 같은 알림이다.
    const copyCode = async (code) => {
        try {
            await navigator.clipboard.writeText(code);
            window.BLIME_AUTH?.showFlash?.('쿠폰 코드가 복사되었습니다.');
        } catch (error) {
            window.BLIME_AUTH?.showFlash?.('코드를 복사하지 못했습니다.');
        }
    };

    // 칸 하나: 할인율(없으면 템플릿의 표 아이콘을 두고 칸을 '할인 쿠폰' 그림으로 읽게 한다), 코드, 제목, 복사 버튼
    const couponCell = (template, coupon) => {
        const cell = template.content.firstElementChild.cloneNode(true);
        const percent = cell.querySelector('.home-coupon-percent');
        if (Number.isFinite(coupon.percent) && coupon.percent > 0) {
            percent.textContent = `${coupon.percent.toLocaleString('ko-KR')}%`;
        } else {
            percent.setAttribute('role', 'img');
            percent.setAttribute('aria-label', '할인 쿠폰');
        }
        cell.querySelector('.home-coupon-text > code').textContent = coupon.code;
        cell.querySelector('.home-coupon-text > code + span').textContent = coupon.title ?? '';
        const copy = cell.querySelector('.home-coupon-copy');
        copy.setAttribute('aria-label', `쿠폰 코드 ${coupon.code} 복사`);
        copy.addEventListener('click', () => copyCode(coupon.code));
        return cell;
    };

    const initCouponRow = async () => {
        const row = document.querySelector('[data-home-row="coupons"]');
        const count = row?.querySelector('.home-row-count');
        const cells = row?.querySelector('[data-home-coupons]');
        const template = document.getElementById('home-coupon-template');
        if (!count || !cells || !template) return;

        let coupons = [];
        try {
            coupons = await readLiveCoupons();
        } catch (error) {
            console.warn('[home] 쿠폰 목록을 받지 못해 쿠폰 줄을 접습니다:', error.message || error);
        }
        if (!coupons.length) {
            row.hidden = true;
            return;
        }
        count.textContent = coupons.length.toLocaleString('ko-KR');
        count.classList.remove('is-pending');
        count.removeAttribute('aria-hidden');
        cells.replaceChildren(...coupons.slice(0, COUPON_CELLS).map((coupon) => couponCell(template, coupon)));
        cells.classList.remove('is-loading');
        row.removeAttribute('aria-busy');
    };

    // 관심상품 줄. 로그인한 사람의 관심상품 가운데 혜택(할인 중, 정가 하락, 쿠팡이 더 쌈)이 있는 것을 최대 셋 보인다(사용자 결정 17). 사람마다 달라
    // 서버가 그릴 수 없고, 홈은 전체 상품 인덱스(products_index.json)를 받지 않는다(사용자 결정 18). 내 관심상품 번호(user_product_favorites)와 빌드가 쓰는
    // 혜택 인덱스 benefits_index.json({"products": {"<번호>": {name, brand, image_url, availability}}, "benefits": [{id, kind, text, price}],
    // "code_benefits": [...]}. 기준마다 홈에 보일 순서의 행)을 함께 받아, 지금 가격 기준의 행 가운데 내 관심상품을 순서대로 고른다.
    // 관심상품 번호는 이 파일이 직접 읽는다. favorites.js에 기대면, 배포 뒤 캐시에 남은 옛 favorites.js(10분)를 만난 사람의 자리가 영영 접히지 않는다.
    // - 자리: 로그인 세션이 있으면 본문의 인라인 스크립트가 첫 그림 전에 숨은 줄 자리(제목, 개수 자리, 빈 행)를 연다. 빈 행은 지난번에 그린 행 수만큼이고
    //   (ROWS_KEY. 기억이 없거나 읽지 못하면 셋, 0이면 자리를 두지 않는다. 사용자 결정 2026-10-26), 그 수가 맞으면 받은 뒤 아래 줄이 움직이지 않는다.
    //   로그인 확인(blime:auth-state-changed)이 사용자 없음이거나, DOMContentLoaded에 로그인 스크립트(BLIME_AUTH)가 없으면 접는다.
    // - 그리기: 고른 행이 있으면 앞 셋과 제목 'N개 가격이 좋아졌어요'를 그리고 줄을 보인다(자리를 먼저 열지 못한 막 로그인한 사람, 지난번 0이라 자리를
    //   두지 않은 사람도). 0개이거나 둘 중 하나라도 받지 못하면(관심상품 읽기 오류, 응답 오류, 혜택 인덱스를 10초 안에 다 받지 못함, 읽지 못하는 JSON)
    //   접는다. 그렸거나 그릴 것이 없어 접으면 그린 행 수(0~3)를 기억하고, 받지 못했거나 로그인하지 않아 접으면 쓰지 않는다(다음 방문은 지난 기억대로,
    //   없으면 셋). 로그인 확인이 다시 오면 다시 받고, 늦게 온 옛 응답은 버린다.
    // - 마감: 열어 둔 자리는 로그인 확인, 두 자료 받기, 그리기를 합쳐 10초 안에 끝나지 않으면(응답이 멈춘 망, 끝나지 않는 세션 확인) 접는다. 받던 응답과
    //   그 뒤의 로그인 확인은 버려 이 페이지에서는 다시 열지 않고, 받지 못해 접은 것이라 행 수를 기억하지 않는다. 자리를 열지 않은 방문은 숨은 채
    //   받으므로 기다리는 자리가 없다.
    // - 기준: <html data-iherb-code="on">이고 적용가 행(code_benefits)이 있으면 적용가 기준, 아니면 일반 기준이다. 가격 보기 설정이 바뀌면
    //   (blime:iherb-code-changed) 받아 둔 값으로 다시 고른다. 적용가에서 비슷해진 관심상품은 빠지고 N과 쿠팡 글이 따라 바뀐다(사용자 결정 20).
    const FAVORITE_ROWS = 3;
    // 지난번에 그린 행 수(0~3)를 두는 브라우저 저장소 키. 본문의 인라인 스크립트가 같은 이름으로 읽는다.
    const ROWS_KEY = 'blime:home-favorites-rows';
    // 받기를 시작할 때마다 올린다. 받는 사이에 다시 시작했으면(다른 로그인 확인) 앞의 응답은 버린다. 마감도 올려 받던 응답을 버린다.
    let favoritesTurn = 0;
    // 받아 둔 값: { ids: 내 관심상품 번호(문자열) Set, index: 혜택 인덱스 }. 받는 동안과 받지 못했을 때는 null이다.
    let favoritesData = null;
    // 마감에 접었다. 이 페이지에서는 더 받지 않는다(늦게 온 로그인 확인이 줄을 다시 열지 않게).
    let favoritesClosed = false;
    // 열어 둔 자리의 마감을 거둔다(startFavoritesDeadline이 건다). 마감이 없으면 아무것도 하지 않는다.
    let cancelFavoritesDeadline = () => {};

    const favoritesRow = () => document.querySelector('[data-home-row="favorites"]');

    // 줄을 접는다. 기다리던 자리가 끝났으니 마감도 거둔다.
    const foldFavorites = () => {
        cancelFavoritesDeadline();
        const row = favoritesRow();
        if (row) row.hidden = true;
    };

    // 그린 행 수를 기억한다. 저장소를 쓰지 못하면(사생활 보호 모드, 차단, 용량 초과) 그냥 지나간다. 다음 방문은 처음처럼 셋을 둔다.
    const rememberRows = (count) => {
        try {
            localStorage.setItem(ROWS_KEY, String(count));
        } catch (error) {
            return;
        }
    };

    const readFavoriteIds = async (user) => {
        const client = window.BLIME_AUTH?.getClient?.();
        if (!client) throw new Error('Supabase 클라이언트가 없다');
        const { data, error } = await client.from('user_product_favorites').select('product_id').eq('user_id', user.id);
        if (error || !Array.isArray(data)) throw new Error(`관심상품 읽기 실패: ${error?.message || '목록이 아님'}`);
        return new Set(data.map((row) => String(row?.product_id)));
    };

    const readBenefitsIndex = async () => {
        const index = await loadLimit().fetchJson(`${siteRoot()}benefits_index.json`);
        if (!Array.isArray(index?.benefits) || !index.products || typeof index.products !== 'object') {
            throw new Error('benefits_index.json에 benefits·products가 없다');
        }
        return index;
    };

    // 지금 기준의 행 가운데 내 관심상품(인덱스의 순서 그대로)
    const pickFavorites = ({ ids, index }) => {
        const codeView = document.documentElement.getAttribute('data-iherb-code') === 'on';
        const rows = codeView && Array.isArray(index.code_benefits) ? index.code_benefits : index.benefits;
        return rows.filter((benefit) => ids.has(String(benefit?.id)) && index.products[String(benefit.id)]);
    };

    // 행 하나: 상세 페이지 링크, 사진(없으면 img를 지운다), 브랜드와 이름, 혜택 글(할인 중·정가 하락 빨강, 쿠팡이 더 쌈 쿠팡 파랑), 가격.
    // 품절(재고 문구가 '재고있음'이 아니다. 상품 카드와 같은 규칙)이면 is-soldout이고 혜택 글 뒤에 품절 칩이 남는다.
    const favoriteRow = (template, benefit, product) => {
        const item = template.content.firstElementChild.cloneNode(true);
        item.href = `${siteRoot()}products/product_${benefit.id}.html`;
        const image = item.querySelector('.home-favorite-image img');
        if (product.image_url) {
            image.src = product.image_url;
        } else {
            image.remove();
        }
        const name = item.querySelector('.home-favorite-name');
        const brand = name.querySelector('.home-favorite-brand');
        if (product.brand) {
            brand.textContent = product.brand;
            name.append(` ${product.name ?? ''}`);
        } else {
            brand.remove();
            name.append(product.name ?? '');
        }
        const text = item.querySelector('.home-favorite-benefit');
        text.classList.add(benefit.kind === 'coupang' ? 'home-favorite-benefit--coupang' : 'home-favorite-benefit--drop');
        text.prepend(benefit.text ?? '');
        if (String(product.availability ?? '').trim() === '재고있음') {
            text.querySelector('.home-soldout').remove();
        } else {
            item.classList.add('is-soldout');
        }
        item.querySelector('.home-favorite-price').textContent = `₩${window.BLIME_FORMAT.price(benefit.price)}`;
        return item;
    };

    const drawFavorites = () => {
        const row = favoritesRow();
        const count = row?.querySelector('.home-row-count');
        const cells = row?.querySelector('[data-home-favorites]');
        const template = document.getElementById('home-favorite-template');
        if (!count || !cells || !template || !favoritesData) return;

        const picked = pickFavorites(favoritesData);
        if (!picked.length) {
            foldFavorites();
            rememberRows(0);
            return;
        }
        const { products } = favoritesData.index;
        const shown = picked.slice(0, FAVORITE_ROWS);
        cells.replaceChildren(...shown.map((benefit) => favoriteRow(template, benefit, products[String(benefit.id)])));
        count.textContent = `${picked.length.toLocaleString('ko-KR')}개 가격이 좋아졌어요`;
        count.classList.remove('is-pending');
        count.removeAttribute('aria-hidden');
        cells.classList.remove('is-loading');
        row.removeAttribute('aria-busy');
        row.hidden = false;
        cancelFavoritesDeadline();
        rememberRows(shown.length);
    };

    const loadFavorites = async (user) => {
        if (favoritesClosed) return;
        const turn = ++favoritesTurn;
        favoritesData = null;
        if (!favoritesRow()) return;
        if (!user) {
            foldFavorites();
            return;
        }
        try {
            const [ids, index] = await Promise.all([readFavoriteIds(user), readBenefitsIndex()]);
            if (turn !== favoritesTurn) return;
            favoritesData = { ids, index };
            drawFavorites();
        } catch (error) {
            if (turn !== favoritesTurn) return;
            favoritesData = null;
            console.warn('[home] 관심상품 줄을 그리지 못해 접습니다:', error.message || error);
            foldFavorites();
        }
    };

    // 열어 둔 자리의 마감. 본문의 인라인 스크립트가 로그인 세션을 보고 연 자리(이 스크립트가 실행될 때 보인다)에만 건다. 마감에 아직 받는 중이면
    // 차례를 올려 받던 응답을 버리고 접는다. 그 뒤로는 받지 않는다(favoritesClosed).
    const startFavoritesDeadline = () => {
        const row = favoritesRow();
        if (!row || row.hidden) return;
        cancelFavoritesDeadline = loadLimit().deadline(() => {
            if (row.hidden || row.getAttribute('aria-busy') !== 'true') return;
            favoritesClosed = true;
            favoritesTurn += 1;
            favoritesData = null;
            console.warn('[home] 관심상품 줄을 10초 안에 그리지 못해 접습니다');
            foldFavorites();
        });
    };

    // 쿠폰 줄은 본문 다음에 실리는 이 스크립트가 실행될 때 바로 받는다(DOMContentLoaded를 기다리지 않는다). 열어 둔 관심상품 자리의 마감도 이때 건다.
    initCouponRow();
    startFavoritesDeadline();
    // 로그인 확인은 auth.js가 DOMContentLoaded 뒤에 보내므로 그 전에 듣는다. 가격 보기 설정이 바뀌면 받아 둔 값으로 다시 그린다.
    window.addEventListener('blime:auth-state-changed', (event) => loadFavorites(event.detail?.user || null));
    window.addEventListener('blime:iherb-code-changed', () => {
        if (favoritesData) drawFavorites();
    });
    document.addEventListener('DOMContentLoaded', () => {
        // 로그인 스크립트를 받지 못했으면 로그인 확인이 오지 않는다. 열어 둔 자리를 접는다.
        if (!window.BLIME_AUTH) foldFavorites();
        initSmoothScroll();
    });
})();
