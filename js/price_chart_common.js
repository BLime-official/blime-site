// 가격 추이 차트가 같이 쓰는 조각: 축, 툴팁 모양, 세로 안내선, 면 채움, 테마·768px 경계 갱신.
// iHerb 단독 차트(product_detail.js)와 쿠팡 비교 차트(product_compare.js)가 window.BLIME_PRICE_CHART로 부른다.
// 여기는 Chart.js 옵션 조각만 만든다. 차트를 만드는 일, 데이터셋, 툴팁 문구는 쓰는 쪽이 정한다.
//
//   isMobile()                          화면이 768px 이하인가
//   readTheme()                         테마(라이트·다크)에 맞는 색. CSS 토큰을 읽는다
//                                       {text, grid, surface, iherb, iherbList, coupang, coupangRange, crosshair}
//   layoutPadding(mobile)               options.layout.padding. 모바일은 화면 가장자리까지 쓰는 풀블리드라 거터를 직접 만든다
//   yScale(theme, mobile)               options.scales.y. 모바일은 라벨을 플롯 안쪽(mirror)에, 데스크톱은 `₩` 표기를 바깥에
//   xScale(theme, mobile, formatLabel)  options.scales.x. 눈금 글자는 formatLabel(라벨 문자열)이 정한다
//   tooltipBase()                       options.plugins.tooltip의 바탕: 어두운 상자와 값 앞의 짧은 선 모양 키(12×3px).
//                                       filter·label 같은 내용은 쓰는 쪽이 callbacks에 얹는다
//   crosshair                           Chart.js 플러그인. 가리킨 날짜에 1px 세로 안내선(--chart-crosshair)을 긋는다. plugins: [crosshair]로 단다
//   areaFill(hexColor)                  판매가 선 아래의 옅은 면. 플롯 높이에 맞춘 세로 그라데이션(위 16% → 아래 0)
//   discountPercent(original, price)    툴팁의 할인율(정수 %). 서버(products.discount_fields)처럼 정확히 .5인 값은 짝수 쪽으로 반올림한다
//   onPresentationChange(callback)      테마가 바뀌거나(blime:theme-changed) 768px 경계를 넘을 때 callback()을 부른다
//
// iHerb 할인코드 적용가 점(가격 보기 설정을 켠 방문자의 그래프). 점이 있는 날짜는 쓰는 쪽이 정하고, 여기는 점과 연결선의 모양만 준다.
// 스크립트 주소에 버전이 없어 쓰는 쪽이 캐시에 남은 옛 사본(이 조각이 없다)과 만날 수 있다. 쓰는 쪽은 아래 일곱 이름이 모두 있는지 보고, 없으면 코드 쪽 그림을 건너뛴다.
//   isIherbCodeOn()                     설정이 켜져 있는가: <html data-iherb-code="on">(머리 조각과 price_view.js가 붙인다)
//   lastValueIndex(values)              값이 있는 마지막 칸의 번호(없으면 -1). null·undefined·NaN인 칸은 값이 아니다
//   iherbCodeDataset(theme, length, index, price)
//                                       코드 적용가 점 데이터셋: length칸 중 index 칸에만 값(price)이 있고 선은 긋지 않는다. 키 'iherbCode'.
//                                       툴팁 항목이 되지 않도록 쓰는 쪽의 tooltip.filter가 키로 거른다
//   iherbCodeConnector                  Chart.js 플러그인. 키 sale 또는 iherb 데이터셋의 그 칸 점에서 iherbCode 점까지 점선을 긋는다. plugins: [iherbCodeConnector]로 단다
//   iherbCodeTooltipLine(percent, price)  툴팁 덧붙임 줄. 예: '  20% 할인 적용 시 ₩4,690'
//   iherbCodeTooltipPosition()          툴팁 위치 계산(Chart.js의 tooltip.position)의 이름. 코드 적용가 점이 그려지는 차트만 plugins.tooltip.position에 쓴다.
//                                       점(키 iherbCode)을 뺀 활성 요소들의 평균에 툴팁 꼬리를 둔다. 부를 때 Chart.js 목록에 등록한다
//   onIherbCodeChange(callback)         설정 표시가 바뀌면(blime:iherb-code-changed) callback()을 부른다
(() => {
    const MOBILE_QUERY = window.matchMedia('(max-width: 768px)');

    // 모바일 차트는 화면 가장자리까지 쓰는 풀블리드라, 좌우 여백을 차트가 직접 만들어야
    // 제목·통계·안내 박스와 같은 선에 선다. `.container`의 모바일 좌우 패딩과 같은 값이다.
    const MOBILE_GUTTER = 16;
    // mirror + drawTicks:false 인 y축이 스스로 잡아먹는 폭은 정확히 ticks.padding × 2 다
    // (0/4/6/10 으로 측정 확인). 그만큼 왼쪽 layout 패딩에서 빼야 플롯이 거터에 맞는다.
    const MIRROR_TICK_PADDING = 6;
    const MIRROR_AXIS_RESERVE = MIRROR_TICK_PADDING * 2;

    const isMobile = () => MOBILE_QUERY.matches;

    const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

    // 테마(라이트/다크)에 맞는 차트 색을 CSS 토큰에서 읽는다. 판매처 색 토큰은 product_detail.css에 있다.
    const readTheme = () => ({
        text: token('--text-secondary', '#6B7280'),
        grid: token('--border-color', '#E5E7EB'),
        surface: token('--bg-primary', '#FFFFFF'),
        iherb: token('--store-iherb', '#458500'),
        iherbList: token('--store-iherb-list', 'rgba(69, 133, 0, 0.6)'),
        coupang: token('--store-coupang', '#346AFF'),
        coupangRange: token('--store-coupang-range', 'rgba(52, 106, 255, 0.2)'),
        crosshair: token('--chart-crosshair', '#9CA3AF')
    });

    const layoutPadding = (mobile) => ({
        left: mobile ? MOBILE_GUTTER - MIRROR_AXIS_RESERVE : 0,
        right: mobile ? MOBILE_GUTTER : 16,
        top: 6,
        bottom: 0
    });

    const yScale = (theme, mobile) => ({
        beginAtZero: false,
        // 위아래에 여유를 둔다. 없으면 기간의 최저가·최고가인 선과 끝점이 플롯 가장자리에 붙어 잘린다.
        grace: '6%',
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
            // 미러 라벨의 글자는 플롯 왼쪽 가장자리에서 ticks.padding(6px) 떨어져 시작하고, 바탕은 글자에서 backdropPadding.left만큼 왼쪽에서 시작한다
            // (Chart.js 4.4.0). left를 padding과 같게 둬야 바탕이 플롯 맨 왼쪽까지 덮는다. 모자라면 그 몇 px에서 라벨 밑을 지나는 선이 점으로
            // 남고 격자선 꼬리가 보인다. Chart.js는 left가 없으면 x를 쓴다. x는 오른쪽 여백이고 글자 위치는 그대로다.
            backdropPadding: { left: MIRROR_TICK_PADDING, x: 3, y: 2 },
            z: 1,
            callback: (value) => (mobile ? value.toLocaleString('ko-KR') : `₩${value.toLocaleString('ko-KR')}`)
        }
    });

    const xScale = (theme, mobile, formatLabel = (label) => label) => ({
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
            callback(value) {
                return formatLabel(this.getLabelForValue(value));
            }
        }
    });

    // 값 앞에 차트 선과 같은 색의 짧은 선(12px 길이, 3px 굵기)을 둔다. 쓰는 쪽은 callbacks를 펼쳐서 label 등을 더한다.
    // Chart.js 4.4.0은 선 모양 키의 길이를 min(boxWidth, boxHeight)로 그린다. boxHeight를 3으로 두면 3px짜리 점이 되어 키가 보이지
    // 않는다. 굵기는 캔버스의 lineWidth를 따르는데, Chart.js는 키를 그리기 전에 상자 바탕을 칠하며 lineWidth를 tooltip.borderWidth로
    // 정할 뿐 키 쪽에서 따로 정하지 않는다. 그래서 borderWidth로 3px를 준다(테두리 색은 기본값인 투명이라 상자 모양은 그대로다).
    // 그려진 크기는 tests/site가 캔버스 픽셀로 잰다.
    const tooltipBase = () => ({
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 13 },
        usePointStyle: true,
        boxWidth: 12,
        boxHeight: 12,
        boxPadding: 4,
        borderWidth: 3,
        callbacks: {
            labelPointStyle: () => ({ pointStyle: 'line', rotation: 0 }),
            labelColor: (item) => ({
                borderColor: item.dataset.borderColor,
                backgroundColor: item.dataset.borderColor
            })
        }
    });

    // 세로 안내선: 가리킨 날짜에 머리카락 선 하나. 선이 얇아도 그 날짜를 고를 수 있다.
    // 색은 그릴 때 읽는다. 테마가 바뀌어도 차트에 따로 알릴 필요가 없다.
    const crosshair = {
        id: 'priceCrosshair',
        afterDatasetsDraw(chart) {
            const active = chart.tooltip?.getActiveElements?.() ?? [];
            if (!active.length) return;
            const { x } = active[0].element;
            const { top, bottom } = chart.chartArea;
            const { ctx } = chart;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x, bottom);
            ctx.lineWidth = 1;
            ctx.strokeStyle = token('--chart-crosshair', '#9CA3AF');
            ctx.stroke();
            ctx.restore();
        }
    };

    // '#rrggbb' → 'r, g, b'. 읽지 못하면 iHerb 초록(라이트)이다.
    const hexToRgb = (hex) => {
        const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
        return match ? match.slice(1).map((part) => parseInt(part, 16)).join(', ') : '69, 133, 0';
    };

    // 플롯 높이에 맞춘 세로 그라데이션(위 16% → 아래 0). 고정 높이로 만들면 모바일에서 끝까지 투명해지지 않는다.
    const areaFill = (hexColor) => {
        const rgb = hexToRgb(hexColor);
        let cache = null;
        return (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return `rgba(${rgb}, 0.08)`;
            const key = `${chartArea.top}:${chartArea.bottom}`;
            if (!cache || cache.key !== key) {
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, `rgba(${rgb}, 0.16)`);
                gradient.addColorStop(1, `rgba(${rgb}, 0)`);
                cache = { key, gradient };
            }
            return cache.gradient;
        };
    };

    // 할인율(정수 %). 카드와 상단 가격의 할인율은 서버가 Python round()로 구한다(products.discount_fields). 12.5%처럼 정확히 .5인 값은
    // 짝수 쪽(12)으로 가므로, 같은 값이 툴팁에서 13으로 보이지 않게 같은 규칙으로 맞춘다. 두 차트의 툴팁이 같이 쓴다.
    const discountPercent = (original, price) => {
        const percent = (original - price) / original * 100;
        const floor = Math.floor(percent);
        if (percent - floor === 0.5) return floor % 2 === 0 ? floor : floor + 1;
        return Math.round(percent);
    };

    // 테마가 바뀌거나 768px 경계를 넘으면 callback()을 부른다(이벤트 객체는 넘기지 않는다). 쓰는 쪽이 옵션을 다시 만들어 적용한다.
    const onPresentationChange = (callback) => {
        const notify = () => callback();
        window.addEventListener('blime:theme-changed', notify);
        if (typeof MOBILE_QUERY.addEventListener === 'function') {
            MOBILE_QUERY.addEventListener('change', notify);
        } else if (typeof MOBILE_QUERY.addListener === 'function') {
            MOBILE_QUERY.addListener(notify);
        }
    };

    // 가격 보기(iHerb 할인 적용가) 설정이 켜져 있는가. 서버가 코드 쪽을 함께 그린 페이지에서만 뜻이 있다. 표시는 <html data-iherb-code="on"> 하나다.
    const isIherbCodeOn = () => document.documentElement.getAttribute('data-iherb-code') === 'on';

    // 값이 있는 마지막 칸의 번호. 값이 없는 칸(null, undefined, NaN)은 값이 아니다. 하나도 없으면 -1이다.
    const lastValueIndex = (values) => {
        for (let index = values.length - 1; index >= 0; index -= 1) {
            if (Number.isFinite(values[index])) return index;
        }
        return -1;
    };

    // 코드 적용가 점: length칸 중 index 칸(판매가 선이 끝나는 날)에만 값이 있고 선은 긋지 않는 데이터셋이다. 모양은 테두리 원(반지름 5,
    // 테두리 2.5px는 --store-iherb, 속은 바탕색)이다. 마우스를 올려도 같은 모양이어야 해서 호버 값을 따로 준다(Chart.js는 호버 색을 기본색에서
    // 어둡게 만들고 호버 반지름·테두리를 4·1로 줄인다). 터치 판정 영역은 없다. order를 맨 앞(-1)에 둬 판매가 선과 끝점 위에 그린다.
    // 데이터셋은 키 'iherbCode'로 알아본다: 쓰는 쪽의 tooltip.filter가 이 키를 거르고, 연결선 플러그인이 이 키를 찾는다.
    const iherbCodeDataset = (theme, length, index, price) => ({
        key: 'iherbCode',
        label: '할인 적용가',
        data: Array.from({ length }, (_, day) => (day === index ? price : null)),
        showLine: false,
        fill: false,
        borderColor: theme.iherb,
        backgroundColor: theme.surface,
        pointRadius: 5,
        pointHoverRadius: 5,
        pointHitRadius: 0,
        pointBorderWidth: 2.5,
        pointHoverBorderWidth: 2.5,
        pointBorderColor: theme.iherb,
        pointBackgroundColor: theme.surface,
        pointHoverBorderColor: theme.iherb,
        pointHoverBackgroundColor: theme.surface,
        order: -1
    });

    // 코드 적용가 점과 판매가 선의 끝을 잇는 점선(1.5px, [2, 3], --store-iherb). 판매가 선은 키가 sale(단독)이나 iherb(비교)인 데이터셋이고,
    // 두 점은 같은 칸이라 세로선이다. 점보다 먼저 그려(beforeDatasetsDraw) 두 점의 테두리가 선 끝을 덮는다. 위치는 점이 지금 그려진 자리
    // (element.x·y)라 애니메이션을 따라간다. 색은 그릴 때 읽는다(crosshair와 같다). 코드 적용가 점이 없는 차트에서는 아무것도 그리지 않는다.
    const iherbCodeConnector = {
        id: 'iherbCodeConnector',
        beforeDatasetsDraw(chart) {
            const datasets = chart.data.datasets;
            const codeIndex = datasets.findIndex((dataset) => dataset.key === 'iherbCode');
            const lineIndex = datasets.findIndex((dataset) => dataset.key === 'sale' || dataset.key === 'iherb');
            if (codeIndex < 0 || lineIndex < 0) return;
            const day = lastValueIndex(datasets[codeIndex].data);
            if (day < 0) return;
            const from = chart.getDatasetMeta(lineIndex).data[day];
            const to = chart.getDatasetMeta(codeIndex).data[day];
            if (!from || !to || from.skip || to.skip) return;
            const { ctx } = chart;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 3]);
            ctx.strokeStyle = token('--store-iherb', '#458500');
            ctx.stroke();
            ctx.restore();
        }
    };

    // 툴팁의 한 줄. 그날 iHerb 줄에 덧붙인다. 앞 공백 두 칸은 지금 덧붙임 줄(정가 … · N% 할인)과 같다.
    const iherbCodeTooltipLine = (percent, price) => `  ${percent}% 할인 적용 시 ₩${window.BLIME_FORMAT.price(price)}`;

    // 툴팁 꼬리가 가리킬 자리. Chart.js 기본 'average'는 가리킨 날짜에 값이 있는 모든 요소(index 모드)의 자리를 평균한다. 코드 적용가 점도 그날의
    // 활성 요소라서 평균에 들면 꼬리가 판매가 점에서 점 쪽 빈 자리로 끌려 내려간다(점은 판매가 선에서 한참 떨어질 수 있다). 점 요소만 빼고 나머지는
    // 기본 'average'에 맡겨 점이 없던 때와 같은 자리를 가리키게 한다. position에 이름만 적으므로 쓰기 전에 Chart.js 목록(Chart.Tooltip.positioners)에
    // 등록해야 한다. 등록하지 않은 이름이면 Chart.js가 마우스를 올리는 순간 던진다. 그래서 이름을 돌려주기 전에 등록하고(이미 있으면 그대로), 목록을 찾지
    // 못하면 기본 'average'를 돌려준다(꼬리가 조금 쏠릴 뿐이다).
    const IHERB_CODE_POSITION = 'averageWithoutIherbCode';
    const iherbCodeTooltipPosition = () => {
        const positioners = window.Chart?.Tooltip?.positioners;
        if (!positioners || typeof positioners.average !== 'function') return 'average';
        if (!positioners[IHERB_CODE_POSITION]) {
            // this는 툴팁이다(Chart.js가 그렇게 부른다). 활성 요소의 데이터셋 키로 점을 가린다.
            positioners[IHERB_CODE_POSITION] = function (items, eventPosition) {
                const datasets = this.chart.data.datasets;
                return positioners.average.call(this, items.filter((item) => datasets[item.datasetIndex]?.key !== 'iherbCode'), eventPosition);
            };
        }
        return IHERB_CODE_POSITION;
    };

    // 가격 보기 설정이 바뀌면(price_view.js가 표시를 바꿀 때 보내는 blime:iherb-code-changed) callback()을 부른다(이벤트 객체는 넘기지 않는다).
    // 쓰는 쪽이 데이터셋과 범례를 다시 만든다.
    const onIherbCodeChange = (callback) => {
        window.addEventListener('blime:iherb-code-changed', () => callback());
    };

    window.BLIME_PRICE_CHART = {
        isMobile,
        readTheme,
        layoutPadding,
        yScale,
        xScale,
        tooltipBase,
        crosshair,
        areaFill,
        discountPercent,
        onPresentationChange,
        isIherbCodeOn,
        lastValueIndex,
        iherbCodeDataset,
        iherbCodeConnector,
        iherbCodeTooltipLine,
        iherbCodeTooltipPosition,
        onIherbCodeChange
    };
})();
