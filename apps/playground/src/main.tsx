import React from "react";
import { createRoot } from "react-dom/client";
import { greet } from "../../../packages/example/src/index";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main>
      <h1>Monorepo playground</h1>
      <p>{greet("monorepo")}</p>
    </main>
  </React.StrictMode>,
);
