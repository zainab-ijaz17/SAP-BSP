// Test file to verify API connectivity
const testConnection = async () => {
  const baseUrl = window.Capacitor ? "https://sap-app-maoe.onrender.com" : "https://sap-app-maoe.onrender.com";
  
  try {
    console.log('Testing connection to:', baseUrl);
    const response = await fetch(`${baseUrl}/api/auth/test`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log('✅ Connection successful!');
      return true;
    } else {
      console.log('❌ Connection failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Connection error:', error);
    return false;
  }
};

// You can run this in browser console to test
window.testAPIConnection = testConnection;
