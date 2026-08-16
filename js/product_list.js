// 상품 목록: 검색, 필터 칩, 페이지 나누기, 보기 전환. 홈, 할인, 정가 하락, 검색 페이지가 싣는다.
// 카드는 cards.js(window.BLIME_CARDS)가 그리고, 검색 점수는 search.js(window.BLIME_SEARCH)가 매긴다.
(() => {
    let currentPage = 1;
    const itemsPerPage = 24;
    let allProducts = [];
    let filteredProducts = [];

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
            const query = searchInput?.value.toLowerCase().trim() || '';
            const hotDealsSection = document.querySelector('.hot-deals-section');

            // 검색 시 filter-chip 선택 해제
            const filterChips = document.querySelectorAll('.filter-chip');
            filterChips.forEach(chip => chip.classList.remove('active'));

            if (query === '') {
                if (isSearchPage()) {
                    filteredProducts = [];
                    currentPage = 1;
                    setSearchPageResultsVisible(false);
                    return;
                }
                filteredProducts = [...allProducts];
                // Show hot deals section when search is empty
                if (hotDealsSection) {
                    hotDealsSection.style.display = 'block';
                }
            } else {
                filteredProducts = filterAndRankProducts(allProducts, query);
                setSearchPageResultsVisible(true);
                // Hide hot deals section when searching
                if (hotDealsSection) {
                    hotDealsSection.style.display = 'none';
                }
            }

            currentPage = 1;
            renderProducts();
            updatePagination();
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

                // Filter products
                const hotDealsSection = document.querySelector('.hot-deals-section');

                filteredProducts = filterAndRankProducts(allProducts, category);
                setSearchPageResultsVisible(true);
                // Hide hot deals section when filtering
                if (hotDealsSection) {
                    hotDealsSection.style.display = 'none';
                }

                currentPage = 1;
                renderProducts();
                updatePagination();
            });
        });
    };

    // Pagination
    const renderProducts = () => {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

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
            setTimeout(() => {
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

    const scrollToProducts = () => {
        const productsSection = document.querySelector('.all-products-section');
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
        initFilters();
        initViewToggle();
        initSmoothScroll();

        // 상품을 읽고 첫 페이지를 그린다.
        loadProducts().then((loaded) => {
            if (!loaded) return;
            const grid = document.getElementById('products-grid');
            if (!grid) return;
            // 카드는 cards.js가 그린다. 그 스크립트가 없으면(받지 못했을 때 등) 목록을 비우지 않고 서버가 그린 카드를 그대로 둔다.
            if (!window.BLIME_CARDS) {
                console.warn('cards.js is missing; keeping the server-rendered cards');
                return;
            }

            grid.innerHTML = '';
            const initialSearchQuery = searchQueryFromLocation();
            if (isSearchPage()) {
                if (initialSearchQuery) {
                    const searchInput = document.querySelector('.search-input');
                    if (searchInput) {
                        searchInput.value = initialSearchQuery;
                    }
                    filteredProducts = filterAndRankProducts(allProducts, initialSearchQuery.toLowerCase());
                    currentPage = 1;
                    setSearchPageResultsVisible(true);
                    renderProducts();
                    updatePagination();
                    return;
                }

                filteredProducts = [];
                setSearchPageResultsVisible(false);
                return;
            }

            renderProducts();
            updatePagination();
        });
    });
})();
