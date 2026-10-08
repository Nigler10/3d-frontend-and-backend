// src/App.jsx
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./styles/order-status-toast.css";
import { CartProvider } from "./context/CartContext";
import { OrderProvider } from "./context/OrderContext";
import { CustomerDialogProvider } from "./context/CustomerDialogContext";

import LandingPage from "./pages/LandingPage";
import BuildBentoPage from "./pages/BuildBentoPage";
import ProductList from "./pages/ProductList";
import ProductDetails from "./pages/ProductDetails";
import NavbarLayout from './components/NavbarLayout';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import PrivateRouter from './components/PrivateRouter';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SessionTimeout from "./components/SessionTimeout";

// Admin Page
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminOrderDetailPage from './pages/admin/AdminOrderDetailPage';
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProductList from "./pages/admin/AdminProductList";
import AdminProductCreate from "./pages/admin/AdminProductCreate";
import AdminProductDetailPage from "./pages/admin/AdminProductDetailPage";
import AdminProductEdit from "./pages/admin/AdminProductEdit";

// Customer Page
import CustomerProfile from "./pages/customer/CustomerProfile";
import CustomerProfileUpdate from "./pages/customer/CustomerProfileUpdate";
import CustomerOrdersPage from "./pages/customer/CustomerOrdersPage";
import CustomerOrderDetailPage from "./pages/customer/CustomerOrderDetailPage";

// Chat
import { UnreadProvider } from "./context/UnreadContext";
import useOrderStatusNotifications from "./hooks/useOrderStatusNotifications";

function App() {
  useOrderStatusNotifications();

  return (
    <CustomerDialogProvider>
      <CartProvider>
        <OrderProvider>
          <UnreadProvider>
            <Router>
              <SessionTimeout />
              <ToastContainer position="bottom-right" autoClose={6000} newestOnTop />
              <Routes>
              <Route path="/" element={<LandingPage />} />

              <Route element={<NavbarLayout />}>
                <Route path="/products" element={<ProductList />} />
                <Route path="/product/:id" element={<ProductDetails />} />

                <Route element={<PrivateRouter />}>
                  <Route path="/build" element={<BuildBentoPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/profile" element={<CustomerProfile />} />
                  <Route path="/profile/edit" element={<CustomerProfileUpdate />} />
                  <Route path="/orders" element={<CustomerOrdersPage />} />
                  <Route path="/orders/:id" element={<CustomerOrderDetailPage />} />
                </Route>

                <Route element={<PrivateRouter adminOnly={true} />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/orders" element={<AdminOrdersPage />} />
                  <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
                  <Route path="/admin/products" element={<AdminProductList />} />
                  <Route path="/admin/products/create" element={<AdminProductCreate />} />
                  <Route path="/admin/products/:id" element={<AdminProductDetailPage />} />
                  <Route path="/admin/products/:id/edit" element={<AdminProductEdit />} />
                </Route>

                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/cart" element={<CartPage />} />
              </Route>
              </Routes>
            </Router>
          </UnreadProvider>
        </OrderProvider>
      </CartProvider>
    </CustomerDialogProvider>
  );
}

export default App;