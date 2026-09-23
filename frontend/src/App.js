import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";
import BspPage from "./pages/BspPage";
import MigoPage from "./pages/MigoPage";
import ReelTransferMigoPage from "./pages/ReelTransferMigoPage";
import CharPage from "./pages/CharPage";
import CharMigoPage from "./pages/CharMigoPage";
import SplashScreen from "./pages/SplashScreen";
import ReelReceivingPage from "./pages/ReelReceivingPage";
import ScanPage from "./pages/ScanPage";
import ReelConfirmPage from "./pages/ReelConfirmPage";
import GrStpo2Page from "./pages/GRposting";

function App() {
  const [user, setUser] = useState(null);

  const handleLogout = () => setUser(null);

  // Protected Route component
  const ProtectedRoute = ({ children }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  return (
    <Router>
      <div className="app-background">
        <Routes>
          <Route 
            path="/" 
            element={
              <SplashScreen user={user} />
            } 
          />
          <Route 
            path="/login" 
            element={
              user ? (
                <Navigate to="/main" replace />
              ) : (
                <LoginPage 
                  onLogin={(userData) => 
                    setUser({
                      ...userData,
                      loginTime: new Date().toLocaleString()
                    })
                  } 
                />
              )
            }
          />
          <Route 
            path="/main" 
            element={
              <ProtectedRoute>
                <MainPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/bsp" 
            element={
              <ProtectedRoute>
                <BspPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/migo"
            element={
              <ProtectedRoute>
                <MigoPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reel-transfer-migo"
            element={
              <ProtectedRoute>
                <ReelTransferMigoPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/char" 
            element={
              <ProtectedRoute>
                <CharPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/char-migo"
            element={
              <ProtectedRoute>
                <CharMigoPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reel-receiving"
            element={
              <ProtectedRoute>
                <ReelReceivingPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <ScanPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reel-confirm"
            element={
              <ProtectedRoute>
                <ReelConfirmPage user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/grstpo2"
            element={
              <ProtectedRoute>
                <GrStpo2Page user={user} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
