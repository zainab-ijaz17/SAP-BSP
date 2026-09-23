import React from "react";

const VARIANT_COLORS = {
  primary: "#3b82f6",
  neutral: "#6b7280",
  success: "#22c55e",
  danger: "#ef4444",
};

const DISABLED_COLOR = "#9ca3af";

function LoadingButton({ onClick, loading, disabled, variant = "primary", children, style, ...rest }) {
  const isDisabled = Boolean(disabled || loading);
  const background = isDisabled ? DISABLED_COLOR : (VARIANT_COLORS[variant] || VARIANT_COLORS.primary);

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        padding: "0.85rem 2rem",
        border: "none",
        borderRadius: "8px",
        background,
        color: "#fff",
        cursor: isDisabled ? "not-allowed" : "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export default LoadingButton;
