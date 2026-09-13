import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PromptOptimizerApp } from "./PromptOptimizerApp";
import "./styles/theme.css";

const isOptimizerWindow = new URLSearchParams(window.location.search).get("window") === "prompt-optimizer";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOptimizerWindow ? <PromptOptimizerApp /> : <App />}</React.StrictMode>,
);
