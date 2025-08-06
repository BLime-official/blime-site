// Modern Price Tracker JavaScript

// Global variables
let currentPage = 1;
const itemsPerPage = 24;
let allProducts = [];
let filteredProducts = [];
let currentCategory = 'all';

// Google Apps Script Web App URL (배포 후 여기에 URL 입력)
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzP1H8H2VcoRoNCyUXs5LpzgfZcLgdFkULNZTUIPe_iuYZ8RLvoDFA7YXzMSyPjzfyX9g/exec';

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
        if (card && !e.target.closest('.quick-view-btn')) {
            const productId = card.dataset.productId;
            const inDeals = window.location.pathname.includes('/deals/');
            const target = inDeals
                ? `../products/product_${productId}.html`
                : `products/product_${productId}.html`;
            window.location.href = target;
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
    
    const saleHtml = product.is_on_sale 
        ? `<div class="sale-badge">${product.discount_percentage}% ↓</div>` 
        : '';
    
    const imageHtml = product.image_url
        ? `<img src="${product.image_url}" alt="${product.name}" loading="lazy">`
        : `<div class="no-image">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>`;
    
    const priceHtml = product.is_on_sale
        ? `<span class="original-price">₩${product.original_price_formatted}</span>
           <span class="current-price">₩${product.current_price_formatted}</span>`
        : `<span class="current-price">₩${product.current_price_formatted || product.current_price}</span>`;
    
    const stockClass = product.availability?.trim() === '재고있음' ? 'in-stock' : 'out-of-stock';
    
    card.innerHTML = `
        ${saleHtml}
        <div class="product-image">
            ${imageHtml}
        </div>
        <div class="product-content">
            <div class="product-brand">${product.brand || '-'}</div>
            <h3 class="product-name">${product.full_text_without_brand || product.name}</h3>
            ${product.form_and_quantity ? `<div class="product-variant">${product.form_and_quantity}</div>` : ''}
            <div class="price-group">
                ${priceHtml}
            </div>
            <div class="product-footer">
                <span class="stock-status ${stockClass}">
                    ${product.availability}
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
    
    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '←';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderProducts();
            updatePagination();
            scrollToProducts();
        }
    });
    pagination.appendChild(prevBtn);
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.classList.toggle('active', i === currentPage);
        pageBtn.addEventListener('click', () => {
            currentPage = i;
            renderProducts();
            updatePagination();
            scrollToProducts();
        });
        pagination.appendChild(pageBtn);
    }
    
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
            currentPage++;
            renderProducts();
            updatePagination();
            scrollToProducts();
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

// Google Sheets 상품 요청 기능
const initGoogleSheetsRequest = () => {
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
            // Web App URL이 설정되었는지 확인
            if (WEB_APP_URL === 'YOUR_DEPLOYED_WEB_APP_URL_HERE') {
                console.error('Google Apps Script Web App URL이 설정되지 않았습니다.');
                console.error('설정 방법: static/js/GOOGLE_SHEETS_INTEGRATION.md 파일 참조');
                showResult('❌ 서비스 준비 중입니다. 관리자에게 문의해주세요. (blime.app.official@gmail.com)', false);
                setLoading(false);
                return;
            }
            
            // Google Apps Script로 데이터 전송
            await fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors', // CORS 우회 - 응답을 읽을 수 없음
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productUrl: productUrl
                })
            });
            
            // no-cors 모드에서는 응답을 읽을 수 없으므로 성공으로 간주
            // 실제로는 Google Apps Script가 정상적으로 처리했다고 가정
            showResult('✅ 요청이 전송되었습니다. 감사합니다.', true);
            
            // 성공 로그 최소화
            
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
    try {
        // In real implementation, this would fetch from an API
        // For now, we'll use the products already rendered in HTML
        // Only load products from the main products grid, not from hot deals section
        const productCards = document.querySelectorAll('#products-grid .product-card');
        allProducts = Array.from(productCards).map((card, index) => {
            const priceText = card.querySelector('.current-price')?.textContent || '0';
            const price = parseInt(priceText.replace(/[^\d]/g, ''));
            const originalPriceText = card.querySelector('.original-price')?.textContent || '';
            
            return {
                id: card.dataset.productId || index + 1,
                name: card.querySelector('.product-name')?.textContent || '',
                brand: card.querySelector('.product-brand')?.textContent || '',
                full_text_without_brand: card.querySelector('.product-name')?.textContent || '',
                form_and_quantity: card.querySelector('.product-variant')?.textContent || '',
                current_price: price,
                current_price_formatted: priceText.replace('₩', ''),
                original_price_formatted: originalPriceText.replace('₩', ''),
                availability: card.querySelector('.stock-status')?.textContent?.trim() || '',
                is_on_sale: !!card.querySelector('.sale-badge'),
                discount_percentage: card.querySelector('.sale-badge')?.textContent?.match(/\d+/)?.[0] || '0',
                image_url: card.querySelector('.product-image img')?.src || ''
            };
        });
        
        filteredProducts = [...allProducts];
    } catch (error) {
        console.error('Error loading products:', error);
    }
};

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSearch();
    initFilters();
    initProductCards();
    initModal();
    initGoogleSheetsRequest(); // Google Sheets 상품 요청 기능 초기화
    initViewToggle();
    initSmoothScroll();
    initIntersectionObserver();
    
    // Load products and initialize pagination
    loadProducts().then(() => {
        // Remove all original products from DOM
        const grid = document.getElementById('products-grid');
        if (grid) {
            grid.innerHTML = '';
        }
        
        // Render first page
        renderProducts();
        updatePagination();
    });
    
    // Add loading animation
    document.body.classList.add('loaded');
});

// 동적 스타일 삽입 제거: 모든 리스트뷰 CSS는 static/css/main.css에서 관리