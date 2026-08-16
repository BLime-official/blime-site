// 상품 목록: 검색, 필터 칩, 페이지 나누기. 가격 내림(할인·정가 하락), 쿠팡 비교, 검색 페이지가 싣는다(홈은 싣지 않는다. 웹 개편 3단계).
// 가격 내림과 쿠팡 비교는 구분 버튼으로 목록을 바꾸는 구분 목록 모드다(아래 '구분 목록 모드'). 쿠팡 비교는 가격 기준도 고른다.
// 그 밖의 페이지(동기화가 JS를 템플릿보다 먼저 보낼 때 만나는 옛 홈 등)에서는 아무것도 하지 않는다. 상품 인덱스는 검색 페이지에서만 받는다.
// 검색 페이지는 결과 머리(검색어와 개수), 가격 정렬, 결과 없음 문장, 상품 목록을 받는 동안·받지 못했을 때의 줄도 맡는다.
// 검색어가 없으면 전체 상품(머리 '전체 상품 N', 기본순·가격순 정렬, 24개씩의 쪽)을 보인다(웹 개편 3단계, 아래 showBrowse).
// 또 상품 추가 요청 입구 셋(결과 끝 줄, 결과 없음 카드, 링크 카드)을 상태에 맞춰 보인다. 입구의 버튼은 product_request.js가 연다.
// 카드는 cards.js(window.BLIME_CARDS)가 그리고, 검색 점수는 search.js(window.BLIME_SEARCH)가 매기고,
// iHerb 링크 판정은 product_request.js(window.BLIME_PRODUCT_REQUEST.findIherbUrl)가 한다.
// 이 스크립트의 검색창은 문서의 첫 .search-input·.search-button이다. 헤더 검색창(partials/site_header.html)은 그 클래스를 쓰지 않는다.
// 쓰면 목록 페이지에서 헤더 검색창이 목록을 걸러 버린다. 헤더 검색창은 폼을 보내 search/?q=…로 가고, 이 스크립트는 검색 페이지에서만
// 그 칸의 글자를 지금 검색어에 맞춘다(syncHeaderSearch).
(() => {
    let currentPage = 1;
    const itemsPerPage = 24;
    let allProducts = [];
    let filteredProducts = [];
    // 검색 페이지에서 순위(관련도순)로 정한 결과. 정렬을 바꿀 때마다 이 목록에서 다시 정렬하므로, 가격순에서 관련도순으로 돌아오면 처음 순위가 그대로 나온다.
    let rankedProducts = [];
    // 상품 목록(검색 페이지는 products_index.json)을 받는 동안은 'loading', 받았으면 'ready', 받지 못했으면 'failed'다.
    // 받기 전에 들어온 검색은 빈 목록으로 찾지 않는다. 마지막 하나만 pendingSearch에 두었다가 목록이 오면 한다.
    let productsStatus = 'loading';
    let pendingSearch = null;

    // 페이지는 body에 자기 종류(data-page)와 사이트 루트까지의 상대 경로(data-site-root)를 적어 둔다.
    // 주소를 보고 페이지나 경로를 추측하지 않는다.
    const bodyPage = () => document.body?.dataset.page || '';
    const siteRoot = () => document.body?.dataset.siteRoot ?? '';
    const isSearchPage = () => bodyPage() === 'search';

    const getProductsIndexUrl = () => `${siteRoot()}products_index.json`;

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

    // 검색 규칙은 search.js(window.BLIME_SEARCH)에 있다. 그 스크립트를 못 받았으면 상품명·브랜드·설명·용량에
    // 검색어가 그대로 들어 있는지만 본다.
    const scoreProductForQuery = (product, query) => {
        if (window.BLIME_SEARCH) {
            return window.BLIME_SEARCH.score(product, query);
        }
        const searchableText = [product.name, product.brand, product.full_text, product.form_and_quantity].join(' ');
        return searchableText.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
    };

    const filterAndRankProducts = (products, query) => products
        .map((product, index) => ({
            product,
            index,
            score: scoreProductForQuery(product, query)
        }))
        .filter(result => result.score > 0)
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))
        .map(result => result.product);

    // 검색 화면 셸(.mobile-search-shell)의 data-search-state에 지금 보이는 상태를 적는다. search.css가 이 값으로 인기 검색어의 자리를 바꾼다
    // (결과 없음이면 요청 카드 아래, 링크 카드이면 숨김).
    const searchShell = () => document.querySelector('.mobile-search-shell');
    const setSearchShellState = (state) => {
        const shell = searchShell();
        if (shell) shell.dataset.searchState = state;
    };

    // 검색 페이지의 결과 영역([data-search-results])을 연다. 마크업에서 hidden으로 시작하므로, 어느 상태를 그리든(showSearchState) 이 영역이 열려야 한다.
    // 검색어가 없을 때도 닫지 않는다: 그때는 전체 상품이 이 영역에 선다(showBrowse).
    const openSearchPageResults = () => {
        if (!isSearchPage()) return;

        const results = document.querySelector('[data-search-results]');
        if (results) results.hidden = false;
    };

    const searchQueryFromLocation = () => {
        if (!isSearchPage()) return '';
        return new URLSearchParams(window.location.search).get('q')?.trim() || '';
    };

    // 정렬한 새 배열을 돌려준다. relevance는 받은 순서 그대로다. 가격순은 Number(current_price)로 정렬한다.
    // 가격이 없거나(카드 값에서 null과 0은 빠져 undefined가 된다) 0 이하이거나 숫자가 아니면 두 가격순 모두 맨 뒤에 두고,
    // 같은 값은 받은 순서를 지킨다.
    const sortProducts = (products, order) => {
        if (order !== 'price-asc' && order !== 'price-desc') return [...products];

        const direction = order === 'price-asc' ? 1 : -1;
        const priceOf = (product) => {
            const price = Number(product.current_price);
            return Number.isFinite(price) && price > 0 ? price : null;
        };

        return products
            .map((product, index) => ({ product, index, price: priceOf(product) }))
            .sort((a, b) => {
                const aMissing = a.price === null;
                const bMissing = b.price === null;
                if (aMissing || bMissing) return (Number(aMissing) - Number(bMissing)) || (a.index - b.index);
                return (direction * (a.price - b.price)) || (a.index - b.index);
            })
            .map(entry => entry.product);
    };

    // 검색 페이지 결과 영역에서 상태마다 보이는 자리들. 결과 영역을 열고 지금 상태의 것만 보인다. 모두 마크업에서 숨긴 채 시작한다
    // (옛 스크립트가 빈 머리나 다른 줄을 보이지 않게). 자리가 없는 옛 search.html이면 그 자리만 건너뛴다(동기화는 JS를 템플릿보다 먼저 보낸다).
    //   results: 결과 머리와 결과 끝 줄('찾는 상품이 없나요?' → 요청)
    //   browse: 검색어가 없을 때의 전체 상품 머리('전체 상품 N'과 정렬)와 결과 끝 줄
    //   no-results: 결과 없음 줄과 요청 카드
    //   loading: 검색어가 있을 때 상품 목록을 받는 중('‘검색어’ 찾는 중이에요')
    //   browse-loading: 검색어가 없을 때 상품 목록을 받는 중('상품 목록을 불러오는 중이에요')
    //   load-error: 상품 목록을 끝내 받지 못함(응답 오류, 읽지 못하는 JSON, 10초 안에 다 받지 못함. 검색어가 있든 없든 같은 줄)
    //   link: 붙여 넣은 iHerb 링크의 카드
    // 받는 동안과 받지 못했을 때는 요청 입구를 띄우지 않는다. 상품이 있는지 모르는데 '추적하지 않는 상품일 수 있어요'라고 할 수 없다.
    const SEARCH_STATE_LINES = {
        results: ['[data-search-head]', '[data-search-request-line]'],
        browse: ['[data-search-browse-head]', '[data-search-request-line]'],
        'no-results': ['[data-search-no-results]', '[data-search-request-card]'],
        loading: ['[data-search-loading]'],
        'browse-loading': ['[data-search-browse-loading]'],
        'load-error': ['[data-search-load-error]'],
        link: ['[data-search-link-card]'],
    };
    // 어느 상태에든 나오는 자리를 한 번씩. 결과 끝 줄은 results와 browse 둘에 나온다.
    const SEARCH_STATE_PLACES = [...new Set(Object.values(SEARCH_STATE_LINES).flat())];

    // 자리마다 한 번만 정한다: 지금 상태의 목록에 있으면 보이고 없으면 숨긴다. 상태마다 돌며 (상태, 자리) 쌍으로 덮어쓰면, 두 상태가 같이 쓰는
    // 자리(결과 끝 줄)를 뒤에 오는 상태가 숨긴다(browse가 results 뒤에 있어 결과 화면에서 결과 끝 줄이 사라진다).
    const showSearchState = (state) => {
        const shown = SEARCH_STATE_LINES[state] || [];
        SEARCH_STATE_PLACES.forEach((selector) => {
            const place = document.querySelector(selector);
            if (place) place.hidden = !shown.includes(selector);
        });
        setSearchShellState(state);
        openSearchPageResults();
    };

    // 붙여 넣은 글에 iHerb 링크가 있으면 상품을 찾지 않고 링크 카드를 보인다. 링크 카드가 없는 옛 search.html이면 false를 돌려주고 보통 검색으로 돈다.
    // 상품 목록과 상관이 없다: 목록을 기다리지 않고, 받지 못했을 때도 선다. 목록이 오면 다시 그려질 보류한 검색은 버린다(링크가 마지막 검색이다).
    // 앞선 결과의 카드·쪽 번호는 비우고, 카드를 그리려고 예약해 둔 것도 취소한다(안 하면 비운 뒤에 옛 카드가 붙는다).
    const showLinkCard = (link) => {
        const card = document.querySelector('[data-search-link-card]');
        if (!card) return false;

        card.querySelectorAll('[data-search-link-url]').forEach((node) => {
            node.textContent = link;
        });
        card.querySelectorAll('[data-request-url]').forEach((node) => {
            node.dataset.requestUrl = link;
        });

        pendingSearch = null;
        clearTimeout(pendingRender);
        filteredProducts = [];
        rankedProducts = [];
        currentPage = 1;
        const grid = document.getElementById('products-grid');
        const pagination = document.getElementById('pagination');
        if (grid) grid.innerHTML = '';
        if (pagination) pagination.innerHTML = '';

        showSearchState('link');
        return true;
    };

    // 검색 페이지의 헤더 검색창(#header-search-input, PC)이 지금 검색어를 담게 한다. 페이지 안의 검색창은 휴대폰(768px 이하)에서만,
    // 헤더 검색창은 769px 이상에서만 보인다(앱 모드는 헤더 검색창을 숨기고 페이지 안의 검색창을 모든 폭에서 쓴다).
    // 화면을 돌리거나 넓혀도 같은 검색어가 보여야 하므로 어느 쪽으로 검색해도 맞춘다.
    // 칸에 초점이 있으면(사용자가 치는 중이다) 덮어쓰지 않는다. 목록을 받기 전에 건 검색은 목록이 오면 다시 그려지는데(pendingSearch),
    // 그 재생이 그사이 치던 글자를 옛 검색어로 되돌리면 안 된다. 칩, 주소의 ?q=, 페이지 안 검색창으로 검색할 때는 칸에 초점이 없어 그대로 맞춘다.
    // 자리가 없는 옛 헤더이면 건너뛴다(동기화는 JS를 템플릿보다 먼저 보낸다).
    const syncHeaderSearch = (text) => {
        const headerSearch = document.getElementById('header-search-input');
        if (headerSearch && document.activeElement !== headerSearch) headerSearch.value = text;
    };

    // 검색 페이지: 검색어로 결과를 정하고 1쪽을 그린다. 검색 상자, 인기 검색어 칩, 주소의 ?q=가 모두 이 함수를 부른다.
    // 새 검색은 늘 관련도순에서 시작한다. 결과 영역은 결과가 0개여도 열고, 머리(제목·개수·정렬)와 결과 끝 줄, 결과 없음 문장과 요청 카드 중 하나를 보인다.
    // 상품 목록을 받는 동안은 찾지 않고 '찾는 중' 줄을 보였다가 목록이 오면 다시 부른다. 목록을 받지 못했으면 찾을 목록이 없으니
    // 결과 없음 대신 '불러오지 못함' 줄을 보인다. 검색어에 iHerb 링크가 있으면 목록과 상관없이 링크 카드를 보인다(showLinkCard).
    const showSearchResults = (query) => {
        // 제목에는 입력값에서 앞뒤 공백만 뗀 글자를 그대로 보인다. 소문자로 바꾸는 것은 찾을 때만이다.
        const typedQuery = query.trim();
        // 검색어는 글자로만 넣는다(HTML로 읽지 않는다).
        document.querySelectorAll('[data-search-query]').forEach((node) => {
            node.textContent = typedQuery;
        });
        syncHeaderSearch(typedQuery);

        const link = window.BLIME_PRODUCT_REQUEST?.findIherbUrl(typedQuery);
        if (link && showLinkCard(link)) return;

        if (productsStatus === 'loading') {
            pendingSearch = () => showSearchResults(typedQuery);
            showSearchState('loading');
            return;
        }
        if (productsStatus === 'failed') {
            showSearchState('load-error');
            return;
        }

        rankedProducts = filterAndRankProducts(allProducts, typedQuery.toLowerCase());
        filteredProducts = rankedProducts;
        currentPage = 1;

        const sortSelect = document.querySelector('[data-search-sort]');
        const count = document.querySelector('[data-search-count]');

        if (sortSelect) sortSelect.value = 'relevance';
        if (count) count.textContent = filteredProducts.length.toLocaleString('ko-KR');
        showSearchState(filteredProducts.length > 0 ? 'results' : 'no-results');
        renderProducts();
        updatePagination();
    };

    // 검색 페이지에 검색어가 없을 때(주소에 ?q=가 없이 열거나, 검색어를 지우고 검색하거나, 목록이 왔는데 기다리던 검색도 링크 카드도 없을 때):
    // 전체 상품을 기본순(상품 인덱스의 순서)으로 1쪽부터 그린다. 지난 정렬은 기억하지 않는다(정렬은 주소에도 남기지 않는다). 머리의 개수는 빌드 때
    // 상품 수라 손대지 않는다. 상품 목록을 받는 동안은 '불러오는 중' 줄, 받지 못했으면(카드를 그릴 cards.js가 없을 때도) 검색과 같은 '불러오지 못함'
    // 줄이다. 받는 동안 줄은 목록이 오면 여기로 다시 와서 목록이 된다(loadProducts 뒤). 헤더 검색창은 비운다(초점이 있으면 그대로 둔다).
    const showBrowse = () => {
        if (!isSearchPage()) return;
        syncHeaderSearch('');

        if (productsStatus === 'loading') {
            showSearchState('browse-loading');
            return;
        }
        if (productsStatus === 'failed') {
            showSearchState('load-error');
            return;
        }

        const sortSelect = document.querySelector('[data-search-browse-sort]');
        if (sortSelect) sortSelect.value = 'default';
        filteredProducts = [...allProducts];
        currentPage = 1;
        showSearchState('browse');
        renderProducts();
        updatePagination();
    };

    // Search Functionality with Synonym Support
    const initSearch = () => {
        const searchInput = document.querySelector('.search-input');
        const searchButton = document.querySelector('.search-button');

        const performSearch = () => {
            // 제목에는 친 그대로(앞뒤 공백만 뗀) 보이고, 찾을 때만 소문자를 쓴다(showSearchResults).
            const typedQuery = searchInput?.value.trim() || '';

            // 검색 시 filter-chip 선택 해제
            const filterChips = document.querySelectorAll('.filter-chip');
            filterChips.forEach(chip => chip.classList.remove('active'));

            if (typedQuery === '') {
                // 상품 목록을 받기 전에 건 검색도 지운다. 목록이 와도 다시 그리지 않고 전체 상품을 그린다.
                pendingSearch = null;
                showBrowse();
                return;
            }
            showSearchResults(typedQuery);
        };

        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        searchButton?.addEventListener('click', performSearch);

        // Search input animation
        searchInput?.addEventListener('focus', () => {
            searchInput.parentElement.classList.add('focused');
        });

        searchInput?.addEventListener('blur', () => {
            searchInput.parentElement.classList.remove('focused');
        });
    };

    // 검색 페이지의 정렬 칸: 보관한 순위 결과를 고른 순서로 다시 정렬해 1쪽부터 그린다.
    // 전체 상품의 정렬 칸(검색어가 없을 때)은 상품 목록 전체를 고른 순서로 정렬해 1쪽부터 그린다. 기본순(default)은 상품 인덱스의 순서다.
    // 정렬은 주소에 남기지 않는다. 옛 search.html에는 전체 상품의 정렬 칸이 없어 건너뛴다.
    const initSearchSort = () => {
        const sortSelect = document.querySelector('[data-search-sort]');

        sortSelect?.addEventListener('change', () => {
            filteredProducts = sortProducts(rankedProducts, sortSelect.value);
            currentPage = 1;
            renderProducts();
            updatePagination();
        });

        const browseSortSelect = document.querySelector('[data-search-browse-sort]');

        browseSortSelect?.addEventListener('change', () => {
            filteredProducts = sortProducts(allProducts, browseSortSelect.value);
            currentPage = 1;
            renderProducts();
            updatePagination();
        });
    };

    // Category Filter
    const initFilters = () => {
        const filterChips = document.querySelectorAll('.filter-chip');
        const searchInput = document.querySelector('.search-input');

        filterChips.forEach(chip => {
            chip.addEventListener('click', () => {
                // Update active state
                filterChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');

                // Get category
                const category = chip.textContent.trim();
                if (searchInput) {
                    searchInput.value = category;
                }

                showSearchResults(category);
            });
        });
    };

    // 휴대폰의 한 줄 인기 검색어(768px 이하, 가로 스크롤)에서 일부만 보이는 칩에 키보드 초점이 오면 줄만 가로로 밀어 칩을 다 보이게 한다.
    // 칩은 줄 끝이 아니라 안쪽 여백(16px) 안까지 들인다. 초점 테두리가 칩 밖 4px까지 나가는데 스크롤 상자는 그 밖을 자르기 때문이다.
    // Chromium은 반쯤 보이는 칩에 초점이 와도 줄을 밀지 않는다. scrollIntoView는 페이지까지 위아래로 움직여 쓰지 않는다.
    // 마우스·터치로 누를 때(:focus-visible이 아님)는 밀지 않는다. 누르는 순간 줄이 밀리면 손을 떼는 자리가 칩 밖이 되어 클릭이 사라진다.
    const initChipRowFocus = () => {
        const row = document.querySelector('.mobile-search-filters');
        if (!row) return;

        row.addEventListener('focusin', (event) => {
            const chip = event.target.closest?.('.filter-chip');
            if (!chip || !chip.matches(':focus-visible') || row.scrollWidth <= row.clientWidth) return;

            const style = getComputedStyle(row);
            const box = row.getBoundingClientRect();
            const chipBox = chip.getBoundingClientRect();
            const left = box.left + parseFloat(style.paddingLeft);
            const right = box.right - parseFloat(style.paddingRight);
            if (chipBox.left < left) row.scrollLeft -= left - chipBox.left;
            else if (chipBox.right > right) row.scrollLeft += chipBox.right - right;
        });
    };

    // 옛 카드가 사라지는 0.3초 안에 목록을 다시 바꾸면(정렬 칸을 방향키로 넘길 때 등) 앞 요청이 예약한 새 카드를 취소한다.
    // 취소하지 않으면 새 카드가 두 벌 붙는다.
    let pendingRender;

    // Pagination
    const renderProducts = () => {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        clearTimeout(pendingRender);

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const productsToShow = filteredProducts.slice(start, end);

        // Clear current products
        const existingCards = grid.querySelectorAll('.product-card');
        if (existingCards.length > 0) {
            existingCards.forEach(card => {
                card.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => card.remove(), 300);
            });

            // Render new products with animation after removal
            pendingRender = setTimeout(() => {
                productsToShow.forEach((product, index) => {
                    const card = createProductCard(product);
                    card.style.animation = `fadeIn 0.3s ease ${index * 0.05}s both`;
                    grid.appendChild(card);
                });
            }, 300);
        } else {
            // If no existing cards, render immediately
            productsToShow.forEach((product, index) => {
                const card = createProductCard(product);
                card.style.animation = `fadeIn 0.3s ease ${index * 0.05}s both`;
                grid.appendChild(card);
            });
        }
    };

    // 카드 모양은 cards.js가 페이지의 <template>으로 만든다. 쿠팡 비교 페이지(body[data-page="compare"])는 비교 카드(compareCard), 나머지는
    // 상품 카드(productCard)다. cards.js를 받지 못했거나 캐시에 남은 옛 cards.js라 그 함수가 없으면 null이다.
    const cardDrawer = () => {
        const cards = window.BLIME_CARDS;
        const draw = bodyPage() === 'compare' ? cards?.compareCard : cards?.productCard;
        return typeof draw === 'function' ? draw : null;
    };
    const createProductCard = (product) => cardDrawer()(product);

    const updatePagination = () => {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;

        const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
        pagination.innerHTML = '';
        if (totalPages === 0) return;

        const goToPage = (page) => {
            currentPage = page;
            renderProducts();
            updatePagination();
            scrollToProducts();
        };

        const showPageJumpFlash = (wrapper, message) => {
            const flash = wrapper.querySelector('.page-jump-flash');
            flash.textContent = message;
            wrapper.classList.add('invalid');
            flash.classList.remove('show');

            window.requestAnimationFrame(() => {
                flash.classList.add('show');
            });

            clearTimeout(wrapper.pageJumpFlashTimer);
            wrapper.pageJumpFlashTimer = setTimeout(() => {
                flash.classList.remove('show');
                wrapper.classList.remove('invalid');
            }, 1800);
        };

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.innerHTML = '←';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                goToPage(currentPage - 1);
            }
        });
        pagination.appendChild(prevBtn);

        // Page numbers
        const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
        const endPage = Math.min(totalPages, startPage + 4);

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.classList.toggle('active', i === currentPage);
            pageBtn.addEventListener('click', () => {
                goToPage(i);
            });
            pagination.appendChild(pageBtn);
        }

        // Direct page jump
        const pageJump = document.createElement('div');
        pageJump.className = 'page-jump';
        pageJump.innerHTML = `
            <label class="sr-only" for="pageJumpInput">페이지 번호 입력</label>
            <input id="pageJumpInput" class="page-jump-input" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="페이지" autocomplete="off" aria-describedby="pageJumpFlash">
            <span id="pageJumpFlash" class="page-jump-flash" role="status" aria-live="polite"></span>
        `;
        const pageJumpInput = pageJump.querySelector('.page-jump-input');
        pageJumpInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;

            event.preventDefault();
            const rawValue = pageJumpInput.value.trim();
            const targetPage = Number(rawValue);

            if (!/^\d+$/.test(rawValue) || !Number.isInteger(targetPage)) {
                showPageJumpFlash(pageJump, '숫자를 입력하세요');
                return;
            }

            if (targetPage < 1 || targetPage > totalPages) {
                showPageJumpFlash(pageJump, `1~${totalPages} 사이 숫자를 입력하세요`);
                return;
            }

            pageJumpInput.value = '';
            goToPage(targetPage);
        });
        pagination.appendChild(pageJump);

        // Page info
        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${currentPage} / ${totalPages}`;
        pagination.appendChild(pageInfo);

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.innerHTML = '→';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                goToPage(currentPage + 1);
            }
        });
        pagination.appendChild(nextBtn);
    };

    // 쪽을 바꾸면 새 쪽의 목록이 보이는 자리로 올라간다. 가격 내림·쿠팡 비교는 .all-products-section이고,
    // 검색 페이지에는 그 구역이 없어 결과 영역(data-search-results)이다(옛 search.html에도 있다).
    const scrollToProducts = () => {
        const productsSection = document.querySelector('.all-products-section') || document.querySelector('[data-search-results]');
        if (productsSection) {
            productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // --- 구분 목록 모드 -----------------------------------------------------------------------------------
    // 가격 내림 페이지(deals/, price-drops/)는 구분(전체·할인 중·정가 하락)마다, 쿠팡 비교 페이지(compare/)는 구분(쿠팡이 더 쌈·iHerb가 더 쌈)과
    // 가격 기준마다 목록이 하나씩 있다. 서버는 목록 전부를 카드 값으로 싣고(<script id="page-lists">, {"lists": {목록 이름: [카드 값...]},
    // "initial": 처음 구분}, view_models/products.py의 page_lists_json) 처음 구분의 앞 24개만 그린다. 구분 전환과 쪽 나누기는 이 스크립트가 한다.
    // 상품 인덱스는 받지 않는다.
    //   구분 버튼  button.benefit-segment[data-list-key][aria-pressed]: 누르면 그 구분의 목록으로 바꾸고 1쪽부터 다시 그린다.
    //   빈 안내    [data-list-empty="목록 이름 | 기준 접두사 + none"]: 마크업에서 숨긴 채 시작한다. 지금 목록이 비면 그 목록의 안내를, 지금 기준의
    //              모든 구분이 비면 none(적용가 기준은 code:none)을 보이고 목록 구역(.all-products-section)은 숨긴다. 안내 안의
    //              '… N개 보기 →'도 [data-list-key]라 구분 버튼과 같은 처리기로 구분을 바꾼다.
    //   가격 기준  쿠팡 비교 페이지는 할인코드 적용 전(목록 이름 coupang·iherb)과 적용가(code:coupang·code:iherb, 운영값이 있는 사이트만) 두 기준을
    //              싣는다. <html data-iherb-code="on">(가격 보기 설정이 켜짐)이고 적용가 목록이 있으면 적용가 목록을 쓴다. 서버는 기준마다 첫 쪽을
    //              한 벌씩 그려 두었다(CSS가 한쪽만 보인다). 처음 그릴 때 둘 다 지우고 고른 기준 하나만 그리며, 설정이 바뀌면(price_view.js의
    //              blime:iherb-code-changed) 지금 구분의 그 기준 목록을 1쪽부터 다시 그린다. 가격 내림처럼 적용가 목록이 없는 페이지는 늘 기본이다.
    // 페이지에 page-lists가 없으면 이 모드를 쓰지 않는다(initListMode가 false를 돌려준다). 그때는 검색 페이지만 일하고, 다른 페이지(동기화 틈의 옛 홈 등)에서는 아무것도 하지 않는다.
    const CODE_PREFIX = 'code:';
    let pageLists = null;
    let currentListKey = '';
    // 지금 가격 기준의 접두사: 적용가는 'code:', 기본은 ''.
    let currentPrefix = '';

    // 구분 key가 가리키는 목록의 이름. 구분 이름 앞에 지금 기준의 접두사를 붙인다. 가격 내림은 접두사가 늘 ''라 구분 이름이 곧 목록 이름이다.
    const listNameOf = (key) => `${currentPrefix}${key}`;
    const listItemsOf = (key) => pageLists.lists[listNameOf(key)] ?? [];
    const segmentButtons = () => Array.from(document.querySelectorAll('[data-list-key][aria-pressed]'));

    // 가격 보기 설정이 켜져 있고 페이지에 적용가 목록이 있으면 'code:', 아니면 ''이다.
    const basisPrefix = () => {
        const codeView = document.documentElement.getAttribute('data-iherb-code') === 'on';
        const hasCodeLists = Object.keys(pageLists.lists).some((name) => name.startsWith(CODE_PREFIX));
        return codeView && hasCodeLists ? CODE_PREFIX : '';
    };

    // 지금 구분이 비었을 때 보일 빈 안내의 표식. 지금 기준의 모든 구분이 비면 접두사 + 'none', 지금 목록만 비면 그 목록 이름, 비어 있지 않으면 ''이다.
    const emptyNoticeKey = (key) => {
        const keys = segmentButtons().map((button) => button.dataset.listKey);
        if (keys.length > 0 && keys.every((segmentKey) => listItemsOf(segmentKey).length === 0)) return `${currentPrefix}none`;
        return listItemsOf(key).length === 0 ? listNameOf(key) : '';
    };

    // 구분 버튼의 눌림, 보일 빈 안내, 목록 구역의 보임을 지금 구분에 맞춘다.
    const syncListControls = () => {
        segmentButtons().forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.listKey === currentListKey));
        });
        const noticeKey = emptyNoticeKey(currentListKey);
        document.querySelectorAll('[data-list-empty]').forEach((notice) => {
            notice.hidden = notice.dataset.listEmpty !== noticeKey;
        });
        // 빈 안내가 서면 격자와 쪽 번호가 든 구역은 숨긴다. 빈 쪽 번호 줄도 위 여백(48px)을 가져서 안내 상자 위에 빈틈이 생긴다.
        const list = document.getElementById('products-grid')?.closest('.all-products-section');
        if (list) list.hidden = noticeKey !== '';
    };

    // 구분을 바꿔 1쪽부터 다시 그린다. 바꿨으면 true, 이미 그 구분이거나 없는 구분이면 false다.
    const selectList = (key) => {
        if (key === currentListKey || !(listNameOf(key) in pageLists.lists)) return false;
        currentListKey = key;
        filteredProducts = listItemsOf(key);
        currentPage = 1;
        renderProducts();
        updatePagination();
        syncListControls();
        return true;
    };

    const handleListKeyClick = (event) => {
        const trigger = event.target.closest('[data-list-key]');
        if (!trigger) return;
        const key = trigger.dataset.listKey;
        if (!selectList(key)) return;
        // 빈 안내 안의 단추는 구분을 바꾸는 순간 숨는다. 초점이 사라지지 않게 고른 구분 버튼이 받는다.
        if (!trigger.hasAttribute('aria-pressed')) {
            segmentButtons().find((button) => button.dataset.listKey === key)?.focus();
        }
    };

    // 가격 보기 설정이 바뀌었다(price_view.js의 blime:iherb-code-changed). 기준이 바뀌었으면 지금 구분의 그 기준 목록을 1쪽부터 다시 그린다.
    // 카드를 그릴 수 없으면(cards.js가 없거나 compareCard가 없는 옛 cards.js) 서버가 그린 두 벌을 CSS가 고르므로 빈 안내와 목록 구역만 맞춘다.
    // 적용가 목록이 없는 페이지(가격 내림)는 기준이 바뀌지 않아 아무것도 하지 않는다.
    const handleBasisChange = () => {
        const prefix = basisPrefix();
        if (prefix === currentPrefix) return;
        currentPrefix = prefix;
        filteredProducts = listItemsOf(currentListKey);
        currentPage = 1;
        if (cardDrawer()) {
            renderProducts();
            updatePagination();
        }
        syncListControls();
    };

    // 구분 목록 모드면 true를 돌려주고, 이 페이지는 상품 인덱스를 받지 않는다(서버가 실은 목록이 전부다). 아니면 false다.
    const initListMode = () => {
        const script = document.getElementById('page-lists');
        if (!script) return false;

        let data = null;
        try {
            data = JSON.parse(script.textContent);
        } catch (error) {
            console.error('Error reading page lists:', error);
        }
        const readable = data && typeof data.lists === 'object' && data.lists !== null && data.initial in data.lists;
        if (!readable) {
            // 목록을 읽지 못하면 서버가 그린 첫 쪽을 그대로 둔다. 상품 인덱스로 돌아가지 않는다(가격이 내리지 않은 상품까지 보인다).
            productsStatus = 'failed';
            return true;
        }

        pageLists = data;
        // 기준은 머리 조각(partials/iherb_code_head.html)이 스타일시트보다 먼저 붙인 표시로 고른다. 설정을 켠 사람은 처음부터 적용가 목록이다.
        currentPrefix = basisPrefix();
        currentListKey = data.initial;
        filteredProducts = listItemsOf(currentListKey);
        productsStatus = 'ready';
        syncListControls();
        window.addEventListener('blime:iherb-code-changed', handleBasisChange);

        // 카드는 cards.js가 그린다. 그 스크립트가 없거나(받지 못했을 때 등) 이 페이지의 카드를 그리는 함수가 없으면(캐시에 남은 옛 cards.js에는
        // compareCard가 없다) 서버가 그린 첫 쪽을 그대로 두고 구분 버튼은 일하지 않는다.
        if (!cardDrawer()) {
            console.warn('cards.js cannot draw the cards of this page; keeping the server-rendered cards');
            return true;
        }
        document.addEventListener('click', handleListKeyClick);
        // 서버가 그린 첫 쪽(쿠팡 비교는 기준마다 한 벌씩 두 벌)을 지우고 고른 기준의 목록만 그린다.
        const grid = document.getElementById('products-grid');
        if (grid) grid.innerHTML = '';
        renderProducts();
        updatePagination();
        return true;
    };

    // 검색 페이지의 상품 목록(products_index.json)을 받는다. 받았으면 true, 받지 못했으면(목록이 빈다) false다.
    // 10초 안에 다 받지 못하면(응답이 멈춘 망) 받기를 끊고 받지 못한 것으로 본다(load_limit.js). 그러면 받는 동안의 줄이 '불러오지 못함' 줄로
    // 바뀐다. 끊긴 요청의 늦은 응답은 페이지에 닿지 않는다.
    const loadProducts = async () => {
        const grid = document.getElementById('products-grid');
        if (!grid) return false;

        try {
            const products = await loadLimit().fetchJson(getProductsIndexUrl());
            if (!Array.isArray(products)) {
                throw new Error('products_index.json must be an array');
            }
            allProducts = products;
            filteredProducts = [...allProducts];
            return true;
        } catch (error) {
            console.error('Error loading products:', error);
            allProducts = [];
            filteredProducts = [];
            return false;
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        // 구분 목록 모드의 페이지(가격 내림, 쿠팡 비교)는 상품 목록을 받을 일이 없다. 서버가 실은 구분별 목록이 전부다.
        if (initListMode()) return;
        // 그 밖에는 검색 페이지만 맡는다. 다른 페이지(동기화가 JS를 템플릿보다 먼저 보낼 때 만나는 옛 홈 등)에서는 상품 인덱스를 받지 않고
        // 검색 상자·칩·버튼에 아무것도 걸지 않는다. 서버가 그린 카드는 그대로 남는다.
        if (!isSearchPage()) return;

        initSearch();
        initSearchSort();
        initFilters();
        initChipRowFocus();

        // 주소의 ?q=는 상품 목록을 기다리지 않고 입력창에 넣어 검색을 건다. 목록이 오기 전이라 '찾는 중' 줄이 서고, 목록이 오면 결과가 나온다.
        // 검색 페이지를 ?q= 없이 열면 전체 상품이다. 목록이 오기 전이라 '불러오는 중' 줄이 서고, 목록이 오면 전체 상품이 나온다.
        const initialSearchQuery = searchQueryFromLocation();
        if (initialSearchQuery) {
            const searchInput = document.querySelector('.search-input');
            if (searchInput) {
                searchInput.value = initialSearchQuery;
            }
            showSearchResults(initialSearchQuery);
        } else {
            showBrowse();
        }

        // 상품을 읽는다. 목록을 기다리던 검색이 있으면 그 검색을 그리고, 없으면 전체 상품을(받지 못했으면 '불러오지 못함' 줄) 그린다.
        loadProducts().then((loaded) => {
            // 카드는 cards.js가 그린다. 그 스크립트가 없으면(받지 못했을 때 등) 그릴 카드가 없으니 상품 목록을 받지 못했을 때처럼
            // '불러오지 못함' 줄을 보인다.
            const canDrawCards = Boolean(window.BLIME_CARDS);
            if (!canDrawCards) {
                console.warn('cards.js is missing; the product list cannot be drawn');
            }
            productsStatus = loaded && canDrawCards ? 'ready' : 'failed';

            const search = pendingSearch;
            pendingSearch = null;
            if (search) {
                search();
                return;
            }

            // 링크 카드는 상품 목록과 상관이 없다. 목록이 오거나 받지 못해도 링크 카드를 그대로 둔다.
            if (searchShell()?.dataset.searchState === 'link') return;
            // 기다리던 검색이 없다: 처음부터 검색어가 없었거나, 받기 전에 검색어를 지웠다. 받는 동안 줄을 전체 상품(받지 못했으면 '불러오지 못함')으로 바꾼다.
            showBrowse();
        });
    });
})();
