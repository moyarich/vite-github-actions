import { greet } from "./index";

const root = document.querySelector<HTMLDivElement>("#app");
if (root) root.textContent = greet("world");
