// Product Detail Page JavaScript

// Price Chart
let priceChart = null;
let fullChartData = null;

// Chart.js는 first-party로 서빙하지만, 네트워크 실패나 콘텐츠 차단기 등으로
// 로드되지 않는 경우가 있다. 그 때 조용히 빈 영역을 남기지 않고 안내를 보여준다.
const showChartUnavailable = (message) => {
    const container = document.querySelector('.chart-container');
    if (!container || container.querySelector('.chart-fallback')) return;

    const canvas = container.querySelector('canvas');
    if (canvas) canvas.hidden = true;

    const notice = document.createElement('p');
    notice.className = 'chart-fallback';
    notice.setAttribute('role', 'status');
    notice.textContent = message;
    container.appendChild(notice);
};

// 시리즈 색은 정가(파랑)·판매가(빨강)로 고정. 나머지 색은 CSS 토큰을 따른다.
const SERIES_COLORS = {
    original: '#3B82F6',
    sale: '#EF4444'
};
const MOBILE_QUERY = window.matchMedia('(max-width: 768px)');

// 모바일 차트는 화면 가장자리까지 쓰는 풀블리드라, 좌우 여백을 차트가 직접 만들어야
// 제목·통계·안내 박스와 같은 선에 선다. `.container`의 모바일 좌우 패딩과 같은 값이다.
const MOBILE_GUTTER = 16;
// mirror + drawTicks:false 인 y축이 스스로 잡아먹는 폭은 정확히 ticks.padding × 2 다
// (0/4/6/10 으로 측정 확인). 그만큼 왼쪽 layout 패딩에서 빼야 플롯이 거터에 맞는다.
const MIRROR_TICK_PADDING = 6;
const MIRROR_AXIS_RESERVE = MIRROR_TICK_PADDING * 2;

const isMobileViewport = () => MOBILE_QUERY.matches;

// 테마(라이트/다크)에 맞는 차트 색을 CSS 토큰에서 읽는다.
const readChartTheme = () => {
    const styles = getComputedStyle(document.documentElement);
    const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    return {
        text: token('--text-secondary', '#6B7280'),
        grid: token('--border-color', '#E5E7EB'),
        surface: token('--bg-primary', '#FFFFFF')
    };
};

// 'YYYY-MM-DD' → 'M/D'. 모바일 X축은 폭이 좁아 연도까지 쓰면 라벨이 서로 붙는다.
const formatCompactDate = (label) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(label));
    return match ? `${Number(match[2])}/${Number(match[3])}` : label;
};

// 플롯 높이에 맞춘 세로 그라데이션. 고정 높이로 만들면 모바일에서 끝까지 투명해지지 않는다.
const createAreaFill = (rgb) => {
    let cache = null;
    return (context) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return `rgba(${rgb}, 0.08)`;
        const key = `${chartArea.top}:${chartArea.bottom}`;
        if (!cache || cache.key !== key) {
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, `rgba(${rgb}, 0.18)`);
            gradient.addColorStop(1, `rgba(${rgb}, 0)`);
            cache = { key, gradient };
        }
        return cache.gradient;
    };
};

// 점은 숨기고 터치/호버 시에만 보여 준다. 30~90개 점을 그대로 그리면 선이 점에 가려진다.
const buildDataset = (label, data, color, theme, { area = false } = {}) => ({
    label,
    data,
    borderColor: color,
    borderWidth: 2,
    tension: 0.4,
    fill: area ? 'origin' : false,
    backgroundColor: area ? createAreaFill('59, 130, 246') : 'transparent',
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 16,
    pointBackgroundColor: color,
    pointBorderColor: theme.surface,
    pointBorderWidth: 2
});

const buildChartOptions = (theme, mobile, datasetCount) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        mode: 'index',
        intersect: false
    },
    layout: {
        padding: {
            left: mobile ? MOBILE_GUTTER - MIRROR_AXIS_RESERVE : 0,
            right: mobile ? MOBILE_GUTTER : 16,
            top: 6,
            bottom: 0
        }
    },
    plugins: {
        legend: {
            // 시리즈가 하나면 제목이 이미 무엇인지 말해 주므로 범례를 그리지 않는다.
            display: datasetCount > 1,
            position: 'top',
            align: 'end',
            labels: {
                usePointStyle: true,
                pointStyle: 'line',
                pointStyleWidth: 20,
                boxWidth: 20,
                boxHeight: 8,
                padding: 14,
                color: theme.text,
                font: { size: 12, weight: '500' },
                // usePointStyle 은 점 테두리색(배경색)을 선 키에 쓰므로 시리즈 색으로 바꿔 준다.
                generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item) => {
                    const dataset = chart.data.datasets[item.datasetIndex];
                    return { ...item, strokeStyle: dataset.borderColor, fillStyle: dataset.borderColor, lineWidth: 2 };
                })
            }
        },
        tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.92)',
            padding: 10,
            cornerRadius: 8,
            titleFont: { size: 13, weight: '600' },
            bodyFont: { size: 13 },
            callbacks: {
                label: (context) => `${context.dataset.label}: ₩${context.parsed.y.toLocaleString()}`
            }
        }
    },
    scales: {
        y: {
            beginAtZero: false,
            grid: { color: theme.grid, drawTicks: false },
            border: { display: false },
            ticks: {
                // 모바일은 라벨을 플롯 안쪽에 그려 축이 가로 폭을 먹지 않게 한다.
                mirror: mobile,
                color: theme.text,
                font: { size: mobile ? 11 : 12 },
                padding: mobile ? MIRROR_TICK_PADDING : 8,
                maxTicksLimit: mobile ? 6 : 8,
                showLabelBackdrop: mobile,
                backdropColor: theme.surface,
                backdropPadding: { x: 3, y: 2 },
                z: 1,
                callback: (value) => (mobile ? value.toLocaleString() : `₩${value.toLocaleString()}`)
            }
        },
        x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
                color: theme.text,
                font: { size: mobile ? 11 : 12 },
                maxRotation: 0,
                autoSkip: true,
                autoSkipPadding: 16,
                maxTicksLimit: mobile ? 4 : 8,
                align: 'inner',
                callback: function (value) {
                    const label = this.getLabelForValue(value);
                    return mobile ? formatCompactDate(label) : label;
                }
            }
        }
    }
});

// 테마가 바뀌거나 768px 경계를 넘으면 옵션을 다시 만들어 적용한다.
const refreshChartPresentation = () => {
    if (!priceChart) return;
    const theme = readChartTheme();
    priceChart.options = buildChartOptions(theme, isMobileViewport(), priceChart.data.datasets.length);
    priceChart.data.datasets.forEach((dataset) => {
        dataset.pointBorderColor = theme.surface;
    });
    priceChart.update('none');
};

const initPriceChart = () => {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js를 불러오지 못해 가격 추이 차트를 표시할 수 없습니다.');
        showChartUnavailable('가격 추이 차트를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        return;
    }

    if (typeof chartData === 'undefined' || !chartData || !chartData.labels || chartData.labels.length === 0) {
        console.log('No chart data available');
        showChartUnavailable('표시할 가격 추이 데이터가 아직 없습니다.');
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

    const theme = readChartTheme();
    const datasets = [];

    // Original price line
    if (fullChartData.original_prices && fullChartData.original_prices.length > 0) {
        datasets.push(buildDataset('정가', fullChartData.original_prices, SERIES_COLORS.original, theme, { area: true }));
    }

    // Sale price line (only if on sale)
    if (isOnSale) {
        datasets.push(buildDataset('판매가', fullChartData.prices, SERIES_COLORS.sale, theme));
    }

    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: fullChartData.labels,
            datasets: datasets
        },
        options: buildChartOptions(theme, isMobileViewport(), datasets.length)
    });

    window.addEventListener('blime:theme-changed', refreshChartPresentation);
    if (typeof MOBILE_QUERY.addEventListener === 'function') {
        MOBILE_QUERY.addEventListener('change', refreshChartPresentation);
    } else if (typeof MOBILE_QUERY.addListener === 'function') {
        MOBILE_QUERY.addListener(refreshChartPresentation);
    }
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
    
    // 'active' 모드로 갱신하면 모든 점이 호버 상태(hoverRadius)로 그려진다 — 기본 모드로 갱신한다.
    priceChart.update();
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

// 한 초기화가 실패해도 나머지 UI 기능까지 함께 죽지 않도록 격리한다.
const runSafely = (name, fn) => {
    try {
        fn();
    } catch (error) {
        console.error(`[product_detail] ${name} 초기화 실패:`, error);
    }
};

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    runSafely('priceChart', initPriceChart);
    runSafely('chartControls', initChartControls);
    // 초기 로드시 30일 보기로 필터 적용
    runSafely('chartPeriod', () => updateChartPeriod('30'));
    runSafely('imageZoom', initImageZoom);
    runSafely('buttonEffects', initButtonEffects);
});

// Add ripple effect styles
const productDetailRippleStyle = document.createElement('style');
productDetailRippleStyle.textContent = `
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
document.head.appendChild(productDetailRippleStyle);
