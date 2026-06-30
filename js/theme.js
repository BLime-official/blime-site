(() => {
    function getTheme() {
        return document.documentElement.getAttribute("data-theme")
            || localStorage.getItem("theme")
            || "light";
    }

    function setTheme(nextTheme) {
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("theme", nextTheme);
        window.dispatchEvent(new CustomEvent("blime:theme-changed", { detail: { theme: nextTheme } }));
        return nextTheme;
    }

    function toggleTheme() {
        const nextTheme = getTheme() === "dark" ? "light" : "dark";
        return setTheme(nextTheme);
    }

    function initTheme() {
        const savedTheme = localStorage.getItem("theme") || "light";
        document.documentElement.setAttribute("data-theme", savedTheme);

        const themeToggle = document.querySelector('.theme-toggle');
        themeToggle?.addEventListener('click', () => toggleTheme());
    }

    window.BLIME_THEME = {
        getTheme,
        setTheme,
        toggleTheme,
    };

    document.addEventListener("DOMContentLoaded", initTheme);
})();
