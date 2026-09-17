import React, { useState } from "react";
import { loginUser } from "../api";
import { servers } from "../config/servers";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [environment, setEnvironment] = useState("prd");
  const [error, setError] = useState("");



  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Set client number based on environment
      const client = environment === 'dev' ? '110' : '300';
      const result = await loginUser(username, password, environment);
      
      // Store credentials in localStorage for later use
      localStorage.setItem('token', result.token);
      localStorage.setItem('username', result.username);
      localStorage.setItem('environment', result.environment);
      
      onLogin({
        ...result,
        client,
        server: environment.toUpperCase()
      });
    } catch (err) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div>
      <div className="login-page">
      <div className="login-container">
        <h2>SAP Login</h2>

        <form onSubmit={handleSubmit}>
          {/* Environment */}
          <div className="form-group">
            <label>Server</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              required
            >
              {servers.map((server) => (
                <option key={server.value} value={server.value}>
                  {server.label}
                </option>
              ))}
            </select>
          </div>

          {/* Username */}
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              placeholder="Enter username"
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              placeholder="Enter password"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Login Button */}
          <button type="submit" className="btn">
            Login
          </button>

          {error && <div className="error-message">{error}</div>}
        </form>
      </div>
      </div>

      <div style={{ position: 'fixed', bottom: '0', left: '0', right: '0', textAlign: 'center', padding: '10px', fontSize: '12px', color: '#666', backgroundColor: '#fff' }}>
        v 1.3.1
      </div>
    </div>
  );
}
