import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import App from './AppOriginal';
import Login from './Login';

function AppRouter() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/search" element={<App />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default AppRouter;
