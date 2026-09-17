import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function SplashScreen({ user }) {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      if (user) {
        navigate("/main", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    }, 5000);

    return () => clearTimeout(t);
  }, [navigate, user]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #679be9ff 0%, #5b80b7ff 100%)",
        padding: "24px"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: "16px",
          padding: "28px",
          textAlign: "center",
          boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
          color: "#fff"
        }}
      >
        <img
          src="/SAP_2011_logo.svg.png"
          alt="SAP"
          style={{ width: "180px", maxWidth: "100%", height: "auto" }}
        />

        <div style={{ marginTop: "18px", fontSize: "1.1rem", fontWeight: 600 }}>
          Welcome
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
