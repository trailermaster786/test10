'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/stores/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Droplets, Package, Users, Truck, BarChart3, LogOut, Home,
  Plus, Bell, Target, FileText, ShoppingCart,
  Trash2, RefreshCw, Eye, Edit, UserCheck, Sparkles, CheckCircle2, MapPin, XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, BOTTLE_STATUS_LABELS, BOTTLE_STATUS_COLORS } from '@/lib/constants';
import { io } from 'socket.io-client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import OrderTimeline from '@/components/shared/order-timeline';

interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  totalDrivers: number;
  totalBottles: number;
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
  user: { name: string; email: string; phone?: string };
  driver?: { name: string; phone?: string };
  items: { product: { name: string }; quantity: number; unitPrice: number }[];
  address?: { label: string; street: string; city: string };
}

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count?: { orders: number };
}

interface Bottle {
  id: string;
  qrCode: string;
  status: string;
  refillCount: number;
  maxRefills: number;
  createdAt: string;
}

interface Truck {
  id: string;
  plate: string;
  model: string;
  capacity: number;
  isActive: boolean;
  driver?: { id: string; name: string; email: string };
}

interface ProductAdmin {
  id: string;
  name: string;
  description: string;
  price: number;
  liter: number;
  stock: number;
  isActive: boolean;
}

interface Promo {
  id: string;
  code: string;
  description: string;
  type: string;
  value: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
}

interface SalesTarget {
  id: string;
  targetAmount: number;
  achievedAmount: number;
  month: number;
  year: number;
  user: { id: string; name: string; email: string };
}

const PIE_COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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

export default function AdminPortal() {
  const { user, logout, setPage, currentPage, notifications, addNotification, setNotifications } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [products, setProducts] = useState<ProductAdmin[]>([]);
  const [chartData, setChartData] = useState<{ date: string; revenue: number }[]>([]);
  const [statusDistribution, setStatusDistribution] = useState<{ status: string; count: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState<string | null>(null);
  const [generateCount, setGenerateCount] = useState(10);
  const [bottleStatusFilter, setBottleStatusFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drivers, setDrivers] = useState<User[]>([]);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [showSalesDialog, setShowSalesDialog] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [salesForm, setSalesForm] = useState({ code: '', description: '', type: 'percentage', value: '', minOrder: '', maxUses: '100', startsAt: '', endsAt: '' });
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', phone: '', role: 'customer' });
  const [showTruckDialog, setShowTruckDialog] = useState(false);
  const [editingTruck, setEditingTruck] = useState<Truck | null>(null);
  const [truckForm, setTruckForm] = useState({ plate: '', model: '', capacity: '', driverId: '' });
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [targetForm, setTargetForm] = useState({ userId: '', targetAmount: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductAdmin | null>(null);
  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', liter: '', stock: '100' });

  const page = currentPage || 'overview';

  useEffect(() => {
    fetchDashboard();
    fetchOrders();
    fetchUsers();
    fetchBottles();
    fetchTrucks();
    fetchPromos();
    fetchTargets();
    fetchNotifications();
    fetchProducts();
    connectWebSocket();

    const refreshInterval = setInterval(() => {
      fetchDashboard();
      fetchOrders();
      fetchUsers();
      fetchBottles();
      fetchTrucks();
      fetchPromos();
      fetchTargets();
      fetchNotifications();
      fetchProducts();
    }, 15000);

    return () => {
      socketRef.current?.disconnect();
      clearInterval(refreshInterval);
    };
  }, []);

  const connectWebSocket = () => {
    try {
      const wsUrl = typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3003`
        : 'http://localhost:3003';
      const socket = io(wsUrl);
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('register', { role: 'admin', userId: user?.id });
      });

      socket.on('notification', (data) => {
        addNotification({
          id: Date.now().toString(),
          ...data,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
        toast.info(data.title, { description: data.message });
      });
    } catch {
      // WebSocket not available
    }
  };

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/admin/reports');
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats);
      setChartData(data.chartData);
      setStatusDistribution(data.statusDistribution);
      setRecentOrders(data.recentOrders);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/admin/orders');
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      toast.error('Failed to load orders');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
      setDrivers((data.users || []).filter((u: User) => u.role === 'driver'));
    } catch {
      toast.error('Failed to load users');
    }
  };

  const fetchBottles = async () => {
    try {
      const res = await fetch('/api/admin/bottles');
      if (!res.ok) return;
      const data = await res.json();
      setBottles(data.bottles || []);
    } catch {
      toast.error('Failed to load bottles');
    }
  };

  const fetchTrucks = async () => {
    try {
      const res = await fetch('/api/admin/fleet');
      if (!res.ok) return;
      const data = await res.json();
      setTrucks(data.trucks || []);
    } catch {
      toast.error('Failed to load trucks');
    }
  };

  const fetchPromos = async () => {
    try {
      const res = await fetch('/api/admin/promos');
      if (!res.ok) return;
      const data = await res.json();
      setPromos(data.promos || []);
    } catch {
      toast.error('Failed to load promos');
    }
  };

  const fetchTargets = async () => {
    try {
      const res = await fetch('/api/admin/sales-targets');
      if (!res.ok) return;
      const data = await res.json();
      setTargets(data.targets || []);
    } catch {
      toast.error('Failed to load targets');
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/admin/products');
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
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchNotifications();
    } catch {}
  };

  const savePromo = async () => {
    if (!salesForm.code || !salesForm.value) {
      toast.error('Code and value are required');
      return;
    }
    const numValue = parseFloat(salesForm.value);
    if (isNaN(numValue) || numValue <= 0) {
      toast.error('Value must be a positive number');
      return;
    }
    try {
      const payload = {
        code: salesForm.code.toUpperCase(),
        description: salesForm.description,
        type: salesForm.type,
        value: numValue,
        minOrder: parseFloat(salesForm.minOrder) || 0,
        maxUses: parseInt(salesForm.maxUses) || 100,
        startsAt: salesForm.startsAt || null,
        endsAt: salesForm.endsAt || null,
      };
      if (editingPromo) {
        const res = await fetch('/api/admin/promos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPromo.id, ...payload }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update');
        }
        toast.success('Sale updated');
      } else {
        const res = await fetch('/api/admin/promos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create');
        }
        toast.success('Sale created');
      }
      setShowSalesDialog(false);
      setEditingPromo(null);
      resetSalesForm();
      fetchPromos();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  const deletePromo = async (id: string) => {
    try {
      const res = await fetch('/api/admin/promos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Sale deleted');
      fetchPromos();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const togglePromoActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin/promos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !isActive }),
      });
      if (!res.ok) throw new Error('Failed to update');
      fetchPromos();
    } catch {
      toast.error('Failed to update');
    }
  };

  const resetSalesForm = () => {
    setSalesForm({ code: '', description: '', type: 'percentage', value: '', minOrder: '', maxUses: '100', startsAt: '', endsAt: '' });
  };

  // User Management
  const saveUser = async () => {
    if (!userForm.name || !userForm.email) {
      toast.error('Name and email are required');
      return;
    }
    try {
      if (editingUser) {
        const res = await fetch('/api/admin/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingUser.id, name: userForm.name, email: userForm.email, phone: userForm.phone, role: userForm.role }),
        });
        if (!res.ok) throw new Error('Failed to update');
        toast.success('User updated');
      } else {
        if (!userForm.password) { toast.error('Password is required'); return; }
        if (userForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...userForm, password: userForm.password }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to create'); }
        toast.success('User created');
      }
      setShowUserDialog(false);
      setEditingUser(null);
      setUserForm({ name: '', email: '', password: '', phone: '', role: 'customer' });
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  const toggleUserActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !isActive }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(isActive ? 'User deactivated' : 'User activated');
      fetchUsers();
    } catch {
      toast.error('Failed to update user');
    }
  };

  // Truck Management
  const saveTruck = async () => {
    if (!truckForm.plate || !truckForm.model || !truckForm.capacity) {
      toast.error('Plate, model, and capacity are required');
      return;
    }
    try {
      if (editingTruck) {
        const res = await fetch('/api/admin/fleet', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTruck.id, plate: truckForm.plate, model: truckForm.model, capacity: truckForm.capacity, driverId: truckForm.driverId || null }),
        });
        if (!res.ok) throw new Error('Failed to update');
        toast.success('Truck updated');
      } else {
        const res = await fetch('/api/admin/fleet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(truckForm),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to create'); }
        toast.success('Truck created');
      }
      setShowTruckDialog(false);
      setEditingTruck(null);
      setTruckForm({ plate: '', model: '', capacity: '', driverId: '' });
      fetchTrucks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  // Sales Target Management
  const saveTarget = async () => {
    if (!targetForm.userId || !targetForm.targetAmount) {
      toast.error('Driver and target amount are required');
      return;
    }
    try {
      const res = await fetch('/api/admin/sales-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...targetForm, period: `${targetForm.month}/${targetForm.year}` }),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast.success('Sales target created');
      setShowTargetDialog(false);
      setTargetForm({ userId: '', targetAmount: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
      fetchTargets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  // Product Management
  const saveProduct = async () => {
    if (!productForm.name || !productForm.price) {
      toast.error('Name and price are required');
      return;
    }
    try {
      if (editingProduct) {
        const res = await fetch('/api/admin/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProduct.id, ...productForm }),
        });
        if (!res.ok) throw new Error('Failed to update');
        toast.success('Product updated');
      } else {
        const res = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(productForm),
        });
        if (!res.ok) throw new Error('Failed to create');
        toast.success('Product created');
      }
      setShowProductDialog(false);
      setEditingProduct(null);
      setProductForm({ name: '', description: '', price: '', liter: '', stock: '100' });
      fetchProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  const toggleProductActive = async (product: ProductAdmin) => {
    try {
      const res = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, isActive: !product.isActive }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(product.isActive ? 'Product deactivated' : 'Product activated');
      fetchProducts();
    } catch { toast.error('Failed to update product'); }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Product deleted');
      fetchProducts();
    } catch { toast.error('Failed to delete product'); }
  };

  const openEditPromo = (promo: Promo) => {
    setEditingPromo(promo);
    setSalesForm({
      code: promo.code,
      description: promo.description || '',
      type: promo.type,
      value: promo.value.toString(),
      minOrder: promo.minOrder.toString(),
      maxUses: promo.maxUses.toString(),
      startsAt: promo.startsAt ? new Date(promo.startsAt).toISOString().split('T')[0] : '',
      endsAt: promo.endsAt ? new Date(promo.endsAt).toISOString().split('T')[0] : '',
    });
    setShowSalesDialog(true);
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    try {
      const res = await fetch('/api/admin/assign-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, driverId }),
      });
      if (!res.ok) throw new Error('Failed to assign');
      toast.success('Driver assigned');
      fetchOrders();
      setShowAssignDialog(null);
    } catch {
      toast.error('Failed to assign driver');
    }
  };

  const generateBottles = async () => {
    try {
      const res = await fetch('/api/bottles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: generateCount }),
      });
      if (!res.ok) throw new Error('Failed to generate');
      toast.success(`Generated ${generateCount} bottles`);
      fetchBottles();
    } catch {
      toast.error('Failed to generate bottles');
    }
  };

  const destroyBottles = async (ids: string[]) => {
    try {
      const res = await fetch('/api/admin/destruction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bottleIds: ids }),
      });
      if (!res.ok) throw new Error('Failed to destroy');
      toast.success(`Destroyed ${ids.length} bottles`);
      fetchBottles();
    } catch {
      toast.error('Failed to destroy bottles');
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }
      toast.success(`Order status updated to ${ORDER_STATUS_LABELS[newStatus]}`);
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    }
  };

  const getNextValidStatus = (currentStatus: string): string | null => {
    const validNext: Record<string, string> = {
      PENDING: 'CONFIRMED',
      CONFIRMED: 'ASSIGNED',
      ASSIGNED: 'IN_TRANSIT',
      IN_TRANSIT: 'DELIVERED',
    };
    return validNext[currentStatus] || null;
  };

  const filteredOrders = orders.filter((o) => {
    if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return o.user?.name?.toLowerCase().includes(q) || o.user?.email?.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredBottles = bottles.filter((b) => {
    if (bottleStatusFilter !== 'all' && b.status !== bottleStatusFilter) return false;
    if (searchQuery) return b.qrCode.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  if (loading) {
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
            <span className="font-bold text-xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">AquaTrack Admin</span>
          </div>
          <div className="flex items-center gap-4">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        notifications.filter((n) => !n.isRead).forEach((n) => markNotificationRead(n.id));
                        setShowNotifPanel(false);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
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
                        <div
                          key={notif.id}
                          onClick={() => {
                            markNotificationRead(notif.id);
                            if (notif.orderId) { setPage('orders'); setShowNotifPanel(false); }
                          }}
                          className={`p-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!notif.isRead ? 'bg-cyan-500/5' : ''}`}
                        >
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
            <span className="text-sm text-gray-300 hidden sm:block">{user?.name}</span>
            <Button variant="ghost" size="icon" onClick={logout} className="text-gray-400 hover:text-white hover:bg-white/10">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Sidebar */}
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
              { id: 'overview', icon: Home, label: 'Dashboard' },
              { id: 'tracking', icon: MapPin, label: 'Order Tracking' },
              { id: 'orders', icon: ShoppingCart, label: 'Orders' },
              { id: 'sales', icon: Sparkles, label: 'Sales & Promos' },
              { id: 'bottles', icon: Droplets, label: 'Bottles' },
              { id: 'generate', icon: Plus, label: 'Generate QR Code' },
              { id: 'destruction', icon: Trash2, label: 'Destruction Queue' },
              { id: 'users', icon: Users, label: 'Users' },
              { id: 'fleet', icon: Truck, label: 'Fleet' },
              { id: 'products', icon: Package, label: 'Products' },
              { id: 'targets', icon: Target, label: 'Sales Targets' },
              { id: 'reports', icon: BarChart3, label: 'Reports' },
            ].map((navItem) => (
              <motion.button
                key={navItem.id}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPage(navItem.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm text-left ${
                  page === navItem.id
                    ? 'bg-gradient-to-r from-cyan-500/20 to-transparent text-cyan-400 nav-active'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <navItem.icon className="w-4 h-4" />
                <span className="font-medium">{navItem.label}</span>
              </motion.button>
            ))}
          </nav>
        </div>
      </div>

      {/* Mobile Nav */}
      <nav className="fixed bottom-0 left-0 right-0 glass-strong z-40 md:hidden border-t border-white/10">
        <div className="grid grid-cols-5 gap-1 p-2">
          {[
            { id: 'overview', icon: Home, label: 'Home' },
            { id: 'orders', icon: ShoppingCart, label: 'Orders' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'fleet', icon: Truck, label: 'Fleet' },
            { id: 'reports', icon: BarChart3, label: 'Reports' },
          ].map((mobileItem) => (
            <motion.button
              key={mobileItem.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => setPage(mobileItem.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                page === mobileItem.id
                  ? 'bg-gradient-to-b from-cyan-500/20 to-transparent text-cyan-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <mobileItem.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{mobileItem.label}</span>
            </motion.button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-72 pb-24 md:pb-8 p-4 md:p-8">
        <AnimatePresence mode="wait">
          {/* Overview */}
          {page === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <Sparkles className="w-6 h-6 text-cyan-400" />
                <h2 className="text-3xl font-bold text-white">Dashboard</h2>
              </div>
              <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Orders', value: stats?.totalOrders || 0, icon: ShoppingCart, gradient: 'from-cyan-500 to-blue-500' },
                  { label: 'Revenue', value: formatCurrency(stats?.totalRevenue || 0), icon: BarChart3, gradient: 'from-emerald-500 to-teal-500' },
                  { label: 'Customers', value: stats?.totalCustomers || 0, icon: Users, gradient: 'from-violet-500 to-purple-500' },
                  { label: 'Drivers', value: stats?.totalDrivers || 0, icon: Truck, gradient: 'from-amber-500 to-orange-500' },
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    variants={item}
                    whileHover={{ scale: 1.02, y: -2 }}
                  >
                    <div className="card-modern stat-card p-5">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}>
                          <stat.icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-400">{stat.label}</p>
                          <p className="text-2xl font-bold text-white">{stat.value}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="glass border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Revenue (Last 7 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {chartData.length > 0 ? (
                      <BarChart width={500} height={300} data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="date" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                        <Bar dataKey="revenue" fill="#0d9488" />
                      </BarChart>
                    ) : (
                      <p className="text-center text-gray-500 py-8">No data available</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Order Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {statusDistribution.length > 0 ? (
                      <PieChart width={400} height={300}>
                        <Pie
                          data={statusDistribution.map((s) => ({ name: ORDER_STATUS_LABELS[s.status] || s.status, value: s.count }))}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label
                        >
                          {statusDistribution.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                      </PieChart>
                    ) : (
                      <p className="text-center text-gray-500 py-8">No data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Orders */}
              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-gray-300">Order</TableHead>
                        <TableHead className="text-gray-300">Customer</TableHead>
                        <TableHead className="text-gray-300">Amount</TableHead>
                        <TableHead className="text-gray-300">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentOrders.slice(0, 5).map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-gray-300">#{order.id.slice(0, 8)}</TableCell>
                           <TableCell className="text-gray-300">{order.user?.name || 'Unknown'}</TableCell>
                           <TableCell className="text-gray-300">{formatCurrency(order.finalAmount)}</TableCell>
                           <TableCell>

                            <Badge className={ORDER_STATUS_COLORS[order.status]}>
                              {ORDER_STATUS_LABELS[order.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Order Tracking - Card View */}
          {page === 'tracking' && (
            <motion.div
              key="tracking"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Order Tracking</h2>
                  <p className="text-gray-400 text-sm mt-1">Real-time order progress across all stages</p>
                </div>
                <Button
                  onClick={fetchOrders}
                  variant="outline"
                  size="sm"
                  className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>

              {/* Status Legend */}
              <div className="flex flex-wrap gap-3">
                {[
                  { status: 'PENDING', color: 'bg-yellow-500', label: 'Pending' },
                  { status: 'CONFIRMED', color: 'bg-blue-500', label: 'Confirmed' },
                  { status: 'ASSIGNED', color: 'bg-purple-500', label: 'Assigned' },
                  { status: 'IN_TRANSIT', color: 'bg-cyan-500', label: 'In Transit' },
                  { status: 'DELIVERED', color: 'bg-green-500', label: 'Delivered' },
                ].map((s) => (
                  <div key={s.status} className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                    <span className="text-xs text-gray-300">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Tracking Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {orders
                  .filter((o) => o.status !== 'CANCELLED')
                  .sort((a, b) => {
                    const order = ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];
                    return order.indexOf(a.status) - order.indexOf(b.status);
                  })
                  .map((order, idx) => {
                    const allStatuses = ['PENDING', 'CONFIRMED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];
                    const currentIdx = allStatuses.indexOf(order.status);
                    const progressPercent = ((currentIdx + 1) / allStatuses.length) * 100;
                    const customerName = order.user?.name || 'Unknown';
                    const driverName = order.driver?.name || 'Not assigned';

                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="glass-card rounded-2xl p-5 border border-white/10 hover:border-cyan-500/30 transition-all"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="text-white font-semibold text-sm">
                              #{order.id.slice(-8).toUpperCase()}
                            </p>
                            <p className="text-gray-400 text-xs mt-0.5">{customerName}</p>
                          </div>
                          <Badge className={`${ORDER_STATUS_COLORS[order.status]} text-xs`}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </Badge>
                        </div>

                        {/* Progress Bar */}
                        <div className="relative mb-4">
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPercent}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={`h-full rounded-full ${
                                order.status === 'DELIVERED'
                                  ? 'bg-gradient-to-r from-green-500 to-emerald-400'
                                  : 'bg-gradient-to-r from-cyan-500 to-blue-400'
                              }`}
                            />
                          </div>
                          <p className="text-right text-xs text-gray-400 mt-1">
                            {Math.round(progressPercent)}% complete
                          </p>
                        </div>

                        {/* Step Indicators */}
                        <div className="flex items-center justify-between mb-4 px-1">
                          {allStatuses.map((status, sIdx) => {
                            const isCompleted = sIdx < currentIdx;
                            const isCurrent = sIdx === currentIdx;
                            return (
                              <div key={status} className="flex flex-col items-center relative">
                                <div
                                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                    isCompleted
                                      ? 'bg-cyan-500 text-white'
                                      : isCurrent
                                        ? 'bg-cyan-500/30 border-2 border-cyan-400 text-cyan-400 animate-pulse'
                                        : 'bg-white/10 text-gray-500'
                                  }`}
                                >
                                  {isCompleted ? '✓' : sIdx + 1}
                                </div>
                                <span className="text-[9px] text-gray-500 mt-1.5 whitespace-nowrap hidden sm:block">
                                  {status.replace('_', ' ')}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white/5 rounded-lg p-2">
                            <p className="text-gray-500">Items</p>
                            <p className="text-white">{order.items?.length || 0} products</p>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2">
                            <p className="text-gray-500">Driver</p>
                            <p className="text-white">{driverName}</p>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 col-span-2">
                            <p className="text-gray-500">Placed</p>
                            <p className="text-white">{formatDateTime(order.createdAt)}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                {orders.filter((o) => o.status !== 'CANCELLED').length === 0 && (
                  <div className="col-span-full text-center py-12">
                    <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No active orders to track</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Orders Management */}
          {page === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Orders</h2>
              </div>
              <div className="flex gap-3 flex-wrap">
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Card className="glass border-white/10">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-gray-300">Order</TableHead>
                        <TableHead className="text-gray-300">Customer</TableHead>
                        <TableHead className="text-gray-300">Driver</TableHead>
                        <TableHead className="text-gray-300">Amount</TableHead>
                        <TableHead className="text-gray-300">Status</TableHead>
                        <TableHead className="text-gray-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {filteredOrders.map((order) => {
                        const nextStatus = getNextValidStatus(order.status);
                        return (
                        <TableRow key={order.id}>
                           <TableCell className="font-mono text-gray-300">#{order.id.slice(0, 8)}</TableCell>
                           <TableCell className="text-gray-300">{order.user?.name || 'Unknown'}</TableCell>
                           <TableCell className="text-gray-300">{order.driver?.name || <span className="text-gray-500">Unassigned</span>}</TableCell>
                          <TableCell className="text-gray-300">{formatCurrency(order.finalAmount)}</TableCell>
                          <TableCell>
                            <Badge className={ORDER_STATUS_COLORS[order.status]}>
                              {ORDER_STATUS_LABELS[order.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setSelectedOrder(order)} className="text-gray-400 hover:text-white">
                                <Eye className="w-4 h-4" />
                              </Button>
                              {order.status === 'CONFIRMED' && (
                                <Button size="icon" variant="ghost" onClick={() => setShowAssignDialog(order.id)} className="text-gray-400 hover:text-white" title="Assign Driver">
                                  <UserCheck className="w-4 h-4" />
                                </Button>
                              )}
                              {nextStatus && order.status !== 'CONFIRMED' && (
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => updateOrderStatus(order.id, nextStatus)}
                                  className="px-2 py-1 text-xs rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/30 transition-all"
                                  title={`Move to ${ORDER_STATUS_LABELS[nextStatus]}`}
                                >
                                  → {ORDER_STATUS_LABELS[nextStatus]}
                                </motion.button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                       })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Bottles */}
          {page === 'bottles' && (
            <motion.div
              key="bottles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold text-white">Bottle Tracking</h2>
              <div className="flex gap-3 flex-wrap">
                <Select value={bottleStatusFilter} onValueChange={setBottleStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(BOTTLE_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search by QR code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
                <Button onClick={fetchBottles} className="btn-primary">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
              <Card className="glass border-white/10">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-gray-300">QR Code</TableHead>
                        <TableHead className="text-gray-300">Status</TableHead>
                        <TableHead className="text-gray-300">Refills</TableHead>
                        <TableHead className="text-gray-300">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBottles.slice(0, 50).map((bottle) => (
                        <TableRow key={bottle.id}>
                          <TableCell className="font-mono text-gray-300">{bottle.qrCode}</TableCell>
                          <TableCell>
                            <Badge className={BOTTLE_STATUS_COLORS[bottle.status]}>
                              {BOTTLE_STATUS_LABELS[bottle.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-300">{bottle.refillCount} / {bottle.maxRefills}</TableCell>
                          <TableCell className="text-gray-300">{formatDate(bottle.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Generate QR Code */}
          {page === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md"
            >
              <h2 className="text-2xl font-bold text-white mb-6">Generate QR Code</h2>
              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Create New Bottles</CardTitle>
                  <CardDescription className="text-gray-400">Generate new bottles with unique QR codes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Number of Bottles</label>
                    <Input
                      type="number"
                      min="1"
                      max="1000"
                      value={generateCount}
                      onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <motion.div whileTap={{ scale: 0.98 }}>
                    <Button onClick={generateBottles} className="w-full btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Generate {generateCount} Bottles
                    </Button>
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Destruction Queue */}
          {page === 'destruction' && (
            <motion.div
              key="destruction"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold text-white">Destruction Queue</h2>
              <p className="text-gray-400">Bottles that have reached their maximum refill count</p>
              <Card className="glass border-white/10">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-gray-300">QR Code</TableHead>
                        <TableHead className="text-gray-300">Refills</TableHead>
                        <TableHead className="text-gray-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bottles.filter((b) => b.status === 'FLAGGED_FOR_DESTRUCTION').map((bottle) => (
                        <TableRow key={bottle.id}>
                          <TableCell className="font-mono text-gray-300">{bottle.qrCode}</TableCell>
                          <TableCell className="text-gray-300">{bottle.refillCount} / {bottle.maxRefills}</TableCell>
                          <TableCell>
                            <motion.div whileTap={{ scale: 0.95 }}>
                              <Button size="sm" variant="destructive" onClick={() => destroyBottles([bottle.id])}>
                                <Trash2 className="w-4 h-4 mr-1" />
                                Destroy
                              </Button>
                            </motion.div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {bottles.filter((b) => b.status === 'FLAGGED_FOR_DESTRUCTION').length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-12">
                            <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-400">No bottles flagged for destruction</p>
                            <p className="text-gray-500 text-sm mt-1">All bottles are within their refill limits</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Sales & Promos */}
          {page === 'sales' && (
            <motion.div
              key="sales"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">Sales & Promotions</h2>
                  <p className="text-gray-400 text-sm mt-1">Create and manage discount offers for your customers</p>
                </div>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => { resetSalesForm(); setEditingPromo(null); setShowSalesDialog(true); }} className="btn-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    New Sale
                  </Button>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {promos.map((promo) => (
                  <motion.div
                    key={promo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    className={`glass-card rounded-2xl p-5 border transition-all ${
                      promo.isActive ? 'border-cyan-500/30 hover:border-cyan-400/50' : 'border-white/10 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge variant={promo.isActive ? 'default' : 'secondary'} className="mb-2">
                          {promo.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <h3 className="text-xl font-bold text-white font-mono">{promo.code}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                          {promo.type === 'percentage' ? `${promo.value}%` : formatCurrency(promo.value)}
                        </p>
                        <p className="text-xs text-gray-400">{promo.type === 'percentage' ? 'Discount' : 'Off'}</p>
                      </div>
                    </div>

                    {promo.description && (
                      <p className="text-sm text-gray-300 mb-3 bg-white/5 rounded-lg p-2">{promo.description}</p>
                    )}

                    <div className="space-y-2 text-xs text-gray-400 mb-4">
                      <div className="flex justify-between">
                        <span>Min. Order</span>
                        <span className="text-gray-300">{promo.minOrder > 0 ? formatCurrency(promo.minOrder) : 'None'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Uses</span>
                        <span className="text-gray-300">{promo.usedCount} / {promo.maxUses}</span>
                      </div>
                      {promo.startsAt && (
                        <div className="flex justify-between">
                          <span>Starts</span>
                          <span className="text-gray-300">{formatDate(promo.startsAt)}</span>
                        </div>
                      )}
                      {promo.endsAt && (
                        <div className="flex justify-between">
                          <span>Ends</span>
                          <span className="text-gray-300">{formatDate(promo.endsAt)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <motion.div whileTap={{ scale: 0.95 }} className="flex-1">
                        <Button size="sm" variant="outline" onClick={() => openEditPromo(promo)} className="w-full border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      </motion.div>
                      <motion.div whileTap={{ scale: 0.95 }}>
                        <Button size="sm" variant="outline" onClick={() => togglePromoActive(promo.id, promo.isActive)} className={promo.isActive ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}>
                          {promo.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </motion.div>
                      <motion.div whileTap={{ scale: 0.95 }}>
                        <Button size="sm" variant="destructive" onClick={() => deletePromo(promo.id)} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </motion.div>
                    </div>
                  </motion.div>
                ))}
                {promos.length === 0 && (
                  <div className="col-span-full text-center py-12">
                    <Sparkles className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">No sales or promotions yet</p>
                    <p className="text-gray-500 text-sm mt-1">Click "New Sale" to create your first promotion</p>
                  </div>
                )}
              </div>

              {/* Sales Dialog */}
              <Dialog open={showSalesDialog} onOpenChange={setShowSalesDialog}>
                <DialogContent className="glass-strong border-white/10 max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-white">{editingPromo ? 'Edit Sale' : 'Create New Sale'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-300 mb-1 block">Promo Code *</label>
                      <Input value={salesForm.code} onChange={(e) => setSalesForm({ ...salesForm, code: e.target.value.toUpperCase() })} placeholder="e.g. WATER10" className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-300 mb-1 block">Description</label>
                      <Input value={salesForm.description} onChange={(e) => setSalesForm({ ...salesForm, description: e.target.value })} placeholder="e.g. 10% off for 5+ water bottles" className="bg-white/5 border-white/10 text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-gray-300 mb-1 block">Type</label>
                        <Select value={salesForm.type} onValueChange={(v) => setSalesForm({ ...salesForm, type: v })}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                            <SelectItem value="fixed">Fixed Amount (AED)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-1 block">Value *</label>
                        <Input type="number" value={salesForm.value} onChange={(e) => setSalesForm({ ...salesForm, value: e.target.value })} placeholder={salesForm.type === 'percentage' ? '10' : '5.00'} className="bg-white/5 border-white/10 text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-gray-300 mb-1 block">Min. Order (AED)</label>
                        <Input type="number" value={salesForm.minOrder} onChange={(e) => setSalesForm({ ...salesForm, minOrder: e.target.value })} placeholder="0" className="bg-white/5 border-white/10 text-white" />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-1 block">Max Uses</label>
                        <Input type="number" value={salesForm.maxUses} onChange={(e) => setSalesForm({ ...salesForm, maxUses: e.target.value })} placeholder="100" className="bg-white/5 border-white/10 text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-gray-300 mb-1 block">Start Date</label>
                        <Input type="date" value={salesForm.startsAt} onChange={(e) => setSalesForm({ ...salesForm, startsAt: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                      </div>
                      <div>
                        <label className="text-sm text-gray-300 mb-1 block">End Date</label>
                        <Input type="date" value={salesForm.endsAt} onChange={(e) => setSalesForm({ ...salesForm, endsAt: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" onClick={() => { setShowSalesDialog(false); setEditingPromo(null); }} className="flex-1 border-white/10 text-gray-300">
                        Cancel
                      </Button>
                      <motion.div whileTap={{ scale: 0.98 }} className="flex-1">
                        <Button onClick={savePromo} className="w-full btn-primary">
                          {editingPromo ? 'Update Sale' : 'Create Sale'}
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>
          )}

          {/* Users */}
          {page === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">User Management</h2>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => { setEditingUser(null); setUserForm({ name: '', email: '', password: '', phone: '', role: 'customer' }); setShowUserDialog(true); }} className="btn-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    New User
                  </Button>
                </motion.div>
              </div>
              <Card className="glass border-white/10">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-gray-300">Name</TableHead>
                        <TableHead className="text-gray-300">Email</TableHead>
                        <TableHead className="text-gray-300">Role</TableHead>
                        <TableHead className="text-gray-300">Orders</TableHead>
                        <TableHead className="text-gray-300">Status</TableHead>
                        <TableHead className="text-gray-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium text-gray-300">{u.name}</TableCell>
                          <TableCell className="text-gray-300">{u.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{u.role}</Badge>
                          </TableCell>
                          <TableCell className="text-gray-300">{u._count?.orders || 0}</TableCell>
                          <TableCell>
                            <Badge variant={u.isActive ? 'default' : 'destructive'}>
                              {u.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => {
                                setEditingUser(u);
                                setUserForm({ name: u.name, email: u.email, password: '', phone: u.phone || '', role: u.role });
                                setShowUserDialog(true);
                              }} className="text-gray-400 hover:text-white">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => toggleUserActive(u.id, u.isActive)} className={u.isActive ? 'text-amber-400 hover:text-amber-300' : 'text-green-400 hover:text-green-300'}>
                                <UserCheck className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Fleet */}
          {page === 'fleet' && (
            <motion.div
              key="fleet"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Fleet Management</h2>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => { setEditingTruck(null); setTruckForm({ plate: '', model: '', capacity: '', driverId: '' }); setShowTruckDialog(true); }} className="btn-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    New Truck
                  </Button>
                </motion.div>
              </div>
              <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trucks.map((truck) => (
                  <motion.div key={truck.id} variants={item} whileHover={{ scale: 1.02, y: -2 }}>
                    <Card className="glass border-white/10">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
                            <Truck className="w-6 h-6 text-cyan-400" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg text-white">{truck.plate}</CardTitle>
                            <CardDescription className="text-gray-400">{truck.model}</CardDescription>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => {
                            setEditingTruck(truck);
                            setTruckForm({ plate: truck.plate, model: truck.model, capacity: String(truck.capacity), driverId: truck.driver?.id || '' });
                            setShowTruckDialog(true);
                          }} className="text-gray-400 hover:text-white">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Capacity</span>
                            <span className="text-gray-300">{truck.capacity} bottles</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Driver</span>
                            <span className="text-gray-300">{truck.driver?.name || 'Unassigned'}</span>
                          </div>
                          <Badge variant={truck.isActive ? 'default' : 'secondary'}>
                            {truck.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* Sales Targets */}
          {page === 'targets' && (
            <motion.div
              key="targets"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Sales Targets</h2>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => { setTargetForm({ userId: '', targetAmount: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) }); setShowTargetDialog(true); }} className="btn-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    New Target
                  </Button>
                </motion.div>
              </div>
              <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {targets.map((target) => {
                  const progress = Math.min((target.achievedAmount / target.targetAmount) * 100, 100);
                  return (
                    <motion.div key={target.id} variants={item} whileHover={{ scale: 1.02, y: -2 }}>
                      <Card className="glass border-white/10">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-white">{target.user.name}</CardTitle>
                            <Badge variant="outline">{target.month}/{target.year}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Achieved</span>
                            <span className="text-gray-300">{formatCurrency(target.achievedAmount)} / {formatCurrency(target.targetAmount)}</span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-3">
                            <div
                              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-right text-sm font-medium text-cyan-400">{progress.toFixed(1)}%</p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}

          {/* Products */}
          {page === 'products' && (
            <motion.div
              key="products"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Products</h2>
                <motion.div whileTap={{ scale: 0.95 }}>
                  <Button onClick={() => { setEditingProduct(null); setProductForm({ name: '', description: '', price: '', liter: '', stock: '100' }); setShowProductDialog(true); }} className="btn-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    New Product
                  </Button>
                </motion.div>
              </div>
              <Card className="glass border-white/10">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-gray-300">Name</TableHead>
                        <TableHead className="text-gray-300">Description</TableHead>
                        <TableHead className="text-gray-300">Price</TableHead>
                        <TableHead className="text-gray-300">Liter</TableHead>
                        <TableHead className="text-gray-300">Stock</TableHead>
                        <TableHead className="text-gray-300">Status</TableHead>
                        <TableHead className="text-gray-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium text-white">{product.name}</TableCell>
                          <TableCell className="text-gray-400">{product.description || '-'}</TableCell>
                          <TableCell className="text-gray-300">{formatCurrency(product.price)}</TableCell>
                          <TableCell className="text-gray-300">{product.liter}L</TableCell>
                          <TableCell className="text-gray-300">{product.stock}</TableCell>
                          <TableCell>
                            <Badge className={product.isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}>
                              {product.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => { setEditingProduct(product); setProductForm({ name: product.name, description: product.description || '', price: product.price.toString(), liter: product.liter.toString(), stock: product.stock.toString() }); setShowProductDialog(true); }} className="text-gray-400 hover:text-white">
                                <FileText className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => toggleProductActive(product)} className="text-gray-400 hover:text-white">
                                {product.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => deleteProduct(product.id)} className="text-red-400 hover:text-red-300">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Reports */}
          {page === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-white">Reports</h2>
              <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Orders', value: stats?.totalOrders || 0, color: 'text-cyan-400', icon: ShoppingCart },
                  { label: 'Revenue', value: formatCurrency(stats?.totalRevenue || 0), color: 'text-emerald-400', icon: BarChart3 },
                  { label: 'Customers', value: stats?.totalCustomers || 0, color: 'text-blue-400', icon: Users },
                  { label: 'Drivers', value: stats?.totalDrivers || 0, color: 'text-violet-400', icon: Truck },
                  { label: 'Bottles', value: stats?.totalBottles || 0, color: 'text-amber-400', icon: Package },
                ].map((stat, i) => (
                  <motion.div key={i} variants={item} whileHover={{ scale: 1.02 }}>
                    <Card className="glass border-white/10">
                      <CardContent className="p-4 text-center">
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-sm text-gray-400">{stat.label}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Revenue Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.length > 0 ? (
                    <BarChart width={800} height={300} data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                      <Bar dataKey="revenue" fill="#0d9488" />
                    </BarChart>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No data available</p>
                  )}
                </CardContent>
              </Card>
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
              {/* Order Tracking Timeline */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <h4 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4 text-cyan-400" />
                  Order Status
                </h4>
                <OrderTimeline currentStatus={selectedOrder.status} />
              </div>

              {/* Customer Info */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-sm font-medium text-white">Customer: {selectedOrder.user.name}</p>
                <p className="text-sm text-gray-400">{selectedOrder.user.email}</p>
              </div>

              {/* Order Items */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-300">Items</h4>
                {selectedOrder.items.map((orderItem, i) => (
                  <div key={i} className="flex justify-between text-gray-300 p-2 rounded-lg bg-white/5">
                    <span>{orderItem.product.name} x {orderItem.quantity}</span>
                    <span>{formatCurrency(orderItem.unitPrice * orderItem.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Price Summary */}
              <div className="border-t border-white/10 pt-3">
                <div className="flex justify-between font-bold text-lg">
                  <span className="text-white">Total</span>
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{formatCurrency(selectedOrder.finalAmount)}</span>
                </div>
              </div>

              {/* Driver Info */}
              {selectedOrder.driver && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Assigned Driver: {selectedOrder.driver.name}</p>
                    <p className="text-sm text-gray-400">{selectedOrder.driver.phone}</p>
                  </div>
                </div>
              )}

              {/* Delivery Address */}
              {selectedOrder.address && (
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-sm font-medium text-white">Delivery Address:</p>
                  <p className="text-sm text-gray-400 mt-1">{selectedOrder.address.street}, {selectedOrder.address.city}</p>
                </div>
              )}

              {/* Status Update Actions */}
              {selectedOrder.status !== 'DELIVERED' && selectedOrder.status !== 'CANCELLED' && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Update Order Status</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedOrder.status === 'PENDING' && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          updateOrderStatus(selectedOrder.id, 'CONFIRMED');
                          setSelectedOrder({ ...selectedOrder, status: 'CONFIRMED' });
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium text-sm shadow-lg shadow-emerald-500/25"
                      >
                        ✓ Confirm Order
                      </motion.button>
                    )}
                    {selectedOrder.status === 'CONFIRMED' && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setSelectedOrder(null);
                          setShowAssignDialog(selectedOrder.id);
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-medium text-sm shadow-lg shadow-violet-500/25"
                      >
                        <UserCheck className="w-4 h-4 inline mr-1" />
                        Assign Driver
                      </motion.button>
                    )}
                    {selectedOrder.status === 'ASSIGNED' && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          updateOrderStatus(selectedOrder.id, 'IN_TRANSIT');
                          setSelectedOrder({ ...selectedOrder, status: 'IN_TRANSIT' });
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm shadow-lg shadow-amber-500/25"
                      >
                        <Truck className="w-4 h-4 inline mr-1" />
                        Start Delivery
                      </motion.button>
                    )}
                    {selectedOrder.status === 'IN_TRANSIT' && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          updateOrderStatus(selectedOrder.id, 'DELIVERED');
                          setSelectedOrder({ ...selectedOrder, status: 'DELIVERED' });
                        }}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm shadow-lg shadow-cyan-500/25"
                      >
                        ✓ Mark Delivered
                      </motion.button>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, 'CANCELLED');
                        setSelectedOrder({ ...selectedOrder, status: 'CANCELLED' });
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-500/20 to-pink-500/20 text-red-400 border border-red-500/30 font-medium text-sm"
                    >
                      Cancel Order
                    </motion.button>
                  </div>
                </div>
              )}

              {selectedOrder.status === 'DELIVERED' && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-emerald-400 font-medium">Order Delivered Successfully</p>
                </div>
              )}
            </motion.div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Driver Dialog */}
      <Dialog open={!!showAssignDialog} onOpenChange={() => setShowAssignDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Assign Driver</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {drivers.map((driver) => (
              <motion.button
                key={driver.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => showAssignDialog && assignDriver(showAssignDialog, driver.id)}
                className="w-full p-3 border border-white/10 rounded-lg hover:bg-white/5 text-left transition-colors"
              >
                <p className="font-medium text-white">{driver.name}</p>
                <p className="text-sm text-gray-400">{driver.email}</p>
              </motion.button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* User Create/Edit Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Name *</label>
              <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Full name" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Email *</label>
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="email@example.com" className="bg-white/5 border-white/10 text-white" />
            </div>
            {!editingUser && (
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Password *</label>
                <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder="Min 6 characters" className="bg-white/5 border-white/10 text-white" />
              </div>
            )}
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Phone</label>
              <Input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} placeholder="+971..." className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Role</label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowUserDialog(false); setEditingUser(null); }} className="flex-1 border-white/10 text-gray-300">Cancel</Button>
              <Button onClick={saveUser} className="flex-1 btn-primary">{editingUser ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Truck Create/Edit Dialog */}
      <Dialog open={showTruckDialog} onOpenChange={setShowTruckDialog}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{editingTruck ? 'Edit Truck' : 'Add Truck'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Plate Number *</label>
              <Input value={truckForm.plate} onChange={(e) => setTruckForm({ ...truckForm, plate: e.target.value })} placeholder="e.g. ABC-1234" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Model *</label>
              <Input value={truckForm.model} onChange={(e) => setTruckForm({ ...truckForm, model: e.target.value })} placeholder="e.g. Toyota Hilux" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Capacity (bottles) *</label>
              <Input type="number" value={truckForm.capacity} onChange={(e) => setTruckForm({ ...truckForm, capacity: e.target.value })} placeholder="e.g. 200" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Assign Driver</label>
              <Select value={truckForm.driverId} onValueChange={(v) => setTruckForm({ ...truckForm, driverId: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select driver (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowTruckDialog(false); setEditingTruck(null); }} className="flex-1 border-white/10 text-gray-300">Cancel</Button>
              <Button onClick={saveTruck} className="flex-1 btn-primary">{editingTruck ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales Target Create Dialog */}
      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Create Sales Target</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Driver *</label>
              <Select value={targetForm.userId} onValueChange={(v) => setTargetForm({ ...targetForm, userId: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Target Amount (AED) *</label>
              <Input type="number" value={targetForm.targetAmount} onChange={(e) => setTargetForm({ ...targetForm, targetAmount: e.target.value })} placeholder="e.g. 5000" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Month *</label>
                <Select value={targetForm.month} onValueChange={(v) => setTargetForm({ ...targetForm, month: v })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {new Date(0, i).toLocaleString('en', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Year *</label>
                <Input type="number" value={targetForm.year} onChange={(e) => setTargetForm({ ...targetForm, year: e.target.value })} className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowTargetDialog(false)} className="flex-1 border-white/10 text-gray-300">Cancel</Button>
              <Button onClick={saveTarget} className="flex-1 btn-primary">Create Target</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Create/Edit Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">{editingProduct ? 'Edit Product' : 'Create Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Name *</label>
              <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} placeholder="Product name" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Description</label>
              <Input value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} placeholder="Description" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Price (AED) *</label>
                <Input type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} placeholder="0.00" className="bg-white/5 border-white/10 text-white" />
              </div>
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Liter</label>
                <Input type="number" step="0.1" value={productForm.liter} onChange={(e) => setProductForm({ ...productForm, liter: e.target.value })} placeholder="1.0" className="bg-white/5 border-white/10 text-white" />
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-300 mb-1 block">Stock</label>
              <Input type="number" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} placeholder="100" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowProductDialog(false)} className="flex-1 border-white/10 text-gray-300">Cancel</Button>
              <Button onClick={saveProduct} className="flex-1 btn-primary">{editingProduct ? 'Update' : 'Create'} Product</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
