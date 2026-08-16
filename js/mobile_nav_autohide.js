/**
 * 모바일 상단바·하단바 스크롤 자동 숨김.
 *
 * 아래로 스크롤하면 헤더와 하단 내비게이션을 화면 밖으로 밀어내고, 위로 스크롤하면
 * 즉시 되돌린다. 상태는 <body>의 `mobile-chrome-hidden` 클래스 하나로만 표현하고
 * 실제 이동은 CSS(main.css의 768px 미디어 블록)가 담당한다. 덕분에 데스크톱에서는
 * 클래스가 붙어도 아무 일도 일어나지 않는다.
 *
 * product_detail.html은 main.js를 싣지 않으므로 이 동작은 별도 파일로 둔다.
 */
(function () {
    'use strict';

    var MOBILE_QUERY = '(max-width: 768px)';
    var HIDDEN_CLASS = 'mobile-chrome-hidden';

    var HIDE_THRESHOLD = 10;    // 아래 방향 누적 이동량
    var SHOW_THRESHOLD = 6;     // 위 방향 누적 이동량. 되돌리기를 더 민감하게 둔다.
    var TOP_ZONE = 64;          // --header-height. 최상단 근처는 항상 표시
    var BOTTOM_ZONE = 24;       // 문서 끝(푸터) 근처는 항상 표시
    var MIN_SCROLL_RANGE = 240; // 스크롤 여유가 이보다 짧으면 기능을 켜지 않는다

    // 헤더에 앵커된 패널이나 모달이 열려 있으면 바가 사라지면 안 된다.
    var LOCK_SELECTORS = [
        '[data-account-menu-panel]:not([hidden])',
        '[data-settings-menu-panel]:not([hidden])',
        '.modal-open'
    ].join(',');

    var CHROME_SELECTOR = '.header, .mobile-bottom-nav';

    var mediaQuery = window.matchMedia(MOBILE_QUERY);
    var lastY = 0;
    var delta = 0;
    var hidden = false;
    var ticking = false;

    function scrollTop() {
        return Math.max(0, window.scrollY || window.pageYOffset || 0);
    }

    function documentHeight() {
        return Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0
        );
    }

    function isTextEntry(element) {
        var tag = element.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function isLocked() {
        var active = document.activeElement;
        if (active && active.tagName) {
            // 소프트 키보드가 올라오면 뷰포트 리사이즈가 스크롤로 오탐된다.
            if (isTextEntry(active)) {
                return true;
            }
            if (active.closest && active.closest(CHROME_SELECTOR)) {
                return true;
            }
        }
        return Boolean(document.querySelector(LOCK_SELECTORS));
    }

    function setHidden(next) {
        if (hidden === next) {
            return;
        }
        hidden = next;
        document.body.classList.toggle(HIDDEN_CLASS, next);
    }

    function show() {
        delta = 0;
        setHidden(false);
    }

    function update() {
        ticking = false;

        var y = scrollTop();
        var moved = y - lastY;
        lastY = y;

        var viewport = window.innerHeight;
        var height = documentHeight();

        if (!mediaQuery.matches) {
            show();
            return;
        }
        if (height - viewport < MIN_SCROLL_RANGE) {
            show();
            return;
        }
        if (y <= TOP_ZONE) {
            show();
            return;
        }
        if (y + viewport >= height - BOTTOM_ZONE) {
            show();
            return;
        }
        if (isLocked()) {
            show();
            return;
        }
        if (moved === 0) {
            return;
        }

        // 방향이 바뀌면 반대 방향 누적값은 버린다.
        if ((moved > 0) !== (delta > 0)) {
            delta = 0;
        }
        delta += moved;

        if (delta >= HIDE_THRESHOLD) {
            setHidden(true);
        } else if (delta <= -SHOW_THRESHOLD) {
            setHidden(false);
        }
    }

    function requestUpdate() {
        if (ticking) {
            return;
        }
        ticking = true;
        window.requestAnimationFrame(update);
    }

    function reset() {
        lastY = scrollTop();
        show();
    }

    function handleFocusIn(event) {
        var target = event.target;
        if (!target || !target.closest) {
            return;
        }
        // 키보드 포커스가 숨겨진 바 안으로 들어오면 보이지 않는 요소가 포커스된다.
        if (isTextEntry(target) || target.closest(CHROME_SELECTOR)) {
            reset();
        }
    }

    lastY = scrollTop();

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    window.addEventListener('orientationchange', reset);
    window.addEventListener('pageshow', reset);
    window.addEventListener('hashchange', reset);
    document.addEventListener('focusin', handleFocusIn);

    if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', reset);
    } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(reset);
    }
})();
