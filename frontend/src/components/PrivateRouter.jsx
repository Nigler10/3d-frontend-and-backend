// src/components/PrivateRouter.jsx
import { Navigate, Outlet, } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { getAccessToken } from "../utils/auth";

export default function PrivateRouter({
  redirectTo = "/login",
  adminOnly = false,
}) {
  if (
    import.meta.env.DEV &&
    new URLSearchParams(
      window.location.search
    ).get("preview") === "1"
  ) {
    return <Outlet />;
  }

  const token = getAccessToken();

  if (!token) {
    return (
      <Navigate
        to={redirectTo}
        replace
      />
    );
  }

  if (adminOnly) {
    try {
      const payload =
        jwtDecode(token);

      if (!payload?.is_staff) {
        return (
          <Navigate
            to="/"
            replace
          />
        );
      }
    } catch (err) {
      console.error(
        "Invalid access token:",
        err
      );

      return (
        <Navigate
          to={redirectTo}
          replace
        />
      );
    }
  }

  return <Outlet />;
}