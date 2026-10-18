console.log("IT'S ALIVE!");

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const BASE_PATH =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/" // Local server
    : "/portfolio/"; // GitHub Pages repo name

let pages = [
  { url: "", title: "Resume" },
  { url: "projects/", title: "Projects" },
  { url: "contact/", title: "Contact" },
  { url: "https://github.com/shriku-o", title: "GitHub" },
];

let nav = document.createElement("nav");
document.body.prepend(nav);

function normalize(path) {
  return path.replace(/index\.html$/, "");
}

for (let p of pages) {
  let url = p.url;
  let title = p.title;

  url = !url.startsWith("http") ? BASE_PATH + url : url;

  let a = document.createElement("a");
  a.href = url;
  a.textContent = title;
  nav.append(a);

  a.classList.toggle(
    "current",
    a.host === location.host &&
      normalize(a.pathname) === normalize(location.pathname),
  );

  if (a.host !== location.host) {
    a.target = "_blank";
  }
}