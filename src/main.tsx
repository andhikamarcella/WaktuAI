import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ServiceWorkerRegister />
    <App />
  </React.StrictMode>
);
