(() => {
  const saved = localStorage.getItem("blog-admin-theme");
  const theme = saved === "dark" || saved === "light"
    ? saved
    : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
})();
