// 건강 글 페이지의 상품 줄 ‹ › 단추(사용자 결정 12: PC는 한 줄로 넘기고 단추를 둔다). 글 페이지에만 싣는다(health_post.html의 page_scripts).
// 전역은 남기지 않는다.
//
// 줄(.health-row)마다 단추 묶음(.health-row-nav)은 서버가 숨긴 채(hidden) 그려 둔다. 이 스크립트가 769px 이상에서 줄이 넘칠 때만 보인다.
// 그래서 스크립트가 없거나 휴대폰이면 단추 없이 손(트랙패드, 끌기)으로 넘긴다. 처음과 끝에 닿은 쪽 단추는 disabled다.
// 누르면 보이는 폭의 0.9만큼 넘긴다. 움직임을 줄이도록 설정한 방문자에게는 부드럽게 넘기지 않는다.
// 단추는 <button>이라 키보드(Tab, Enter·Space)로도 쓴다.
(() => {
    const wide = window.matchMedia("(min-width: 769px)");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // 끝에 닿았는지 볼 때 소수점 픽셀 차이를 견딘다.
    const edge = 2;

    const setup = (row) => {
        const track = row.querySelector(".health-cards");
        const nav = row.querySelector(".health-row-nav");
        const prev = nav?.querySelector('[data-dir="prev"]');
        const next = nav?.querySelector('[data-dir="next"]');
        if (!track || !nav || !prev || !next) return;

        const update = () => {
            const overflow = track.scrollWidth - track.clientWidth > edge;
            nav.hidden = !wide.matches || !overflow;
            prev.disabled = track.scrollLeft <= edge;
            next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - edge;
        };

        const page = (direction) => {
            track.scrollBy({
                left: direction * track.clientWidth * 0.9,
                behavior: reduceMotion.matches ? "auto" : "smooth",
            });
        };

        prev.addEventListener("click", () => page(-1));
        next.addEventListener("click", () => page(1));
        track.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        update();
    };

    document.querySelectorAll(".health-row").forEach(setup);
})();
