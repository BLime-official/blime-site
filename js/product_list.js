// 상품 목록: 검색, 필터 칩, 페이지 나누기, 보기 전환. 홈, 할인, 정가 하락, 검색 페이지가 싣는다.
// 검색 페이지는 결과 머리(검색어와 개수), 가격 정렬, 결과 없음 문장, 상품 목록을 받는 동안·받지 못했을 때의 줄도 맡는다.
// 카드는 cards.js(window.BLIME_CARDS)가 그리고, 검색 점수는 search.js(window.BLIME_SEARCH)가 매긴다.
(() => {
    let currentPage = 1;
    const itemsPerPage = 24;
    let allProducts = [];
    let filteredProducts = [];
    // 검색 페이지에서 순위(관련도순)로 정한 결과. 정렬을 바꿀 때마다 이 목록에서 다시 정렬하므로, 가격순에서 관련도순으로 돌아오면 처음 순위가 그대로 나온다.
    let rankedProducts = [];
    // 상품 목록(홈·검색은 products_index.json)을 받는 동안은 'loading', 받았으면 'ready', 받지 못했으면 'failed'다.
    // 받기 전에 들어온 검색은 빈 목록으로 찾지 않는다. 마지막 하나만 pendingSearch에 두었다가 목록이 오면 한다.
    let productsStatus = 'loading';
    let pendingSearch = null;

    const runWhenProductsReady = (search) => {
        if (productsStatus === 'loading') {
            pendingSearch = search;
            return;
        }
        search();
    };

    // 페이지는 body에 자기 종류(data-page)와 사이트 루트까지의 상대 경로(data-site-root)를 적어 둔다.
    // 주소를 보고 페이지나 경로를 추측하지 않는다.
    const bodyPage = () => document.body?.dataset.page || '';
    const siteRoot = () => document.body?.dataset.siteRoot ?? '';
    const isSearchPage = () => bodyPage() === 'search';
    // 할인·정가 하락 페이지는 서버가 고르고 정렬한 목록(page-products)이 전부다. 상품 인덱스를 받지 않는다.
    const listsOnlyPageProducts = () => ['deals', 'price-drops'].includes(bodyPage());

    const getProductsIndexUrl = () => `${siteRoot()}products_index.json`;

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

    const setSearchPageResultsVisible = (isVisible) => {
        if (!isSearchPage()) return;

        const emptyState = document.querySelector('[data-search-empty-state]');
        const results = document.querySelector('[data-search-results]');
        const grid = document.getElementById('products-grid');
        const pagination = document.getElementById('pagination');

        if (emptyState) emptyState.hidden = isVisible;
        if (results) results.hidden = !isVisible;
        if (!isVisible) {
            if (grid) grid.innerHTML = '';
            if (pagination) pagination.innerHTML = '';
        }
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

    // 검색 페이지 결과 영역의 줄들. 결과 영역을 열고 이 가운데 하나만 보인다. 넷 다 마크업에서 숨긴 채 시작한다
    // (옛 스크립트가 빈 머리나 다른 줄을 보이지 않게). 자리가 없는 옛 search.html이면 그 줄만 건너뛴다(동기화는 JS를 템플릿보다 먼저 보낸다).
    const SEARCH_STATE_LINES = {
        results: '[data-search-head]',
        'no-results': '[data-search-no-results]',
        loading: '[data-search-loading]',
        'load-error': '[data-search-load-error]',
    };

    const showSearchState = (state) => {
        Object.entries(SEARCH_STATE_LINES).forEach(([name, selector]) => {
            const line = document.querySelector(selector);
            if (line) line.hidden = name !== state;
        });
        setSearchPageResultsVisible(true);
    };

    // 검색 페이지: 검색어로 결과를 정하고 1쪽을 그린다. 검색 상자, 인기 검색어 칩, 주소의 ?q=가 모두 이 함수를 부른다.
    // 새 검색은 늘 관련도순에서 시작한다. 결과 영역은 결과가 0개여도 열고, 머리(제목·개수·정렬)와 결과 없음 문장 중 하나를 보인다.
    // 상품 목록을 받는 동안은 찾지 않고 '찾는 중' 줄을 보였다가 목록이 오면 다시 부른다. 목록을 받지 못했으면 찾을 목록이 없으니
    // 결과 없음 대신 '불러오지 못함' 줄을 보인다.
    const showSearchResults = (query) => {
        // 제목에는 입력값에서 앞뒤 공백만 뗀 글자를 그대로 보인다. 소문자로 바꾸는 것은 찾을 때만이다.
        const typedQuery = query.trim();
        // 검색어는 글자로만 넣는다(HTML로 읽지 않는다).
        document.querySelectorAll('[data-search-query]').forEach((node) => {
            node.textContent = typedQuery;
        });

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

    // 서버가 그린 목록(홈의 첫 상품들, 할인, 정가 하락)은 같은 상품의 카드 값을 JSON으로도 싣는다
    // (<script id="page-products">, app/site_builder/view_models/products.py). 할인·정가 하락 페이지는 이 목록으로 페이지를
    // 나누고, 홈은 상품 인덱스를 못 읽었을 때 이 목록으로 검색한다.
    const readPageProducts = () => {
        const script = document.getElementById('page-products');
        if (!script) return [];
        try {
            const products = JSON.parse(script.textContent);
            return Array.isArray(products) ? products : [];
        } catch (error) {
            console.error('Error reading page products:', error);
            return [];
        }
    };

    // Search Functionality with Synonym Support
    const initSearch = () => {
        const searchInput = document.querySelector('.search-input');
        const searchButton = document.querySelector('.search-button');

        const performSearch = () => {
            // 검색 페이지의 제목에는 친 그대로(앞뒤 공백만 뗀) 보이고, 찾을 때만 소문자를 쓴다.
            const typedQuery = searchInput?.value.trim() || '';
            const query = typedQuery.toLowerCase();
            const hotDealsSection = document.querySelector('.hot-deals-section');

            // 검색 시 filter-chip 선택 해제
            const filterChips = document.querySelectorAll('.filter-chip');
            filterChips.forEach(chip => chip.classList.remove('active'));

            if (isSearchPage()) {
                if (query === '') {
                    // 상품 목록을 받기 전에 건 검색도 지운다. 목록이 와도 다시 그리지 않는다.
                    pendingSearch = null;
                    filteredProducts = [];
                    currentPage = 1;
                    setSearchPageResultsVisible(false);
                    return;
                }
                showSearchResults(typedQuery);
                return;
            }

            // 홈은 상품 목록을 받은 뒤에 거른다. 그동안 서버가 그린 카드를 그대로 둔다.
            runWhenProductsReady(() => {
                if (query === '') {
                    filteredProducts = [...allProducts];
                    // Show hot deals section when search is empty
                    if (hotDealsSection) {
                        hotDealsSection.style.display = 'block';
                    }
                } else {
                    filteredProducts = filterAndRankProducts(allProducts, query);
                    // Hide hot deals section when searching
                    if (hotDealsSection) {
                        hotDealsSection.style.display = 'none';
                    }
                }

                currentPage = 1;
                renderProducts();
                updatePagination();
            });
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
    const initSearchSort = () => {
        const sortSelect = document.querySelector('[data-search-sort]');

        sortSelect?.addEventListener('change', () => {
            filteredProducts = sortProducts(rankedProducts, sortSelect.value);
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

                if (isSearchPage()) {
                    showSearchResults(category);
                    return;
                }

                // 홈은 상품 목록을 받은 뒤에 거른다. 그동안 서버가 그린 카드를 그대로 둔다.
                runWhenProductsReady(() => {
                    // Filter products
                    const hotDealsSection = document.querySelector('.hot-deals-section');

                    filteredProducts = filterAndRankProducts(allProducts, category);
                    // Hide hot deals section when filtering
                    if (hotDealsSection) {
                        hotDealsSection.style.display = 'none';
                    }

                    currentPage = 1;
                    renderProducts();
                    updatePagination();
                });
            });
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

    // 카드 모양은 cards.js가 페이지의 <template>으로 만든다.
    const createProductCard = (product) => window.BLIME_CARDS.productCard(product);

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

    // 쪽을 바꾸면 새 쪽의 목록이 보이는 자리로 올라간다. 홈·할인·정가 하락은 .all-products-section이고,
    // 검색 페이지에는 그 구역이 없어 결과 영역(data-search-results)이다(옛 search.html에도 있다).
    const scrollToProducts = () => {
        const productsSection = document.querySelector('.all-products-section') || document.querySelector('[data-search-results]');
        if (productsSection) {
            productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // View Toggle
    const initViewToggle = () => {
        const viewOptions = document.querySelectorAll('.view-option');
        const grid = document.getElementById('products-grid');

        viewOptions.forEach(option => {
            option.addEventListener('click', () => {
                viewOptions.forEach(o => o.classList.remove('active'));
                option.classList.add('active');

                const view = option.dataset.view;
                if (view === 'list') {
                    grid?.classList.add('list-view');
                } else {
                    grid?.classList.remove('list-view');
                }
            });
        });
    };

    // 페이지 안 링크(#…)는 주소를 바꾸지 않고 부드럽게 스크롤한다. 지금 이런 링크는 홈의 로고·하단 탭 홈(#home)뿐이고,
    // 누르면 홈 맨 위(히어로 섹션)로 올라간다.
    const initSmoothScroll = () => {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    };

    // Load Products Data
    const loadProducts = async () => {
        const grid = document.getElementById('products-grid');
        if (!grid) return false;
        const pageProducts = readPageProducts();

        if (listsOnlyPageProducts()) {
            allProducts = pageProducts;
            filteredProducts = [...allProducts];
            return true;
        }

        try {
            const response = await fetch(getProductsIndexUrl());
            if (!response.ok) {
                throw new Error(`products_index.json ${response.status}`);
            }
            const products = await response.json();
            if (!Array.isArray(products)) {
                throw new Error('products_index.json must be an array');
            }
            allProducts = products;
            filteredProducts = [...allProducts];
            return true;
        } catch (error) {
            console.error('Error loading products:', error);
            allProducts = pageProducts;
            filteredProducts = [...allProducts];
            return false;
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        initSearch();
        initSearchSort();
        initFilters();
        initViewToggle();
        initSmoothScroll();

        // 주소의 ?q=는 상품 목록을 기다리지 않고 입력창에 넣어 검색을 건다. 목록이 오기 전이라 '찾는 중' 줄이 서고, 목록이 오면 결과가 나온다.
        const initialSearchQuery = searchQueryFromLocation();
        if (initialSearchQuery) {
            const searchInput = document.querySelector('.search-input');
            if (searchInput) {
                searchInput.value = initialSearchQuery;
            }
            showSearchResults(initialSearchQuery);
        }

        // 상품을 읽는다. 목록을 기다리던 검색이 있으면 그 검색을, 없으면 첫 페이지를 그린다.
        loadProducts().then((loaded) => {
            const grid = document.getElementById('products-grid');
            // 카드는 cards.js가 그린다. 그 스크립트가 없으면(받지 못했을 때 등) 목록을 비우지 않고 서버가 그린 카드를 그대로 둔다.
            // 검색 페이지는 그릴 카드가 없으니 상품 목록을 받지 못했을 때처럼 '불러오지 못함' 줄을 보인다.
            const canDrawCards = Boolean(window.BLIME_CARDS);
            if (grid && !canDrawCards) {
                console.warn('cards.js is missing; keeping the server-rendered cards');
            }
            productsStatus = loaded && canDrawCards ? 'ready' : 'failed';

            const search = pendingSearch;
            pendingSearch = null;
            if (search && (canDrawCards || isSearchPage())) {
                search();
                return;
            }
            if (!loaded || !grid || !canDrawCards) return;

            grid.innerHTML = '';
            if (isSearchPage()) {
                filteredProducts = [];
                setSearchPageResultsVisible(false);
                return;
            }

            renderProducts();
            updatePagination();
        });
    });
})();
