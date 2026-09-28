import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { UIProvider } from "./context/UIContext.jsx";
import "./styles.css";
import "./capturaNumerica";
import "./tooltips";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UIProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UIProvider>
    </BrowserRouter>
  </React.StrictMode>
);
