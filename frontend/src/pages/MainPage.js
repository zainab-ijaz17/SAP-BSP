import React from "react";
import { useNavigate } from "react-router-dom";


function MainPage({ user, onLogout }) {
  const navigate = useNavigate();
  
  const navTiles = [
    {
      id: "reel-receiving",
      title: "Reel Receive",
      path: "/reel-receiving"
    },
    {
      id: "reel-transfer",
      title: "Reel Transfer",
      path: "/bsp",
      state: { migoPath: "/reel-transfer-migo" }
    },
  ];

  const handleTileClick = (tile) => {
    navigate(tile.path, tile.state ? { state: tile.state } : undefined);
  };

  return (
    <div className="app-container">
      <div className="main-content">

        {/* Header */}
        <header className="app-header">
          <div className="user-info">
            <div className="user-details">
              <span className="username">{user?.username || "User"}</span>
              <span className="server-info">
                 Server {user?.server || "DEV"} • Client {user?.client || "110"}
              </span>
            </div>

            <button className="logout-btn" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>

        {/* Navigation Tiles */}
    <section className="tiles-container">
      {navTiles.map(tile => (
        <div 
          key={tile.id} 
          className="nav-tile text-tile hover:bg-gray-100 cursor-pointer transition-colors duration-200"
          onClick={() => handleTileClick(tile)}
        >
          <span className="tile-title">{tile.title}</span>
        </div>
      ))}
    </section>

        {/* Dashboard Content */}
        <section className="dashboard-content">






        </section>
      </div>
    </div>
  );
}

export default MainPage;
