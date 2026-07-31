'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Droplets, ShoppingCart, Package, User, LogOut, Home, Search,
  Plus, Minus, Trash2, QrCode, Loader2, CheckCircle2, Clock, Truck, Sparkles, MapPin, XCircle, Save, Bell
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/constants';
import { io } from 'socket.io-client';
import OrderTimeline from '@/components/shared/order-timeline';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  liter: number;
  stock: number;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  items: { product: { name: string }; quantity: number; unitPrice: number }[];
  address?: { label: string; street: string; city: string };
  driver?: { name: string; phone: string };
}

interface Bottle {
  id: string;
  qrCode: string;
  status: string;
  refillCount: number;
  maxRefills: number;
  events: { type: string; createdAt: string; notes?: string }[];
}

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  isDefault: boolean;
}

interface Promo {
  id: string;
  code: string;
  description: string;
  type: string;
  value: number;
  minOrder: number;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function CustomerPortal() {
  const { user, cart, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal, getCartCount, logout, setPage, currentPage, setUser, notifications, setNotifications, addNotification } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [appliedPromo, setAppliedPromo] = useState<Promo | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [showCardDialog, setShowCardDialog] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [bottleResult, setBottleResult] = useState<Bottle | null>(null);
  const [showBottleDialog, setShowBottleDialog] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [newAddress, setNewAddress] = useState({ label: 'Home', street: '', city: '' });
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const page = currentPage || 'shop';

  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchAddresses();
    fetchNotifications();
    const refreshInterval = setInterval(() => {
      fetchProducts();
      fetchOrders();
      fetchAddresses();
      fetchNotifications();
    }, 15000);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfilePhone(user.phone || '');
    }
  }, [user]);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) return;
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders/list');
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      toast.error('Failed to load orders');
    }
  };

  const fetchAddresses = async () => {
    try {
      const res = await fetch('/api/user/addresses');
      if (!res.ok) return;
      const data = await res.json();
      setAddresses(data.addresses || []);
      const defaultAddr = data.addresses?.find((a: Address) => a.isDefault);
      if (defaultAddr) setSelectedAddress(defaultAddr.id);
    } catch {}
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {}
  };

  const markNotificationRead = async (id: string) => {
    try {
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      setNotifications(notifications.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  const applyPromo = async () => {
    if (!promoCode.trim()) {
      toast.error('Enter a promo code');
      return;
    }
    try {
      const res = await fetch('/api/promos/active');
      if (!res.ok) return;
      const data = await res.json();
      const promo = data.promos?.find((p: Promo) => p.code.toLowerCase() === promoCode.toLowerCase());
      if (!promo) {
        toast.error('Invalid promo code');
        setDiscount(0);
        setAppliedPromo(null);
        return;
      }
      const subtotal = getCartTotal();
      if (subtotal < promo.minOrder) {
        toast.error(`Minimum order ${formatCurrency(promo.minOrder)} required`);
        setDiscount(0);
        setAppliedPromo(null);
        return;
      }
      let disc = 0;
      if (promo.type === 'percentage') {
        disc = subtotal * (promo.value / 100);
      } else {
        disc = Math.min(promo.value, subtotal);
      }
      setDiscount(disc);
      setAppliedPromo(promo);
      toast.success(`Promo applied! You save ${formatCurrency(disc)}`);
    } catch {
      toast.error('Failed to validate promo code');
    }
  };

  const removePromo = () => {
    setDiscount(0);
    setAppliedPromo(null);
    setPromoCode('');
    toast.info('Promo removed');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    if (paymentMethod === 'card') {
      setShowCardDialog(true);
      return;
    }

    await processOrder();
  };

  const confirmCardPayment = async () => {
    setShowCardDialog(false);
    await processOrder();
  };

  const processOrder = async () => {
    setLoading(true);
    try {
      const orderRes = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
          addressId: selectedAddress || undefined,
          paymentMethod,
          promoCode: appliedPromo?.code || undefined,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error);

      const checkoutRes = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderData.order.id }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.error);

      try {
        const wsUrl = typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:3003`
          : 'http://localhost:3003';
        const socket = io(wsUrl);
        socket.on('connect', () => {
          socket.emit('send-notification', {
            role: 'admin',
            notification: {
              type: 'new_order',
              title: 'New Order Placed',
              message: `Order #${orderData.order.id.slice(0, 8)} by ${user?.name}`,
              orderId: orderData.order.id,
            },
          });
          socket.disconnect();
        });
      } catch {}

      clearCart();
      setDiscount(0);
      setAppliedPromo(null);
      setPromoCode('');
      fetchOrders();
      toast.success('Order placed successfully!');
      setPage('orders');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel');
      }
      toast.success('Order cancelled');
      fetchOrders();
      setSelectedOrder(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel order');
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, phone: profilePhone }),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      const data = await res.json();
      setUser(data.user);
      toast.success('Profile updated!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const addAddress = async () => {
    if (!newAddress.street || !newAddress.city) {
      toast.error('Street and city are required');
      return;
    }
    try {
      const res = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAddress, isDefault: addresses.length === 0 }),
      });
      if (!res.ok) throw new Error('Failed to add address');
      toast.success('Address added');
      setShowAddressDialog(false);
      setNewAddress({ label: 'Home', street: '', city: '' });
      fetchAddresses();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add address');
    }
  };

  const lookupBottle = async () => {
    if (!qrInput.trim()) {
      toast.error('Enter a QR code');
      return;
    }
    try {
      const res = await fetch(`/api/bottles/lookup?qr=${qrInput}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBottleResult(data.bottle);
      setShowBottleDialog(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bottle not found');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DELIVERED': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'IN_TRANSIT': return <Truck className="w-5 h-5 text-amber-400" />;
      default: return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="spinner" />
          <p className="text-gray-400">Loading...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-mesh">
      {/* Header */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        className="glass sticky top-0 z-40 border-b border-white/5"
      >
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-water flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">AquaTrack</span>
          </div>
          <div className="flex items-center gap-4">
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-gray-300 hidden sm:block"
            >
              Hi, {user?.name?.split(' ')[0]}
            </motion.span>
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="relative p-2 rounded-xl hover:bg-white/10 transition-colors"
              >
                <Bell className="w-5 h-5 text-gray-300" />
                {notifications.filter((n) => !n.isRead).length > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold"
                  >
                    {notifications.filter((n) => !n.isRead).length}
                  </motion.span>
                )}
              </motion.button>
              {showNotifPanel && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="absolute right-0 top-12 w-80 glass-strong border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-bold text-white">Notifications</h3>
                    <Button variant="ghost" size="sm" onClick={() => { notifications.filter((n) => !n.isRead).forEach((n) => markNotificationRead(n.id)); setShowNotifPanel(false); }} className="text-xs text-cyan-400 hover:text-cyan-300">
                      Mark all read
                    </Button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                        No notifications
                      </div>
                    ) : (
                      notifications.slice(0, 20).map((notif) => (
                        <div key={notif.id} onClick={() => { markNotificationRead(notif.id); if (notif.orderId) { setPage('orders'); setShowNotifPanel(false); } }} className={`p-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!notif.isRead ? 'bg-cyan-500/5' : ''}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!notif.isRead ? 'bg-cyan-400' : 'bg-gray-600'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{notif.title}</p>
                              <p className="text-xs text-gray-400 truncate">{notif.message}</p>
                              <p className="text-xs text-gray-600 mt-1">{formatDateTime(notif.createdAt)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={logout} className="text-gray-400 hover:text-white hover:bg-white/10">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 glass-strong z-40 md:hidden border-t border-white/10">
        <div className="grid grid-cols-5 gap-1 p-2">
          {[
            { id: 'shop', icon: Home, label: 'Shop' },
            { id: 'scan', icon: QrCode, label: 'Scan' },
            { id: 'cart', icon: ShoppingCart, label: 'Cart', badge: getCartCount() },
            { id: 'orders', icon: Package, label: 'Orders' },
            { id: 'profile', icon: User, label: 'Profile' },
          ].map((navItem) => (
            <motion.button
              key={navItem.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => setPage(navItem.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                page === navItem.id
                  ? 'bg-gradient-to-b from-cyan-500/20 to-transparent text-cyan-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <div className="relative">
                <navItem.icon className="w-5 h-5" />
                {navItem.badge ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold"
                  >
                    {navItem.badge}
                  </motion.span>
                ) : null}
              </div>
              <span className="text-xs font-medium">{navItem.label}</span>
            </motion.button>
          ))}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <div className="hidden md:block fixed left-0 top-0 bottom-0 w-72 glass-strong z-30 border-r border-white/10">
        <div className="p-6 space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl gradient-water flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-2xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">AquaTrack</span>
          </div>
          <nav className="space-y-2">
            {[
              { id: 'shop', icon: Home, label: 'Shop' },
              { id: 'scan', icon: QrCode, label: 'QR Scanner' },
              { id: 'cart', icon: ShoppingCart, label: `Cart (${getCartCount()})` },
              { id: 'orders', icon: Package, label: 'My Orders' },
              { id: 'profile', icon: User, label: 'Profile' },
            ].map((navItem) => (
              <motion.button
                key={navItem.id}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPage(navItem.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                  page === navItem.id
                    ? 'bg-gradient-to-r from-cyan-500/20 to-transparent text-cyan-400 nav-active'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <navItem.icon className="w-5 h-5" />
                <span className="font-medium">{navItem.label}</span>
              </motion.button>
            ))}
          </nav>
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="w-full justify-start text-gray-400 hover:text-white hover:bg-white/10">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="md:ml-72 pb-28 md:pb-8 p-4 md:p-8">
        <AnimatePresence mode="wait">
          {/* Shop Page */}
          {page === 'shop' && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <Sparkles className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">Water Products</h2>
              </div>
              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {products.map((product) => (
                  <motion.div key={product.id} variants={item}>
                    <motion.div
                      className="card-modern overflow-hidden group"
                      whileHover={{ y: -8 }}
                    >
                      <div className="h-40 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center relative overflow-hidden">
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <Droplets className="w-16 h-16 text-cyan-400/60" />
                        </motion.div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        <div className="absolute bottom-3 left-3 right-3">
                          <span className="text-xs font-medium text-cyan-300 bg-cyan-500/20 px-2 py-1 rounded-full">{product.liter}L</span>
                        </div>
                      </div>
                      <div className="p-5">
                        <h3 className="font-bold text-lg text-white mb-1">{product.name}</h3>
                        <p className="text-sm text-gray-400 mb-4">{product.description}</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{formatCurrency(product.price)}</span>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => addToCart(product)}
                            className="btn-primary flex items-center gap-2 text-sm"
                          >
                            <Plus className="w-4 h-4" />
                            Add
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* QR Scanner Page */}
          {page === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto"
            >
              <h2 className="text-3xl font-bold text-white mb-8">QR Scanner</h2>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="card-modern p-6"
              >
                <h3 className="text-lg font-bold text-white mb-2">Scan Bottle QR Code</h3>
                <p className="text-sm text-gray-400 mb-6">Enter or scan a bottle QR code to view its history</p>
                <div className="flex gap-3 mb-6">
                  <Input
                    placeholder="Enter QR code (e.g., AQUA-0001)"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && lookupBottle()}
                    className="input-modern flex-1"
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={lookupBottle}
                    className="btn-primary"
                  >
                    <Search className="w-5 h-5" />
                  </motion.button>
                </div>
                <div className="text-center py-8 rounded-2xl bg-white/5 border border-white/10">
                  <QrCode className="w-20 h-20 mx-auto mb-3 text-gray-600" />
                  <p className="text-sm text-gray-500">Camera not available in demo mode</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Cart Page */}
          {page === 'cart' && (
            <motion.div
              key="cart"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <h2 className="text-3xl font-bold text-white mb-8">Shopping Cart</h2>
              {cart.length === 0 ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card-modern p-12 text-center"
                >
                  <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400 mb-4">Your cart is empty</p>
                  <Button variant="link" onClick={() => setPage('shop')} className="text-cyan-400 hover:text-cyan-300">
                    Browse Products
                  </Button>
                </motion.div>
              ) : (
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
                  {cart.map((cartItem) => (
                    <motion.div key={cartItem.id} variants={item} layout>
                      <motion.div className="card-modern p-4" whileHover={{ scale: 1.01 }}>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                            <Droplets className="w-8 h-8 text-cyan-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-white">{cartItem.name}</h3>
                            <p className="text-sm text-gray-400">{cartItem.liter}L</p>
                            <p className="text-cyan-400 font-semibold">{formatCurrency(cartItem.price)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => updateQuantity(cartItem.id, cartItem.quantity - 1)}
                              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                            >
                              <Minus className="w-4 h-4" />
                            </motion.button>
                            <span className="w-8 text-center font-bold text-white">{cartItem.quantity}</span>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
                              className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => removeFromCart(cartItem.id)}
                              className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-colors ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  ))}

                  {/* Promo Code */}
                  <motion.div variants={item} className="card-modern p-4">
                    {appliedPromo ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">
                            {appliedPromo.code}
                          </Badge>
                          <span className="text-sm text-green-400">-{formatCurrency(discount)}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={removePromo} className="text-red-400 hover:text-red-300">
                          <XCircle className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <Input
                          placeholder="Promo code"
                          value={promoCode}
                          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === 'Enter' && applyPromo()}
                          className="input-modern flex-1"
                        />
                        <Button variant="outline" onClick={applyPromo} className="border-white/20 hover:bg-white/10 text-white">
                          Apply
                        </Button>
                      </div>
                    )}
                  </motion.div>

                  {/* Address Selection */}
                  <motion.div variants={item} className="card-modern p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-cyan-400" />
                        Delivery Address
                      </h4>
                      <Button variant="ghost" size="sm" onClick={() => setShowAddressDialog(true)} className="text-cyan-400 hover:text-cyan-300">
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    </div>
                    {addresses.length === 0 ? (
                      <p className="text-sm text-gray-500">No addresses saved. Add one to continue.</p>
                    ) : (
                      <Select value={selectedAddress} onValueChange={setSelectedAddress}>
                        <SelectTrigger className="input-modern">
                          <SelectValue placeholder="Select address" />
                        </SelectTrigger>
                        <SelectContent>
                          {addresses.map((addr) => (
                            <SelectItem key={addr.id} value={addr.id}>
                              {addr.label}: {addr.street}, {addr.city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </motion.div>

                  {/* Payment Method */}
                  <motion.div variants={item} className="card-modern p-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-3">Payment Method</h4>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="input-modern">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash on Delivery</SelectItem>
                        <SelectItem value="card">Pay Online (Credit/Debit Card)</SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>

                  {/* Totals */}
                  <motion.div variants={item} className="card-modern p-5 space-y-3">
                    <div className="flex justify-between text-gray-300">
                      <span>Subtotal</span>
                      <span>{formatCurrency(getCartTotal())}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount ({appliedPromo?.code})</span>
                        <span>-{formatCurrency(discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-bold border-t border-white/10 pt-3">
                      <span className="text-white">Total</span>
                      <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{formatCurrency(getCartTotal() - discount)}</span>
                    </div>
                  </motion.div>

                  <motion.button
                    variants={item}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCheckout}
                    disabled={loading}
                    className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    Proceed to Checkout
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Orders Page */}
          {page === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h2 className="text-3xl font-bold text-white mb-8">My Orders</h2>
              {orders.length === 0 ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card-modern p-12 text-center"
                >
                  <Package className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400 mb-4">No orders yet</p>
                  <Button variant="link" onClick={() => setPage('shop')} className="text-cyan-400 hover:text-cyan-300">
                    Place Your First Order
                  </Button>
                </motion.div>
              ) : (
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
                  {orders.map((order) => (
                    <motion.div key={order.id} variants={item}>
                      <motion.div
                        className="card-modern p-5 cursor-pointer"
                        whileHover={{ scale: 1.01, x: 4 }}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {getStatusIcon(order.status)}
                            <div>
                              <p className="font-bold text-white">Order #{order.id.slice(0, 8)}</p>
                              <p className="text-sm text-gray-400">{formatDate(order.createdAt)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{formatCurrency(order.finalAmount)}</p>
                            <Badge className={ORDER_STATUS_COLORS[order.status]}>
                              {ORDER_STATUS_LABELS[order.status]}
                            </Badge>
                          </div>
                        </div>
                        {order.status === 'PENDING' && (
                          <div className="mt-3 pt-3 border-t border-white/10">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelOrder(order.id);
                              }}
                              className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Cancel Order
                            </Button>
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Profile Page */}
          {page === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto"
            >
              <h2 className="text-3xl font-bold text-white mb-8">Profile</h2>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="card-modern p-6"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/25">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{user?.name}</h3>
                    <p className="text-gray-400">{user?.email}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Name</label>
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      className="input-modern"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Phone</label>
                    <Input
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      placeholder="+971..."
                      className="input-modern"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="w-full btn-primary flex items-center justify-center gap-2"
                  >
                    {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </motion.button>
                  <Button
                    variant="outline"
                    className="w-full border-white/20 hover:bg-white/10 text-white"
                    onClick={logout}
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg glass-strong border-white/10 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">Order #{selectedOrder?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <h4 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  Order Tracking
                </h4>
                <OrderTimeline currentStatus={selectedOrder.status} />
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-300">Items</h4>
                {selectedOrder.items.map((orderItem, i) => (
                  <div key={i} className="flex justify-between text-gray-300 p-2 rounded-lg bg-white/5">
                    <span>{orderItem.product.name} x {orderItem.quantity}</span>
                    <span>{formatCurrency(orderItem.unitPrice * orderItem.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg">
                  <span className="text-white">Total</span>
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{formatCurrency(selectedOrder.finalAmount)}</span>
                </div>
              </div>

              {selectedOrder.driver && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Driver: {selectedOrder.driver.name}</p>
                    <p className="text-sm text-gray-400">{selectedOrder.driver.phone}</p>
                  </div>
                </div>
              )}

              {selectedOrder.address && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-sm font-medium text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    Delivery Address
                  </p>
                  <p className="text-sm text-gray-400 mt-1">{selectedOrder.address.street}, {selectedOrder.address.city}</p>
                </div>
              )}

              {selectedOrder.status === 'PENDING' && (
                <div className="pt-2">
                  <Button
                    variant="destructive"
                    className="w-full bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                    onClick={() => cancelOrder(selectedOrder.id)}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel Order
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bottle Lookup Dialog */}
      <Dialog open={showBottleDialog} onOpenChange={setShowBottleDialog}>
        <DialogContent className="max-w-md glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">Bottle Details</DialogTitle>
          </DialogHeader>
          {bottleResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-400">QR Code</p>
                  <p className="font-mono font-medium text-white">{bottleResult.qrCode}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-400">Status</p>
                  <Badge className="mt-1">{bottleResult.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-400">Refill Count</p>
                  <p className="font-medium text-white">{bottleResult.refillCount} / {bottleResult.maxRefills}</p>
                </div>
              </div>
              <div>
                <p className="font-medium text-white mb-2">History</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {bottleResult.events.map((event, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                      <span className="flex-1 text-gray-300">{event.type}</span>
                      <span className="text-gray-500">{formatDateTime(event.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Address Dialog */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent className="max-w-md glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Add Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Label</label>
              <Select value={newAddress.label} onValueChange={(v) => setNewAddress({ ...newAddress, label: v })}>
                <SelectTrigger className="input-modern">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Home">Home</SelectItem>
                  <SelectItem value="Office">Office</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Street Address</label>
              <Input
                value={newAddress.street}
                onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })}
                placeholder="Street address"
                className="input-modern"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">City</label>
              <Input
                value={newAddress.city}
                onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                placeholder="City"
                className="input-modern"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowAddressDialog(false)} className="flex-1 border-white/20 text-gray-300">
                Cancel
              </Button>
              <Button onClick={addAddress} className="flex-1 btn-primary">
                Add Address
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Card Payment Dialog */}
      <Dialog open={showCardDialog} onOpenChange={setShowCardDialog}>
        <DialogContent className="max-w-md glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Enter Card Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Card Number</label>
              <Input
                placeholder="Card Number"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="input-modern"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Expiry Date</label>
                <Input
                  placeholder="MM/YY"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  className="input-modern"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">CVV</label>
                <Input
                  placeholder="CVV"
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  className="input-modern"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowCardDialog(false)} className="flex-1 border-white/20 text-gray-300">
                Cancel
              </Button>
              <Button
                onClick={confirmCardPayment}
                disabled={loading}
                className="flex-1 btn-primary"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Confirm & Pay
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
