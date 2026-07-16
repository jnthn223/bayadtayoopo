
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { registerPwaUpdates } from "./lib/pwaUpdate";

  createRoot(document.getElementById("root")!).render(<App />);

  window.addEventListener("load", () => void registerPwaUpdates());
  
