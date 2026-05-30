import React, { useState, useMemo, useEffect } from "react";
import Papa from "papaparse";
import { format, parseISO, startOfDay, eachDayOfInterval } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  Upload,
  BarChart3,
  Table as TableIcon,
  TrendingUp,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Calendar,
  FileText,
  DollarSign,
  Search,
  Wallet,
  Receipt,
  Percent,
  LogOut,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { EldoradoOrder, SalesSummary } from "../types";
import { cn } from "../lib/utils";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

const INDONESIA_TIMEZONE = "Asia/Jakarta";

export default function Dashboard() {
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (!user) return;
    const fetchOrders = async () => {
      setIsLoading(true);
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', user.id)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) {
          console.error("Error fetching orders:", error);
          break;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
      
      if (allData.length > 0) {
        const parsed: EldoradoOrder[] = allData.map((row: any) => ({
          ...row,
          parsedDate: parseISO(row.parsedDate),
          localDate: parseISO(row.localDate)
        }));
        const sorted = parsed.sort((a, b) => b.localDate.getTime() - a.localDate.getTime());
        setOrders(sorted);
        if (sorted.length > 0) {
          setStartDate(format(sorted[sorted.length - 1].localDate, "yyyy-MM-dd"));
          setEndDate(format(sorted[0].localDate, "yyyy-MM-dd"));
        }
      }
      setIsLoading(false);
    };
    fetchOrders();
  }, [user]);
  const [orders, setOrders] = useState<EldoradoOrder[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filterState, setFilterState] = useState<string>("All");
  const [activeTab, setActiveTab] = useState<"dashboard" | "trends" | "finance" | "transactions">("dashboard");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [exchangeRate, setExchangeRate] = useState<number>(15000);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [sortConfig, setSortConfig] = useState<{ key: keyof EldoradoOrder; direction: 'asc' | 'desc' } | null>(null);

  const requestSort = (key: keyof EldoradoOrder) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: FileList | null = null;
    
    if ("target" in e && "files" in e.target && e.target.files) {
      files = e.target.files;
    } else if ("dataTransfer" in e && e.dataTransfer.files) {
      files = e.dataTransfer.files;
      setIsDragging(false);
    }

    if (!files || files.length === 0) return;

    setIsLoading(true);
    const allNewOrders: EldoradoOrder[] = [];
    let filesProcessed = 0;
    const totalFiles = files.length;

    Array.from(files).forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const parsedOrders: EldoradoOrder[] = results.data.map((row: any) => {
            const rawDate = row["Order Date"];
            if (!rawDate) return null;
            
            const utcDate = parseISO(rawDate.includes('Z') ? rawDate : rawDate.replace(' ', 'T') + 'Z');
            const zonedDate = toZonedTime(utcDate, INDONESIA_TIMEZONE);
            
            return {
              orderId: row["Order Id"],
              orderDate: row["Order Date"],
              parsedDate: utcDate,
              localDate: zonedDate,
              title: row["Title"],
              offerType: row["Offer Type"],
              description: row["Description"],
              purchaseQuantity: parseInt(row["Purchase Quantity"]) || 0,
              orderState: row["Order State"],
              disputeReason: row["Dispute Reason"],
              disputeMessage: row["Dispute Message"],
              pricePerUnitAmount: parseFloat(row["Price Per Unit Amount"]) || 0,
              pricePerUnitCurrency: row["Price Per Unit Currency"],
              feedbackRating: row["Feedback Rating"],
              reviewMessage: row["Review Message"],
              cancelationReason: row["Cancelation Reason"],
              cancelationMessage: row["Cancelation Message"],
              totalOrderAmount: parseFloat(row["Total Order Amount"]) || 0,
              totalPriceCurrency: row["Total Price Currency"],
            };
          }).filter((o): o is EldoradoOrder => o !== null && !!o.orderId);

          allNewOrders.push(...parsedOrders);
          filesProcessed++;

          if (filesProcessed === totalFiles) {
            const saveToDatabase = async () => {
              if (!user) return;
              const uniqueMap = new Map<string, EldoradoOrder>();
              allNewOrders.forEach(o => uniqueMap.set(o.orderId, o));
              const deduplicatedNew = Array.from(uniqueMap.values());

              const payload = deduplicatedNew.map(o => ({
                user_id: user.id,
                ...o,
                parsedDate: o.parsedDate.toISOString(),
                localDate: o.localDate.toISOString()
              }));

              let hasError = false;
              const chunkSize = 500;
              for (let i = 0; i < payload.length; i += chunkSize) {
                const chunk = payload.slice(i, i + chunkSize);
                const { error } = await supabase.from('orders').upsert(chunk, { onConflict: 'user_id,"orderId"' });
                if (error) {
                  console.error("Error saving chunk to database:", error);
                  alert("Database Error: " + error.message);
                  hasError = true;
                  break;
                }
              }

              setOrders(prev => {
                const combined = [...prev, ...deduplicatedNew];
                const uniqueMapAll = new Map<string, EldoradoOrder>();
                combined.forEach(o => uniqueMapAll.set(o.orderId, o));
                const deduplicated = Array.from(uniqueMapAll.values());
                const sorted = deduplicated.sort((a, b) => b.localDate.getTime() - a.localDate.getTime());
                
                if (sorted.length > 0) {
                  setStartDate(format(sorted[sorted.length - 1].localDate, "yyyy-MM-dd"));
                  setEndDate(format(sorted[0].localDate, "yyyy-MM-dd"));
                }
                return sorted;
              });
              setIsLoading(false);
            };
            saveToDatabase();
          }
        },
        error: (err) => {
          console.error("CSV Parse Error for file:", file.name, err);
          filesProcessed++;
          if (filesProcessed === totalFiles) setIsLoading(false);
        }
      });
    });
  };

  const filteredByDate = useMemo(() => {
    if (!startDate || !endDate) return orders;
    return orders.filter(o => {
      const dateStr = format(o.localDate, "yyyy-MM-dd");
      return dateStr >= startDate && dateStr <= endDate;
    });
  }, [orders, startDate, endDate]);

  const filteredOrders = useMemo(() => {
    let result = [...filteredByDate];
    if (filterState !== "All") {
      result = result.filter(o => o.orderState === filterState);
    }
    if (searchTerm.trim() !== "") {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(o => 
        o.title.toLowerCase().includes(lowerSearch) ||
        o.orderId.toLowerCase().includes(lowerSearch) ||
        o.offerType.toLowerCase().includes(lowerSearch)
      );
    }

    if (sortConfig !== null) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue instanceof Date && bValue instanceof Date) {
          return sortConfig.direction === 'asc' 
            ? aValue.getTime() - bValue.getTime() 
            : bValue.getTime() - aValue.getTime();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return result;
  }, [filteredByDate, filterState, searchTerm, sortConfig]);

  const searchSummary = useMemo(() => {
    if (searchTerm.trim() === "") return null;
    return {
      count: filteredOrders.length,
      revenue: filteredOrders.reduce((sum, o) => sum + o.totalOrderAmount, 0)
    };
  }, [filteredOrders, searchTerm]);

  const summary = useMemo((): SalesSummary => {
    const relevantOrders = filteredByDate.filter(o => ["Completed", "Paid", "Delivered"].includes(o.orderState));
    const totalRev = relevantOrders.reduce((sum, o) => sum + o.totalOrderAmount, 0);
    const completed = filteredByDate.filter(o => o.orderState === "Completed").length;
    const canceled = filteredByDate.filter(o => o.orderState === "Canceled").length;
    const delivered = filteredByDate.filter(o => o.orderState === "Delivered").length;
    
    let daysInInterval = 1;
    if (startDate && endDate) {
      daysInInterval = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) }).length;
    } else if (orders.length > 0) {
      // Assuming orders are sorted latest first
      const minDate = orders[orders.length - 1].localDate;
      const maxDate = orders[0].localDate;
      daysInInterval = eachDayOfInterval({ start: minDate, end: maxDate }).length;
    }

    return {
      totalRevenue: totalRev,
      totalOrders: filteredByDate.length,
      completedOrders: completed,
      canceledOrders: canceled,
      deliveredOrders: delivered,
      averageOrderValue: relevantOrders.length > 0 ? totalRev / relevantOrders.length : 0,
      successRate: filteredByDate.length > 0 ? ((filteredByDate.length - canceled) / filteredByDate.length) * 100 : 0,
      averageDailyTransactions: relevantOrders.length / Math.max(1, daysInInterval),
      averageDailyRevenue: totalRev / Math.max(1, daysInInterval),
    };
  }, [filteredByDate, startDate, endDate]);

  const chartData = useMemo(() => {
    if (filteredByDate.length === 0 || !startDate || !endDate) return [];

    const minDate = parseISO(startDate);
    const maxDate = parseISO(endDate);

    const intervalDays = eachDayOfInterval({ start: minDate, end: maxDate });
    
    return intervalDays.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayOrders = filteredByDate.filter(o => 
        format(o.localDate, "yyyy-MM-dd") === dayStr
      );
      
      const successOrders = dayOrders.filter(o => ["Completed", "Paid", "Delivered"].includes(o.orderState));
      const canceledOrders = dayOrders.filter(o => o.orderState === "Canceled");

      return {
        date: format(day, "dd MMM"),
        revenue: successOrders.reduce((sum, o) => sum + o.totalOrderAmount, 0),
        count: successOrders.length,
        canceled: canceledOrders.length,
      };
    });
  }, [filteredByDate, startDate, endDate]);

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      count: 0
    }));

    filteredByDate.forEach(o => {
      const h = o.localDate.getHours();
      hours[h].count += 1;
    });

    return hours;
  }, [filteredByDate]);

  const topItems = useMemo(() => {
    const itemMap = new Map<string, { count: number; revenue: number }>();
    filteredByDate.forEach(o => {
      if (!["Completed", "Paid", "Delivered"].includes(o.orderState)) return;
      const current = itemMap.get(o.title) || { count: 0, revenue: 0 };
      itemMap.set(o.title, {
        count: current.count + o.purchaseQuantity,
        revenue: current.revenue + o.totalOrderAmount,
      });
    });

    return Array.from(itemMap.entries())
      .map(([title, stats]) => ({ title, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filteredByDate]);

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full flex justify-end mb-4">
          <button onClick={signOut} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">
            <LogOut size={16} /> Sign out
          </button>
        </div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden p-10 text-center space-y-8 border border-slate-100">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg shadow-indigo-200">
              <BarChart3 size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900">Sales Analyzer</h1>
              <p className="text-slate-500 text-sm">Visualize your Eldorado sales data with GMT+7 support and detailed growth analytics.</p>
            </div>

            <label 
              className={cn(
                "relative block border-2 border-dashed rounded-xl p-10 transition-all cursor-pointer group",
                isDragging ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileUpload(e); }}
            >
              <input type="file" className="hidden" accept=".csv" multiple onChange={handleFileUpload} />
              <div className="space-y-3">
                <div className="flex justify-center text-indigo-600">
                  <Upload className="group-hover:-translate-y-1 transition-transform" />
                </div>
                <div className="text-sm font-semibold text-slate-700">Drop CSV files or <span className="text-indigo-600">browse files</span></div>
                <p className="text-xs text-slate-400">Support multiple files & auto-merge</p>
              </div>
            </label>
            
            <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
              <AlertCircle size={14} />
              <span>Standard Eldorado export format supported</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 hidden lg:flex flex-col p-6 bg-white shrink-0">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-indigo-100 text-sm">S</div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Analyzer</h1>
        </div>

        <div className="px-2 mb-8 space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4">
             <div className="space-y-4">
               <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Ref Search</div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text"
                      placeholder="Search ID or Title..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
               </div>

               <div className="h-px bg-slate-100" />

               <div className="space-y-3">
                 <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Date Scope</div>
                 <div className="space-y-3">
                   <div>
                     <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">From</label>
                     <input 
                      type="date" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                     />
                   </div>
                   <div>
                     <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">To</label>
                     <input 
                      type="date" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                     />
                   </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
        
        <nav className="space-y-1 flex-1">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={cn(
              "w-full text-left px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-3 transition-colors",
              activeTab === "dashboard" ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-500"
            )}
          >
            <BarChart3 size={18} />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab("trends")}
            className={cn(
              "w-full text-left px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-3 transition-colors group",
              activeTab === "trends" ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-500"
            )}
          >
            <TrendingUp size={18} className={activeTab === "trends" ? "text-indigo-600" : "group-hover:text-indigo-600"} />
            Trends
          </button>
          <button 
            onClick={() => setActiveTab("finance")}
            className={cn(
              "w-full text-left px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-3 transition-colors group",
              activeTab === "finance" ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-500"
            )}
          >
            <Wallet size={18} className={activeTab === "finance" ? "text-indigo-600" : "group-hover:text-indigo-600"} />
            Finance
          </button>
          <button 
            onClick={() => setActiveTab("transactions")}
            className={cn(
              "w-full text-left px-4 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-3 transition-colors group",
              activeTab === "transactions" ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-500"
            )}
          >
            <TableIcon size={18} className={activeTab === "transactions" ? "text-indigo-600" : "group-hover:text-indigo-600"} />
            Transactions
          </button>
        </nav>

        <div className="mt-auto space-y-2">
          <label className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-200">
            <Upload size={16} />
            <span>Add CSV Files</span>
            <input type="file" className="hidden" accept=".csv" multiple onChange={handleFileUpload} />
          </label>
          <button 
            onClick={async () => {
              if(confirm("Are you sure you want to clear all data? This will permanently delete your data from the database.")) {
                if (user) {
                  setIsLoading(true);
                  const { error } = await supabase.from('orders').delete().eq('user_id', user.id);
                  if (error) {
                    console.error("Error clearing database:", error);
                    alert("Failed to clear database: " + error.message);
                  }
                }
                setOrders([]);
                setSearchTerm("");
                setIsLoading(false);
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 hover:bg-rose-50 text-rose-600 text-xs font-medium rounded-xl transition-colors"
          >
            Reset All Data
          </button>
          <button 
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mt-2 hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-xl transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
          <button 
            onClick={async () => {
              const confirmText = prompt('Apakah Anda yakin? Ketik "HAPUS" untuk menghapus akun Anda secara permanen beserta semua datanya.');
              if (confirmText === 'HAPUS') {
                if (user) {
                  setIsLoading(true);
                  const { error } = await supabase.rpc('delete_user');
                  if (error) {
                    console.error("Error deleting account:", error);
                    alert("Gagal menghapus akun: " + error.message);
                    setIsLoading(false);
                  } else {
                    await signOut();
                  }
                }
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mt-2 hover:bg-red-50 text-red-600 text-xs font-medium rounded-xl transition-colors border border-transparent hover:border-red-100"
          >
            Hapus Akun
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 flex items-center justify-between px-8 bg-white sticky top-0 z-20 shadow-sm shadow-slate-100/50">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              {activeTab === "dashboard" ? "Sales Overview" : activeTab === "trends" ? "Strategic Trends" : activeTab === "finance" ? "Finance Report" : "All Transactions"}
            </h2>
            <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-400">
              <Calendar size={14} className="text-indigo-500" />
              <span>
                {startDate && endDate ? (
                  `${format(parseISO(startDate), 'd MMM')} - ${format(parseISO(endDate), 'd MMM yyyy')}`
                ) : (
                  "Select date range"
                )}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-900">{format(new Date(), "HH:mm")} WIB</div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none">Jakarta Local</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-indigo-600 font-bold">
              <CheckCircle2 size={18} />
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8 animate-in fade-in duration-500">
          {activeTab === "dashboard" ? (
            <>
              {/* Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: "Gross Revenue", value: `$${summary.totalRevenue.toFixed(2)}`, icon: <DollarSign size={20} className="text-emerald-500" />, bg: "bg-emerald-50" },
                  { label: "Orders Count", value: summary.totalOrders, icon: <FileText size={20} className="text-indigo-500" />, bg: "bg-indigo-50" },
                  { label: "Success Rate", value: `${summary.successRate.toFixed(1)}%`, icon: <CheckCircle2 size={20} className="text-emerald-500" />, bg: "bg-emerald-50" },
                  { label: "Avg. Value", value: `$${summary.averageOrderValue.toFixed(2)}`, icon: <TrendingUp size={20} className="text-purple-500" />, bg: "bg-purple-50" },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4"
                  >
                    <div className={cn("p-3 rounded-xl shrink-0", card.bg)}>
                      {card.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{card.label}</div>
                      <div className="text-xl font-bold text-slate-900 mt-0.5">{card.value}</div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Status Specific Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {[
                  { label: "Completed Count", value: summary.completedOrders, icon: <CheckCircle2 size={20} className="text-emerald-500" />, bg: "bg-emerald-50" },
                  { label: "Delivered Count", value: summary.deliveredOrders, icon: <Download size={20} className="text-blue-500" />, bg: "bg-blue-50" },
                  { label: "Canceled Count", value: summary.canceledOrders, icon: <XCircle size={20} className="text-rose-500" />, bg: "bg-rose-50" },
                  { label: "Avg. Daily Trx", value: summary.averageDailyTransactions.toFixed(1), icon: <Calendar size={20} className="text-blue-500" />, bg: "bg-blue-50" },
                  { label: "Avg. Daily Rev", value: `$${summary.averageDailyRevenue.toFixed(2)}`, icon: <DollarSign size={20} className="text-emerald-500" />, bg: "bg-emerald-50" },
                ].map((card, i) => (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (i + 4) * 0.1 }}
                    className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4"
                  >
                    <div className={cn("p-3 rounded-xl shrink-0", card.bg)}>
                      {card.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{card.label}</div>
                      <div className="text-xl font-bold text-slate-900 mt-0.5">{card.value}</div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart Area */}
                <div className="lg:col-span-2 bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-slate-900">Revenue Performance</h3>
                      <p className="text-xs text-slate-400 font-medium tracking-wide">Daily sales growth in WIB (GMT+7)</p>
                    </div>
                    <div className="px-3 py-1 bg-indigo-50 rounded-full">
                       <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest uppercase">Actual Revenue</span>
                    </div>
                  </div>

                  <div className="h-[320px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                          tickFormatter={(val) => `$${val}`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#4f46e5" 
                          strokeWidth={3} 
                          dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                          activeDot={{ r: 6, strokeWidth: 0, fill: "#4f46e5" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Items */}
                <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                   <h3 className="text-base font-bold text-slate-900 mb-6">Best Selling Items</h3>
                   <div className="space-y-5">
                    {topItems.map((item, i) => (
                      <div key={item.title} className="group">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-xs font-bold text-slate-600 truncate max-w-[160px]" title={item.title}>{item.title}</span>
                          <span className="text-xs font-bold text-indigo-600">${item.revenue.toFixed(1)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 w-full rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.revenue / topItems[0].revenue) * 100}%` }}
                            className="h-full bg-indigo-500 rounded-full"
                          />
                        </div>
                      </div>
                    ))}
                    {topItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                        <AlertCircle size={40} className="mb-2" />
                        <p className="text-sm font-medium">No sales data</p>
                      </div>
                    )}
                   </div>
                </div>
              </div>
            </>
          ) : activeTab === "transactions" ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-500">
              {/* Table Area */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                 <div className="px-8 py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-slate-900">All Transactions</h3>
                      {searchSummary && (
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg w-fit">
                          <Search size={12} />
                          Found {searchSummary.count} results &bull; Total ${searchSummary.revenue.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-100 rounded-xl overflow-x-auto">
                      {["All", "Completed", "Canceled"].map((s) => (
                        <button
                          key={s}
                          onClick={() => setFilterState(s)}
                          className={cn(
                            "px-4 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0",
                            filterState === s ? "bg-white text-indigo-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                 </div>

                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest font-bold border-b border-slate-100">
                          <th 
                            className="px-8 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => requestSort('orderId')}
                          >
                            <div className="flex items-center gap-1.5">
                              Reference
                              <div className="w-3 h-3 flex items-center justify-center">
                                {sortConfig?.key === 'orderId' ? (
                                  sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />
                                ) : <ChevronDown size={12} className="opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                          </th>
                          <th 
                            className="px-8 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => requestSort('title')}
                          >
                            <div className="flex items-center gap-1.5">
                              Product Details
                              <div className="w-3 h-3 flex items-center justify-center">
                                {sortConfig?.key === 'title' ? (
                                  sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />
                                ) : <ChevronDown size={12} className="opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                          </th>
                          <th 
                            className="px-8 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => requestSort('totalOrderAmount')}
                          >
                            <div className="flex items-center gap-1.5">
                              Financials
                              <div className="w-3 h-3 flex items-center justify-center">
                                {sortConfig?.key === 'totalOrderAmount' ? (
                                  sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />
                                ) : <ChevronDown size={12} className="opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                          </th>
                          <th 
                            className="px-8 py-4 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => requestSort('orderState')}
                          >
                            <div className="flex items-center gap-1.5">
                              Status
                              <div className="w-3 h-3 flex items-center justify-center">
                                {sortConfig?.key === 'orderState' ? (
                                  sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />
                                ) : <ChevronDown size={12} className="opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                          </th>
                          <th 
                            className="px-8 py-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => requestSort('localDate')}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              Timestamp
                              <div className="w-3 h-3 flex items-center justify-center">
                                {sortConfig?.key === 'localDate' ? (
                                  sortConfig.direction === 'asc' ? <ChevronUp size={12} className="text-indigo-600" /> : <ChevronDown size={12} className="text-indigo-600" />
                                ) : <ChevronDown size={12} className="opacity-0 group-hover:opacity-100" />}
                              </div>
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredOrders.slice(0, rowsPerPage).map((order) => (
                          <tr key={order.orderId} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="px-8 py-4">
                              <div className="text-[11px] font-bold text-slate-400 font-mono">
                                #{order.orderId.substring(0, 8).toUpperCase()}
                              </div>
                            </td>
                            <td className="px-8 py-4">
                              <div className="text-[13px] font-bold text-slate-700 max-w-xs truncate leading-tight">
                                {order.title}
                              </div>
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">{order.offerType}</div>
                            </td>
                            <td className="px-8 py-4">
                              <div className="text-sm font-bold text-slate-900">${order.totalOrderAmount.toFixed(2)}</div>
                              <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">x{order.purchaseQuantity} items</div>
                            </td>
                            <td className="px-8 py-4">
                               <div className={cn(
                                 "inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full",
                                 order.orderState === "Completed" ? "text-emerald-600 bg-emerald-50" :
                                 order.orderState === "Canceled" ? "text-rose-600 bg-rose-50" :
                                 "text-indigo-600 bg-indigo-50"
                               )}>
                                 <span className={cn("w-1 h-1 rounded-full animate-pulse", 
                                   order.orderState === "Completed" ? "bg-emerald-500" :
                                   order.orderState === "Canceled" ? "bg-rose-500" :
                                   "bg-indigo-500"
                                 )} />
                                 {order.orderState}
                               </div>
                            </td>
                            <td className="px-8 py-4 text-right">
                              <div className="text-[12px] font-bold text-slate-700">{format(order.localDate, "dd MMM yyyy")}</div>
                              <div className="text-[11px] text-slate-400 font-medium">{format(order.localDate, "HH:mm")} WIB</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                 </div>
                 <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Show rows:</span>
                      <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
                        {[10, 50, 100].map((rows) => (
                          <button
                            key={rows}
                            onClick={() => setRowsPerPage(rows)}
                            className={cn(
                              "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                              rowsPerPage === rows 
                                ? "bg-indigo-600 text-white shadow-sm" 
                                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {rows}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Viewing {Math.min(rowsPerPage, filteredOrders.length)} of {filteredOrders.length} records
                    </div>
                 </div>
              </div>
            </div>
          ) : activeTab === "finance" ? (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
               {/* Finance Controls */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
                    <div className="flex items-center gap-3 text-indigo-600 mb-2">
                       <DollarSign size={20} />
                       <h3 className="font-bold text-sm uppercase tracking-wider">Exchange Rate</h3>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] text-slate-400 font-bold uppercase">USD to IDR Kurs</label>
                       <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rp</span>
                          <input 
                            type="number"
                            value={exchangeRate}
                            onChange={(e) => setExchangeRate(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                          />
                       </div>
                       <p className="text-[9px] text-slate-400 font-medium italic">* Affects all IDR calculations below</p>
                    </div>
                 </div>

                 <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-violet-700 p-8 rounded-2xl shadow-xl shadow-indigo-100 text-white relative overflow-hidden">
                    <div className="relative z-10 flex flex-col h-full justify-between">
                       <div className="space-y-1">
                          <div className="text-xs font-bold text-white/60 uppercase tracking-widest">Net Revenue Estimate</div>
                          <div className="text-4xl font-bold">
                             Rp {((summary.totalRevenue * exchangeRate) * 0.96 - (2 * exchangeRate)).toLocaleString('id-ID')}
                          </div>
                          <div className="text-sm font-medium text-white/80">
                             ≈ ${(summary.totalRevenue * 0.96 - 2).toFixed(2)} USD (After Payoneer Fees)
                          </div>
                       </div>
                       <div className="flex items-center gap-4 mt-6">
                          <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-wider">
                             Fee: 4% + $2.00
                          </div>
                       </div>
                    </div>
                    <Wallet className="absolute -right-8 -bottom-8 text-white/5 w-48 h-48" />
                 </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Detailed Struk / Receipt */}
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-8 relative overflow-hidden" id="finance-report">
                     <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                              <Receipt size={20} />
                           </div>
                           <div>
                              <h3 className="font-bold text-slate-900 leading-tight tracking-tight">Finance Statement</h3>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">{startDate} to {endDate}</p>
                           </div>
                        </div>
                        <CheckCircle2 className="text-emerald-500" size={24} />
                     </div>

                     <div className="space-y-6">
                        <div className="space-y-3">
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 font-medium">Gross Revenue (USD)</span>
                              <span className="text-slate-900 font-bold">${summary.totalRevenue.toFixed(2)}</span>
                           </div>
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 font-medium">Exchange Rate (Kurs)</span>
                              <span className="text-slate-900 font-bold">Rp {exchangeRate.toLocaleString()}</span>
                           </div>
                           <div className="h-px bg-slate-50" />
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-500 font-medium">Gross Revenue (IDR)</span>
                              <span className="text-slate-900 font-bold">Rp {(summary.totalRevenue * exchangeRate).toLocaleString('id-ID')}</span>
                           </div>
                        </div>

                        <div className="bg-rose-50/50 p-4 rounded-xl space-y-3 border border-rose-100/50">
                           <div className="flex items-center gap-2 text-rose-600 mb-1">
                              <Percent size={14} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Deductions (Payoneer)</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Processing Fee (4%)</span>
                              <span className="text-rose-600 font-bold">- Rp {(summary.totalRevenue * 0.04 * exchangeRate).toLocaleString('id-ID')}</span>
                           </div>
                           <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Withdrawal Service (Flat $2.00)</span>
                              <span className="text-rose-600 font-bold">- Rp {(2 * exchangeRate).toLocaleString('id-ID')}</span>
                           </div>
                        </div>

                        <div className="pt-4 border-t-2 border-dashed border-slate-100">
                           <div className="flex justify-between items-center">
                              <span className="text-lg font-bold text-slate-900 tracking-tight">Net Total IDR</span>
                              <span className="text-2xl font-black text-indigo-600">
                                 Rp {((summary.totalRevenue * exchangeRate) * 0.96 - (2 * exchangeRate)).toLocaleString('id-ID')}
                              </span>
                           </div>
                        </div>
                     </div>

                     <div className="bg-slate-50 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle size={16} className="text-slate-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                           This report is an estimation based on the Payoneer fee structure provided (4% + $2). 
                           Actual bank conversion rates and intermediate fees may vary depending on the destination bank.
                        </p>
                     </div>
                  </div>

                  {/* Summary Breakdown */}
                  <div className="space-y-6">
                     <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Volume Statistics</h4>
                        <div className="space-y-4">
                           <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                                    <FileText size={16} />
                                 </div>
                                 <span className="text-sm font-semibold text-slate-700">Total Transactions</span>
                              </div>
                              <span className="text-sm font-bold text-slate-900">{summary.totalOrders}</span>
                           </div>
                           <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-lg bg-emerald-600/10 text-emerald-600 flex items-center justify-center">
                                    <TrendingUp size={16} />
                                 </div>
                                 <span className="text-sm font-semibold text-slate-700">Avg. Order Value</span>
                              </div>
                              <span className="text-sm font-bold text-slate-900">${summary.averageOrderValue.toFixed(2)}</span>
                           </div>
                        </div>
                     </div>

                     <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden relative">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Currency Trend</h4>
                        <div className="text-xs text-slate-500 mb-6 font-medium">
                           The current rate of <span className="font-bold text-slate-900">1 USD = Rp {exchangeRate.toLocaleString()}</span> is used to normalize your earnings into local currency.
                        </div>
                        <div className="flex items-end gap-2 h-24">
                           {[40, 70, 45, 90, 65, 80, 55, 60, 85, 95].map((h, i) => (
                              <div 
                                 key={i} 
                                 className="flex-1 bg-indigo-100 rounded-t-sm hover:bg-indigo-600 transition-colors cursor-help"
                                 style={{ height: `${h}%` }}
                                 title="Rate stability index"
                              />
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Canceled Orders Chart */}
                <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-slate-900">Canceled Orders Trend</h3>
                      <p className="text-xs text-slate-400 font-medium tracking-wide">Daily cancellation volume analysis</p>
                    </div>
                    <div className="px-3 py-1 bg-rose-50 rounded-full border border-rose-100">
                       <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Canceled Count</span>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="canceled" 
                          stroke="#f43f5e" 
                          strokeWidth={3} 
                          dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                          activeDot={{ r: 6, strokeWidth: 0, fill: "#f43f5e" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Hourly Activity Chart */}
                <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-slate-900">Order Pulse</h3>
                      <p className="text-xs text-slate-400 font-medium tracking-wide">Activity distribution by hour (WIB)</p>
                    </div>
                    <div className="px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100">
                       <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Activity Score</span>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="hour" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 11, fill: "#94a3b8", fontWeight: 600 }}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }}
                          contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        />
                        <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={25} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

               <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-6">Cancellation Insights</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Total Canceled</div>
                      <div className="text-2xl font-bold text-rose-600">{summary.canceledOrders}</div>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Success Velocity</div>
                      <div className="text-2xl font-bold text-emerald-600">{summary.completedOrders}</div>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Health Index</div>
                      <div className="text-2xl font-bold text-indigo-600">{summary.successRate.toFixed(1)}%</div>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>
        
        <footer className="py-8 text-center text-slate-400 text-xs border-t border-slate-100 bg-white">
          <p>Sales Dashboard Analytics &bull; Jakarta (GMT+7) Timezone</p>
        </footer>

        {isLoading && (
          <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-indigo-600 text-sm font-bold tracking-tight animate-pulse">Syncing Sales Data...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
