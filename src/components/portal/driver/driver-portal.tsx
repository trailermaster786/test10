'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets, Package, Truck, LogOut, Home, Search, QrCode,
  Loader2, CheckCircle2, Clock, UserCheck, Phone, MapPin, Sparkles, Bell, Save
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  BOTTLE_STATUS_LABELS, BOTTLE_STATUS_COLORS,
} from '@/lib/constants';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  finalAmount: number;
  paymentMethod: string;
  createdAt: string;
  user: { name: string; phone?: string; email: string };
  address?: { label: string; street: string; city: string };
  items: { product: { name: string }; quantity: number; unitPrice: number }[];
}

interface Bottle {
  id: string;
  qrCode: string;
  status: string;
  refillCount: number;
  maxRefills: number;
  events: { type: string; createdAt: string; notes?: string }[];
}

interface Product {
  id: string;
  name: string;
  price: number;
  liter: number;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariant = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function DriverPortal() {
  const { user, logout, setPage, currentPage, notifications, setNotifications, addNotification } = useAppStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrInput, setQrInput] = useState('');
  const [scanType, setScanType] = useState<string>('LOADED');
  const [scanning, setScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [bottleResult, setBottleResult] = useState<Bottle | null>(null);
  const [showBottleDialog, setShowBottleDialog] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [onBehalfCustomerId, setOnBehalfCustomerId] = useState('');
  const [onBehalfProduct, setOnBehalfProduct] = useState('');
  const [onBehalfQty, setOnBehalfQty] = useState(1);
  const [onBehalfLoading, setOnBehalfLoading] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const page = currentPage || 'manifest';

  useEffect(() => {
    fetchManifest();
    fetchProducts();
    fetchNotifications();
    const refreshInterval = setInterval(() => {
      fetchManifest();
      fetchProducts();
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

  const fetchManifest = async () => {
    try {
      const res = await fetch('/api/drivers/manifest');
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      toast.error('Failed to load manifest');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) return;
      const data = await res.json();
      setProducts(data.products || []);
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

  const saveProfile = async () => {
    if (!profileName.trim()) { toast.error('Name is required'); return; }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: profileName, phone: profilePhone }) });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      useAppStore.getState().setUser(data.user);
      toast.success('Profile updated');
    } catch { toast.error('Failed to save profile'); }
    finally { setSavingProfile(false); }
  };

  const scanBottle = async () => {
    if (!qrInput.trim()) {
      toast.error('Enter a QR code');
      return;
    }

    setScanning(true);
    try {
      const res = await fetch('/api/bottles/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: qrInput,
          type: scanType,
          notes: `Scanned by ${user?.name}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success(`Bottle ${scanType.toLowerCase()} successfully`);
      setQrInput('');

      const lookupRes = await fetch(`/api/bottles/lookup?qr=${qrInput}`);
      const lookupData = await lookupRes.json();
      if (lookupRes.ok) {
        setBottleResult(lookupData.bottle);
        setShowBottleDialog(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Order status updated');
      fetchManifest();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const searchCustomers = async () => {
    if (!searchQuery.trim()) {
      toast.error('Enter a search term');
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) return;
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const placeOnBehalfOrder = async () => {
    if (!onBehalfCustomerId) {
      toast.error('Select a customer');
      return;
    }
    if (!onBehalfProduct) {
      toast.error('Select a product');
      return;
    }

    setOnBehalfLoading(true);
    try {
      const product = products.find((p) => p.id === onBehalfProduct);
      if (!product) throw new Error('Product not found');

      const orderRes = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: onBehalfProduct, quantity: onBehalfQty }],
          paymentMethod: 'cash',
          notes: `Placed on behalf by ${user?.name}`,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error);

      toast.success(`Order placed for customer (Order #${orderData.order.id.slice(0, 8)})`);
      setOnBehalfCustomerId('');
      setOnBehalfProduct('');
      setOnBehalfQty(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setOnBehalfLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'IN_TRANSIT':
        return <Truck className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="spinner" />
          <p className="text-gray-400">Loading manifest...</p>
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
            <span className="font-bold text-xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              AquaTrack Driver
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-300 hidden sm:block">
              Hi, {user?.name?.split(' ')[0]}
            </span>
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
                        <div key={notif.id} onClick={() => { markNotificationRead(notif.id); if (notif.orderId) { setPage('manifest'); setShowNotifPanel(false); } }} className={`p-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!notif.isRead ? 'bg-cyan-500/5' : ''}`}>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="text-gray-400 hover:text-white hover:bg-white/10"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Sidebar - Desktop */}
      <div className="hidden md:block fixed left-0 top-0 bottom-0 w-72 glass-strong z-30 border-r border-white/10">
        <div className="p-6 space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl gradient-water flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-2xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              AquaTrack
            </span>
          </div>

          <nav className="space-y-2">
            {[
              { id: 'manifest', icon: Package, label: 'Delivery Manifest' },
              { id: 'scan', icon: QrCode, label: 'Scan Bottles' },
              { id: 'lookup', icon: Search, label: 'Customer Lookup' },
              { id: 'onbehalf', icon: UserCheck, label: 'On-Behalf Order' },
              { id: 'profile', icon: UserCheck, label: 'Profile' },
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
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="w-full justify-start text-gray-400 hover:text-white hover:bg-white/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 glass-strong z-40 md:hidden border-t border-white/10">
        <div className="grid grid-cols-4 gap-1 p-2">
          {[
            { id: 'manifest', icon: Package, label: 'Manifest' },
            { id: 'scan', icon: QrCode, label: 'Scan' },
            { id: 'lookup', icon: Search, label: 'Lookup' },
            { id: 'profile', icon: UserCheck, label: 'Profile' },
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
              <navItem.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{navItem.label}</span>
            </motion.button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-72 pb-24 md:pb-8 p-4 md:p-8">
        <AnimatePresence mode="wait">
          {/* Manifest Page */}
          {page === 'manifest' && (
            <motion.div
              key="manifest"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <Sparkles className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">Delivery Manifest</h2>
              </div>
              <p className="text-gray-400">{orders.length} deliveries assigned</p>

              {orders.length === 0 ? (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="card-modern p-12 text-center"
                >
                  <Package className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                  <p className="text-gray-400">No deliveries assigned</p>
                </motion.div>
              ) : (
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="space-y-4"
                >
                  {orders.map((order) => (
                    <motion.div
                      key={order.id}
                      variants={itemVariant}
                      whileHover={{ scale: 1.01, x: 4 }}
                    >
                      <div
                        className="card-modern p-5 cursor-pointer"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            {getStatusIcon(order.status)}
                            <div>
                              <p className="font-medium text-white">{order.user?.name || 'Unknown'}</p>
                              <p className="text-sm text-gray-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {order.address?.street}, {order.address?.city}
                              </p>
                              <p className="text-sm text-gray-400 flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {order.user.phone || 'No phone'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge className={ORDER_STATUS_COLORS[order.status]}>
                              {ORDER_STATUS_LABELS[order.status]}
                            </Badge>
                            <p className="text-sm text-gray-400 mt-1">
                              {formatCurrency(order.finalAmount)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p className="text-sm text-gray-400">
                            {order.items
                              .map((item) => `${item.quantity}x ${item.product.name}`)
                              .join(', ')}
                          </p>
                        </div>

                        {order.status === 'IN_TRANSIT' && (
                          <div className="mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateOrderStatus(order.id, 'DELIVERED');
                              }}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Mark Delivered
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Scan Page */}
          {page === 'scan' && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <QrCode className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">Scan Bottles</h2>
              </div>

              <div className="card-modern p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">QR Scanner</h3>
                  <p className="text-sm text-gray-400">Scan or enter bottle QR codes</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Scan Type</label>
                  <Select value={scanType} onValueChange={setScanType}>
                    <SelectTrigger className="input-modern">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOADED">Stock-In (Load onto truck)</SelectItem>
                      <SelectItem value="DELIVERED">Stock-Out (Deliver to customer)</SelectItem>
                      <SelectItem value="RETURNED">Returns (Collect from customer)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">QR Code</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter QR code (e.g., AQUA-0001)"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && scanBottle()}
                      className="input-modern"
                    />
                    <Button onClick={scanBottle} disabled={scanning} className="btn-primary">
                      {scanning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <QrCode className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="text-center py-6">
                  <QrCode className="w-20 h-20 mx-auto text-gray-600 mb-2" />
                  <p className="text-sm text-gray-500">Camera not available in demo mode</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="card-modern p-6">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScanType('LOADED')}
                    className={
                      scanType === 'LOADED'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'border-white/10 text-gray-400'
                    }
                  >
                    Stock-In
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScanType('DELIVERED')}
                    className={
                      scanType === 'DELIVERED'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'border-white/10 text-gray-400'
                    }
                  >
                    Stock-Out
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScanType('RETURNED')}
                    className={
                      scanType === 'RETURNED'
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                        : 'border-white/10 text-gray-400'
                    }
                  >
                    Returns
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Customer Lookup Page */}
          {page === 'lookup' && (
            <motion.div
              key="lookup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <Search className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">Customer Lookup</h2>
              </div>

              {/* Search */}
              <div className="card-modern p-6">
                <h3 className="text-lg font-semibold text-white mb-3">Search Customers</h3>
                <p className="text-sm text-gray-400 mb-4">Search by name, email, or phone</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchCustomers()}
                    className="input-modern"
                  />
                  <Button className="btn-primary" onClick={searchCustomers} disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="card-modern p-6">
                  <h3 className="text-sm font-semibold text-white mb-3">Results ({searchResults.length})</h3>
                  <div className="space-y-3">
                    {searchResults.map((customer) => (
                      <div key={customer.id} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">{customer.name}</p>
                          <p className="text-sm text-gray-400">{customer.email}</p>
                          {customer.phone && (
                            <p className="text-sm text-gray-400 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {customer.phone}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOnBehalfCustomerId(customer.id);
                            setPage('onbehalf');
                            toast.info(`Selected ${customer.name} for on-behalf order`);
                          }}
                          className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                        >
                          Order For
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !searching && (
                <div className="card-modern p-8 text-center">
                  <Search className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                  <p className="text-gray-400">No customers found</p>
                </div>
              )}
            </motion.div>
          )}

          {/* On-Behalf Order Page */}
          {page === 'onbehalf' && (
            <motion.div
              key="onbehalf"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <UserCheck className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">On-Behalf Order</h2>
              </div>

              <div className="card-modern p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Place Order for Customer</h3>
                  <p className="text-sm text-gray-400">
                    Place an order on behalf of a customer (e.g., phone order)
                  </p>
                </div>

                {onBehalfCustomerId && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <p className="text-sm text-cyan-400">Customer selected from lookup</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Customer ID</label>
                    <Input
                      placeholder="Select customer from Lookup page or enter ID"
                      value={onBehalfCustomerId}
                      onChange={(e) => setOnBehalfCustomerId(e.target.value)}
                      className="input-modern"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Product</label>
                    <Select value={onBehalfProduct} onValueChange={setOnBehalfProduct}>
                      <SelectTrigger className="input-modern">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} - {formatCurrency(p.price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Quantity</label>
                    <Input
                      type="number"
                      min="1"
                      value={onBehalfQty}
                      onChange={(e) => setOnBehalfQty(parseInt(e.target.value) || 1)}
                      className="input-modern"
                    />
                  </div>

                  <Button
                    className="w-full btn-primary"
                    onClick={placeOnBehalfOrder}
                    disabled={onBehalfLoading}
                  >
                    {onBehalfLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Package className="w-4 h-4 mr-2" />
                    )}
                    Place Order
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Profile Page */}
          {page === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <UserCheck className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">Profile</h2>
              </div>

              <div className="card-modern p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Truck className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{user?.name}</h3>
                    <p className="text-gray-400">{user?.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Name</label>
                    <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your name" className="bg-white/5 border-white/10 text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Phone</label>
                    <Input value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} placeholder="+971..." className="bg-white/5 border-white/10 text-white" />
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-gray-500 mb-1">Role</p>
                    <p className="font-medium text-white capitalize">{user?.role}</p>
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
                </div>

                <Button
                  variant="ghost"
                  className="w-full mt-6 text-gray-400 hover:text-white hover:bg-white/10"
                  onClick={logout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Delivery Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <Badge className={ORDER_STATUS_COLORS[selectedOrder.status]}>
                {ORDER_STATUS_LABELS[selectedOrder.status]}
              </Badge>

              <div className="space-y-2">
                <p className="font-medium text-white">{selectedOrder.user.name}</p>
                <p className="text-sm text-gray-400 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {selectedOrder.user.phone || 'No phone'}
                </p>
                {selectedOrder.address && (
                  <p className="text-sm text-gray-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedOrder.address.street}, {selectedOrder.address.city}
                  </p>
                )}
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                {selectedOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-300">
                      {item.product.name} x {item.quantity}
                    </span>
                    <span className="text-gray-300">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between font-bold">
                  <span className="text-white">Total</span>
                  <span className="text-cyan-400">
                    {formatCurrency(selectedOrder.finalAmount)}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Payment: {selectedOrder.paymentMethod}
                </p>
              </div>

              {selectedOrder.status === 'IN_TRANSIT' && (
                <Button
                  className="w-full btn-primary"
                  onClick={() => {
                    updateOrderStatus(selectedOrder.id, 'DELIVERED');
                    setSelectedOrder(null);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Confirm Delivery
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bottle Lookup Dialog */}
      <Dialog open={showBottleDialog} onOpenChange={setShowBottleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Bottle Scanned</DialogTitle>
          </DialogHeader>
          {bottleResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">QR Code</p>
                  <p className="font-mono font-medium text-sm text-white">
                    {bottleResult.qrCode}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <Badge className={BOTTLE_STATUS_COLORS[bottleResult.status]}>
                    {BOTTLE_STATUS_LABELS[bottleResult.status]}
                  </Badge>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">Refills</p>
                  <p className="font-medium text-white">
                    {bottleResult.refillCount} / {bottleResult.maxRefills}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
