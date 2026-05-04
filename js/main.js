// Modern Price Tracker JavaScript

// Global variables
let currentPage = 1;
const itemsPerPage = 24;
let allProducts = [];
let filteredProducts = [];
let currentCategory = 'all';

const isDealsPage = () => window.location.pathname.includes('/deals/');

const getProductsIndexUrl = () => isDealsPage() ? '../products_index.json' : 'products_index.json';

const formatPrice = (price) => {
    if (price === null || price === undefined || price === '') return 'N/A';
    const number = Number(price);
    if (Number.isNaN(number)) return String(price);
    return Math.trunc(number).toLocaleString('ko-KR');
};

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const getProductDetailHref = (product) => {
    const detailPath = product.detail_path || `products/product_${product.id}.html`;
    return isDealsPage() && !detailPath.startsWith('../') ? `../${detailPath}` : detailPath;
};

const hydrateProductsFromDom = () => {
    const productCards = document.querySelectorAll('#products-grid .product-card');
    return Array.from(productCards).map((card, index) => {
        const currentPriceText = card.querySelector('.current-price')?.textContent || '0';
        const originalPriceText = card.querySelector('.original-price')?.textContent || '';
        const detailHref = card.querySelector('a[href]')?.getAttribute('href') || '';
        const normalizedDetailPath = detailHref.replace(/^\.\.\//, '');

        return {
            id: card.dataset.productId || index + 1,
            name: card.querySelector('.product-name')?.textContent?.trim() || '',
            brand: card.querySelector('.product-brand')?.textContent?.trim() || '',
            form_and_quantity: card.querySelector('.product-variant')?.textContent?.trim() || '',
            current_price: parseInt(currentPriceText.replace(/[^\d]/g, ''), 10) || 0,
            original_price: parseInt(originalPriceText.replace(/[^\d]/g, ''), 10) || null,
            availability: card.querySelector('.stock-status')?.textContent?.trim() || '',
            is_on_sale: !!card.querySelector('.sale-badge'),
            discount_percentage: parseInt(card.querySelector('.sale-badge')?.textContent?.match(/\d+/)?.[0] || '0', 10),
            image_url: card.querySelector('.product-image img')?.getAttribute('src') || '',
            unit_price_description: card.querySelector('.unit-price-text')?.textContent?.trim() || '',
            detail_path: normalizedDetailPath || `products/product_${card.dataset.productId || index + 1}.html`
        };
    });
};

// Theme Management
const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeToggle = document.querySelector('.theme-toggle');
    themeToggle?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
};

// Search Functionality with Synonym Support
const initSearch = () => {
    const searchInput = document.querySelector('.search-input');
    const searchButton = document.querySelector('.search-button');
    
    const performSearch = () => {
        const query = searchInput.value.toLowerCase().trim();
        const hotDealsSection = document.querySelector('.hot-deals-section');
        
        // 검색 시 filter-chip 선택 해제
        const filterChips = document.querySelectorAll('.filter-chip');
        filterChips.forEach(chip => chip.classList.remove('active'));
        // '전체' 칩을 활성화
        const allChip = Array.from(filterChips).find(chip => chip.textContent.trim() === '전체');
        if (allChip) {
            allChip.classList.add('active');
        }
        currentCategory = '전체';
        
        if (query === '') {
            filteredProducts = [...allProducts];
            // Show hot deals section when search is empty
            if (hotDealsSection) {
                hotDealsSection.style.display = 'block';
            }
        } else {
            // 동의어 기반 검색 사용
            filteredProducts = allProducts.filter(product => {
                const searchableText = `
                    ${product.name || ''} 
                    ${product.brand || ''} 
                    ${product.full_text || ''}
                    ${product.full_text_without_brand || ''}
                `;
                
                // searchWithSynonyms 함수가 있으면 사용, 없으면 기본 검색
                if (typeof searchWithSynonyms !== 'undefined') {
                    return searchWithSynonyms(searchableText, query);
                } else {
                    // Fallback to basic search
                    return searchableText.toLowerCase().includes(query);
                }
            });
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
    
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Update active state
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            // Get category
            const category = chip.textContent.trim();
            currentCategory = category;
            
            // Filter products
            const hotDealsSection = document.querySelector('.hot-deals-section');
            
            if (category === '전체') {
                filteredProducts = [...allProducts];
                // Show hot deals section for 'all' category
                if (hotDealsSection) {
                    hotDealsSection.style.display = 'block';
                }
            } else {
                // 카테고리(칩) 클릭 시에도 동의어 기반 검색 적용
                filteredProducts = allProducts.filter(product => {
                    const searchableText = `
                        ${product.name || ''}
                        ${product.brand || ''}
                        ${product.full_text || ''}
                        ${product.full_text_without_brand || ''}
                    `;
                    
                    // searchWithSynonyms 함수가 있으면 사용, 없으면 기본 검색
                    if (typeof searchWithSynonyms !== 'undefined') {
                        return searchWithSynonyms(searchableText, category);
                    } else {
                        // Fallback to basic search
                        return searchableText.toLowerCase().includes(category.toLowerCase());
                    }
                });
                // Hide hot deals section when filtering
                if (hotDealsSection) {
                    hotDealsSection.style.display = 'none';
                }
            }
            
            currentPage = 1;
            renderProducts();
            updatePagination();
        });
    });
};

// Product Card Click Handler
const initProductCards = () => {
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (card && !e.target.closest('a, button, .quick-view-btn')) {
            const target = card.querySelector('a[href]')?.getAttribute('href');
            if (target) {
                window.location.href = target;
            }
        }
    });
    
    // Quick view buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.quick-view-btn')) {
            e.preventDefault();
            e.stopPropagation();
            const card = e.target.closest('.product-card');
            const productId = card.dataset.productId;
            // Here you would implement quick view modal
            console.log('Quick view for product:', productId);
        }
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

const createProductCard = (product) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;
    const detailHref = getProductDetailHref(product);
    const productName = product.name || '';
    const displayName = product.name || product.full_text || '';
    
    const saleHtml = product.is_on_sale 
        ? `<div class="sale-badge">${product.discount_percentage}% ↓</div>` 
        : '';
    
    const imageHtml = product.image_url
        ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(productName)}" loading="lazy">`
        : `<div class="no-image">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>`;
    
    const priceHtml = product.is_on_sale
        ? `<span class="original-price">₩${formatPrice(product.original_price)}</span>
           <span class="current-price">₩${formatPrice(product.current_price)}</span>`
        : `<span class="current-price">₩${formatPrice(product.current_price)}</span>`;
    
    const stockClass = product.availability?.trim() === '재고있음' ? 'in-stock' : 'out-of-stock';
    
    card.innerHTML = `
        ${saleHtml}
        <a class="product-image-link" href="${escapeHtml(detailHref)}" aria-label="${escapeHtml(productName)} 상세 보기">
        <div class="product-image">
            ${imageHtml}
        </div>
        </a>
        <div class="product-content">
            <div class="product-brand">${escapeHtml(product.brand || '-')}</div>
            <h3 class="product-name">
                <a href="${escapeHtml(detailHref)}">${escapeHtml(displayName)}</a>
            </h3>
            ${product.form_and_quantity ? `<div class="product-variant">${escapeHtml(product.form_and_quantity)}</div>` : ''}
            <div class="price-group">
                ${priceHtml}
            </div>
            ${product.unit_price_description ? `<div class="unit-price-summary"><span class="unit-price-text">${escapeHtml(product.unit_price_description)}</span></div>` : ''}
            <div class="product-footer">
                <span class="stock-status ${stockClass}">
                    ${escapeHtml(product.availability || '')}
                </span>
            </div>
        </div>
    `;
    
    return card;
};

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

// Modal Management
const initModal = () => {
    const requestBtn = document.getElementById('request-monitor-btn');
    const modal = document.getElementById('monitor-modal');
    const closeBtn = modal?.querySelector('.modal-close');
    const form = modal?.querySelector('.monitor-form');
    
    requestBtn?.addEventListener('click', () => {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        form?.reset();
    };
    
    closeBtn?.addEventListener('click', closeModal);
    
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Form submission
    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = {
            url: form.querySelector('#product-url').value,
            targetPrice: form.querySelector('#target-price').value,
            email: form.querySelector('#user-email').value
        };
        
        // Here you would send the data to your backend
        console.log('Monitoring request:', formData);
        
        // Show success message
        alert('제품 모니터링 요청이 접수되었습니다. 검토 후 추가하겠습니다.');
        closeModal();
    });
};

// 상품 요청 기능
const initProductRequest = () => {
    const requestProductFab = document.getElementById('requestProductFab');
    const requestModal = document.getElementById('requestModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');
    const cancelBtn = document.getElementById('cancelBtn');
    const productRequestForm = document.getElementById('productRequestForm');
    const productUrlInput = document.getElementById('productUrl');
    const submitBtn = document.getElementById('submitBtn');
    const requestResult = document.getElementById('requestResult');
    
    // 플로팅 버튼이 없으면 종료
    if (!requestProductFab) return;

    const requestConfig = window.BLIME_SUPABASE_CONFIG || {};
    const requestFunctionUrl = requestConfig.requestFunctionUrl || '';
    const anonKey = requestConfig.anonKey || '';
    
    // 모달 열기
    const openModal = () => {
        requestModal.classList.add('modal-open');
        productUrlInput.focus();
    };
    
    // 모달 닫기
    const closeModal = () => {
        requestModal.classList.remove('modal-open');
        productRequestForm.reset();
        requestResult.innerHTML = '';
        requestResult.className = 'request-result';
    };
    
    // 로딩 상태 설정
    const setLoading = (isLoading) => {
        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-text').style.display = 'none';
            submitBtn.querySelector('.btn-loading').style.display = 'inline-flex';
        } else {
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').style.display = 'inline';
            submitBtn.querySelector('.btn-loading').style.display = 'none';
        }
    };
    
    // 결과 메시지 표시
    const showResult = (message, isSuccess) => {
        requestResult.className = `request-result ${isSuccess ? 'success' : 'error'}`;
        requestResult.innerHTML = `
            <div class="result-icon">
                ${isSuccess 
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
                }
            </div>
            <div class="result-message">${message}</div>
        `;
        
        if (isSuccess) {
            // 성공 시 3초 후 모달 닫기
            setTimeout(() => {
                closeModal();
            }, 3000);
        }
    };
    
    // URL 추출 및 유효성 검사 (텍스트에서 iHerb URL 추출)
    const extractAndValidateUrl = (input) => {
        // 입력에서 URL 패턴 찾기
        const urlPattern = /https?:\/\/[^\s]+/gi;
        const matches = input.match(urlPattern);
        
        if (!matches) {
            return null;
        }
        
        // 찾은 URL들 중에서 iHerb URL 찾기
        for (const url of matches) {
            try {
                // URL 끝에 있을 수 있는 공백이나 특수문자 제거
                const cleanUrl = url.trim().replace(/[<>"\s]+$/, '');
                const parsed = new URL(cleanUrl);
                const host = parsed.hostname.toLowerCase();
                
                if (host === 'iherb.co' || host === 'iherb.com' || host.endsWith('.iherb.com')) {
                    return cleanUrl;
                }
            } catch (e) {
                continue;
            }
        }
        
        return null;
    };

    const getSuccessMessage = (payload) => {
        if (payload && typeof payload.message === 'string' && payload.message.trim()) {
            return payload.message.trim();
        }

        const code = payload?.code || payload?.status;
        if (code === 'accepted' || code === 'pending' || code === 'fetching') {
            return '상품 추가 요청이 접수되었습니다. 가격 추적 준비가 시작됩니다.';
        }
        if (code === 'already_pending') {
            return '이미 처리 중인 요청입니다.';
        }
        if (code === 'ready' || code === 'completed') {
            return '상품이 등록되었습니다. 가격 추적이 시작됩니다.';
        }
        return '상품 추가 요청이 처리되었습니다.';
    };
    
    // 폼 제출 처리
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        const inputValue = productUrlInput.value.trim();
        
        // 텍스트에서 URL 추출 및 검증
        const productUrl = extractAndValidateUrl(inputValue);
        
        if (!productUrl) {
            showResult('올바른 iHerb 상품 URL을 입력해주세요.', false);
            return;
        }
        
        // 로딩 시작
        setLoading(true);
        
        try {
            if (!requestFunctionUrl || !anonKey) {
                showResult('❌ 서비스 준비 중입니다. 관리자에게 문의해주세요. (blime.app.official@gmail.com)', false);
                setLoading(false);
                return;
            }

            const response = await fetch(requestFunctionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': anonKey,
                    'Authorization': `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                    productUrl: productUrl
                })
            });

            const payload = await response.json().catch(() => null);
            if (!payload) {
                throw new Error('invalid_response');
            }

            if (!response.ok || !payload.success) {
                showResult(payload.message || '❌ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', false);
                return;
            }

            showResult(`✅ ${getSuccessMessage(payload)}`, true);
            
        } catch (error) {
            console.error('Error submitting request:', error);
            // 더 구체적인 에러 메시지
            if (error.message.includes('fetch')) {
                showResult('❌ 네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.', false);
            } else {
                showResult('❌ 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', false);
            }
        } finally {
            setLoading(false);
        }
    };
    
    // 이벤트 리스너 등록
    requestProductFab.addEventListener('click', openModal);
    modalClose?.addEventListener('click', closeModal);
    modalOverlay?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    productRequestForm?.addEventListener('submit', handleFormSubmit);
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && requestModal?.classList.contains('modal-open')) {
            closeModal();
        }
    });
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

const initNewProductsChart = async () => {
    const canvas = document.getElementById('newProductsChart');
    if (!canvas || typeof Chart === 'undefined') return;

    let rows = Array.isArray(window.BLIME_NEW_PRODUCTS_DAILY)
        ? window.BLIME_NEW_PRODUCTS_DAILY
        : [];
    if (rows.length === 0) {
        try {
            const response = await fetch('dashboard_data.json');
            const payload = await response.json();
            rows = Array.isArray(payload.new_products_daily)
                ? payload.new_products_daily
                : [];
        } catch (error) {
            rows = [];
        }
    }

    const labels = rows.map(row => row.date);
    const counts = rows.map(row => row.count);

    new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '신규 상품',
                data: counts,
                borderColor: '#004E89',
                backgroundColor: 'rgba(0, 78, 137, 0.12)',
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: context => `신규 상품 ${context.parsed.y}개`
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
};

// Smooth Scroll for Navigation
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

// Intersection Observer for Animations
const initIntersectionObserver = () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });
    
    document.querySelectorAll('.product-card').forEach(el => {
        observer.observe(el);
    });
};

// Load Products Data
const loadProducts = async () => {
    const grid = document.getElementById('products-grid');
    if (!grid) return false;
    const fallbackProducts = hydrateProductsFromDom();

    try {
        const response = await fetch(getProductsIndexUrl());
        if (!response.ok) {
            throw new Error(`products_index.json ${response.status}`);
        }
        const products = await response.json();
        if (!Array.isArray(products)) {
            throw new Error('products_index.json must be an array');
        }
        allProducts = isDealsPage()
            ? products
                .filter(product => product.is_on_sale)
                .sort((a, b) => (b.discount_percentage || 0) - (a.discount_percentage || 0))
            : products;
        filteredProducts = [...allProducts];
        return true;
    } catch (error) {
        console.error('Error loading products:', error);
        allProducts = fallbackProducts;
        filteredProducts = [...allProducts];
        return false;
    }
};

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSearch();
    initFilters();
    initProductCards();
    initModal();
    initProductRequest();
    initViewToggle();
    initNewProductsChart();
    initSmoothScroll();
    initIntersectionObserver();
    
    // Load products and initialize pagination
    loadProducts().then((loaded) => {
        if (!loaded) return;
        const grid = document.getElementById('products-grid');
        if (grid) {
            grid.innerHTML = '';
        }
        renderProducts();
        updatePagination();
    });
    
    // Add loading animation
    document.body.classList.add('loaded');
});

// 동적 스타일 삽입 제거: 모든 리스트뷰 CSS는 static/css/main.css에서 관리
