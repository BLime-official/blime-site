// Product Detail Page JavaScript

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

// Price Chart
let priceChart = null;
let fullChartData = null;

const initPriceChart = () => {
    if (!chartData || !chartData.labels || chartData.labels.length === 0) {
        console.log('No chart data available');
        return;
    }

    // Store full data
    fullChartData = {
        labels: [...chartData.labels],
        prices: [...chartData.prices],
        original_prices: chartData.original_prices ? [...chartData.original_prices] : null
    };

    const ctx = document.getElementById('priceHistoryChart')?.getContext('2d');
    if (!ctx) return;

    const datasets = [];
    
    // Original price line
    if (fullChartData.original_prices && fullChartData.original_prices.length > 0) {
        datasets.push({
            label: '정가',
            data: fullChartData.original_prices,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#3B82F6',
            pointBorderColor: '#fff',
            pointBorderWidth: 2
        });
    }
    
    // Sale price line (only if on sale)
    if (isOnSale) {
        datasets.push({
            label: '판매가',
            data: fullChartData.prices,
            borderColor: '#EF4444',
            backgroundColor: 'transparent',
            borderWidth: 3,
            tension: 0.4,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#EF4444',
            pointBorderColor: '#fff',
            pointBorderWidth: 2
        });
    }
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    
    if (datasets[0]) {
        datasets[0].backgroundColor = gradient;
    }
    
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: fullChartData.labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: {
                            size: 14,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: {
                        size: 14,
                        weight: '600'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ₩' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        },
                        color: '#6B7280',
                        padding: 8,
                        callback: function(value) {
                            return '₩' + value.toLocaleString();
                        }
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        },
                        color: '#6B7280',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8
                    }
                }
            }
        }
    });
};

// Chart Period Controls
const initChartControls = () => {
    const periodButtons = document.querySelectorAll('.chart-period');
    
    periodButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            periodButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const period = button.dataset.period;
            updateChartPeriod(period);
        });
    });
};

const updateChartPeriod = (period) => {
    if (!priceChart || !fullChartData) return;
    
    let dataToShow = {
        labels: [...fullChartData.labels],
        prices: [...fullChartData.prices],
        original_prices: fullChartData.original_prices ? [...fullChartData.original_prices] : null
    };
    
    // Filter data based on period
    if (period !== 'all') {
        const days = parseInt(period);
        const startIndex = Math.max(0, dataToShow.labels.length - days);
        
        dataToShow.labels = dataToShow.labels.slice(startIndex);
        dataToShow.prices = dataToShow.prices.slice(startIndex);
        if (dataToShow.original_prices) {
            dataToShow.original_prices = dataToShow.original_prices.slice(startIndex);
        }
    }
    
    // Update chart
    priceChart.data.labels = dataToShow.labels;
    priceChart.data.datasets.forEach((dataset, index) => {
        if (index === 0 && dataToShow.original_prices) {
            dataset.data = dataToShow.original_prices;
        } else if (index === 1 || (index === 0 && !dataToShow.original_prices)) {
            dataset.data = dataToShow.prices;
        }
    });
    
    priceChart.update('active');
};

// Price Alert - Mobile Popup for disabled button
const initPriceAlert = () => {
    const alertBtn = document.getElementById('price-alert-btn');
    const mobilePopup = document.getElementById('mobile-popup');
    const mobilePopupBackdrop = document.getElementById('mobile-popup-backdrop');
    const closePopupBtn = document.getElementById('close-popup-btn');
    
    // Check if device is mobile/touch device
    const isMobile = window.matchMedia('(max-width: 768px)').matches || 
                     'ontouchstart' in window || 
                     navigator.maxTouchPoints > 0;
    
    if (isMobile && alertBtn) {
        // Enable click on disabled button for mobile
        alertBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMobilePopup();
        });
    }
    
    const showMobilePopup = () => {
        mobilePopup?.classList.add('active');
        mobilePopupBackdrop?.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    
    const hideMobilePopup = () => {
        mobilePopup?.classList.remove('active');
        mobilePopupBackdrop?.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    // Close popup handlers
    closePopupBtn?.addEventListener('click', hideMobilePopup);
    mobilePopupBackdrop?.addEventListener('click', hideMobilePopup);
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobilePopup?.classList.contains('active')) {
            hideMobilePopup();
        }
    });
};

// Smooth animations on scroll
const initScrollAnimations = () => {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe elements
    const elementsToAnimate = [
        '.product-gallery',
        '.product-info',
        '.stats-cards .stat-card',
        '.chart-section'
    ];
    
    elementsToAnimate.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(el);
        });
    });
};

// Image zoom effect
const initImageZoom = () => {
    const mainImage = document.querySelector('.main-image img');
    if (!mainImage) return;
    
    let isZoomed = false;
    
    mainImage.style.cursor = 'zoom-in';
    mainImage.style.transition = 'transform 0.3s ease';
    
    mainImage.addEventListener('click', () => {
        if (!isZoomed) {
            mainImage.style.transform = 'scale(1.5)';
            mainImage.style.cursor = 'zoom-out';
            isZoomed = true;
        } else {
            mainImage.style.transform = 'scale(1)';
            mainImage.style.cursor = 'zoom-in';
            isZoomed = false;
        }
    });
    
    // Reset zoom on mouse leave
    mainImage.addEventListener('mouseleave', () => {
        if (isZoomed) {
            mainImage.style.transform = 'scale(1)';
            mainImage.style.cursor = 'zoom-in';
            isZoomed = false;
        }
    });
};

// Add hover effects to buttons
const initButtonEffects = () => {
    const buttons = document.querySelectorAll('.btn-primary, .btn-secondary');
    
    buttons.forEach(button => {
        button.addEventListener('mouseenter', (e) => {
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            
            button.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
};

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initPriceChart();
    initChartControls();
    // 초기 로드시 30일 보기로 필터 적용
    updateChartPeriod('30');
    initPriceAlert();
    initScrollAnimations();
    initImageZoom();
    initButtonEffects();
});

// Add ripple effect styles
const style = document.createElement('style');
style.textContent = `
    .btn-primary, .btn-secondary {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        width: 0;
        height: 0;
        background: rgba(255, 255, 255, 0.5);
        transform: translate(-50%, -50%);
        animation: ripple 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes ripple {
        to {
            width: 200px;
            height: 200px;
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);