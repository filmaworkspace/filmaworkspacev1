"use client";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Inter } from "next/font/google";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from "firebase/firestore";
import { CreditCard, Plus, Search, Trash2, X, CheckCircle2, Calendar, FileText, ArrowLeft, MoreHorizontal, Receipt, GripVertical, Upload, Clock, Banknote, Shield, Landmark, ChevronRight, Eye, Edit3, Send, LayoutGrid, List, Wallet, PiggyBank, CircleDollarSign, FolderOpen, Download, ChevronDown, AlertTriangle, FileCheck, ExternalLink } from "lucide-react";
import jsPDF from "jspdf";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const PAYMENT_TYPES = {
  invoice: { label: "Pago de factura", icon: Receipt, color: "emerald" },
  partial: { label: "Pago parcial", icon: CircleDollarSign, color: "blue" },
  proforma: { label: "Pago de proforma", icon: FileText, color: "violet" },
  budget: { label: "Pago de presupuesto", icon: Wallet, color: "amber" },
  deposit: { label: "Pago de depósito", icon: PiggyBank, color: "indigo" },
  guarantee: { label: "Pago de fianza", icon: Shield, color: "slate" },
};

type PaymentType = keyof typeof PAYMENT_TYPES;

interface Invoice {
  id: string;
  number: string;
  displayNumber?: string;
  supplier: string;
  supplierId: string;
  description: string;
  totalAmount: number;
  baseAmount: number;
  status: string;
  dueDate: Date;
  createdAt: Date;
  department?: string;
}

interface PaymentItem {
  id: string;
  type: PaymentType;
  invoiceId?: string;
  invoiceNumber?: string;
  supplier: string;
  description: string;
  amount: number;
  partialAmount?: number;
  department?: string;
  addedBy: string;
  addedByName: string;
  addedAt: Date;
  status: "pending" | "completed";
  receiptUrl?: string;
  receiptName?: string;
  completedAt?: Date;
  completedBy?: string;
  completedByName?: string;
}

interface PaymentForecast {
  id: string;
  name: string;
  paymentDate: Date;
  type: "remesa" | "fuera_remesa";
  status: "draft" | "pending" | "completed";
  items: PaymentItem[];
  totalAmount: number;
  notes?: string;
  createdAt: Date;
  createdBy: string;
  createdByName: string;
}

const DATE_RANGES = [
  { id: "all", label: "Todas las fechas" },
  { id: "this_week", label: "Esta semana" },
  { id: "next_15", label: "Próximos 15 días" },
  { id: "this_month", label: "Este mes" },
  { id: "next_month", label: "Próximo mes" },
  { id: "custom", label: "Personalizado" },
];

export default function PaymentsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [forecasts, setForecasts] = useState<PaymentForecast[]>([]);
  const [availableInvoices, setAvailableInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [invoiceSortBy, setInvoiceSortBy] = useState<"dueDate" | "amount" | "supplier">("dueDate");
  const [invoiceDueDateFilter, setInvoiceDueDateFilter] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showForecastDetail, setShowForecastDetail] = useState<PaymentForecast | null>(null);
  const [showUploadReceipt, setShowUploadReceipt] = useState<{ forecast: PaymentForecast; item: PaymentItem } | null>(null);
  const [newForecast, setNewForecast] = useState({ name: "", paymentDate: "", type: "remesa" as "remesa" | "fuera_remesa" });
  const [selectedForecastId, setSelectedForecastId] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState({ type: "invoice" as PaymentType, invoiceId: "", supplier: "", description: "", amount: 0, partialAmount: 0 });
  const [draggedInvoice, setDraggedInvoice] = useState<Invoice | null>(null);
  const [dragOverForecast, setDragOverForecast] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSearchFocused, setInvoiceSearchFocused] = useState(false);
  const [amountRange, setAmountRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [showAmountFilter, setShowAmountFilter] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const invoiceSearchRef = useRef<HTMLInputElement>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || user.email || "Usuario");
      } else {
        router.push("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (userId && id) loadData();
  }, [userId, id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".menu-container")) setOpenMenuId(null);
      if (datePickerRef.current && !datePickerRef.current.contains(target)) setShowDatePicker(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const projectDoc = await getDoc(doc(db, "projects", id));
      if (projectDoc.exists()) setProjectName(projectDoc.data().name || "Proyecto");

      const forecastsSnap = await getDocs(query(collection(db, `projects/${id}/paymentForecasts`), orderBy("paymentDate", "asc")));
      const forecastsData = forecastsSnap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name,
          paymentDate: data.paymentDate?.toDate() || new Date(),
          type: data.type,
          status: data.status,
          totalAmount: data.totalAmount || 0,
          notes: data.notes,
          createdAt: data.createdAt?.toDate() || new Date(),
          createdBy: data.createdBy,
          createdByName: data.createdByName,
          items: (data.items || []).map((item: any) => ({
            ...item,
            addedAt: item.addedAt?.toDate ? item.addedAt.toDate() : new Date(),
            completedAt: item.completedAt?.toDate ? item.completedAt.toDate() : undefined,
            status: item.status || "pending",
          })),
        } as PaymentForecast;
      });
      setForecasts(forecastsData);

      const invoicesSnap = await getDocs(query(collection(db, `projects/${id}/invoices`), orderBy("dueDate", "asc")));
      const assignedInvoiceIds = new Set<string>();
      forecastsData.forEach((f) => f.items.forEach((item) => { if (item.invoiceId) assignedInvoiceIds.add(item.invoiceId); }));

      const invoicesData = invoicesSnap.docs
        .filter((docSnap) => {
          const data = docSnap.data();
          return (data.status === "pending" || data.status === "overdue" || data.status === "pending_approval") && !assignedInvoiceIds.has(docSnap.id);
        })
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
          dueDate: docSnap.data().dueDate?.toDate() || new Date(),
          createdAt: docSnap.data().createdAt?.toDate() || new Date(),
        })) as Invoice[];
      setAvailableInvoices(invoicesData);
    } catch (error) {
      console.error("Error loading data:", error);
      showToast("error", "Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const getDateRangeFilter = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (dateRange) {
      case "this_week": {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
        return { start: today, end: endOfWeek };
      }
      case "next_15": {
        const end = new Date(today);
        end.setDate(today.getDate() + 15);
        return { start: today, end };
      }
      case "this_month": {
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { start: today, end: endOfMonth };
      }
      case "next_month": {
        const startNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const endNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        return { start: startNextMonth, end: endNextMonth };
      }
      case "custom":
        return { start: customDateStart ? new Date(customDateStart) : null, end: customDateEnd ? new Date(customDateEnd) : null };
      default:
        return { start: null, end: null };
    }
  };

  const getDaysUntilPayment = (date: Date) => Math.ceil((date.getTime() - Date.now()) / 86400000);

  const filteredForecasts = forecasts.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase()) || f.items.some((item) => item.supplier.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    const { start, end } = getDateRangeFilter();
    const matchesDate = (!start || f.paymentDate >= start) && (!end || f.paymentDate <= end);
    return matchesSearch && matchesStatus && matchesDate;
  });

  const filteredInvoices = availableInvoices
    .filter((inv) => {
      const searchLower = invoiceSearch.toLowerCase().trim();
      if (searchLower) {
        const matchesNumber = (inv.displayNumber || inv.number || "").toLowerCase().includes(searchLower);
        const matchesSupplier = inv.supplier.toLowerCase().includes(searchLower);
        const matchesDescription = (inv.description || "").toLowerCase().includes(searchLower);
        if (!matchesNumber && !matchesSupplier && !matchesDescription) return false;
      }
      
      const minAmount = amountRange.min ? parseFloat(amountRange.min) : null;
      const maxAmount = amountRange.max ? parseFloat(amountRange.max) : null;
      if (minAmount !== null && inv.totalAmount < minAmount) return false;
      if (maxAmount !== null && inv.totalAmount > maxAmount) return false;
      
      if (invoiceDueDateFilter === "all") return true;
      const days = getDaysUntilPayment(inv.dueDate);
      if (invoiceDueDateFilter === "overdue") return days < 0;
      if (invoiceDueDateFilter === "week") return days >= 0 && days <= 7;
      if (invoiceDueDateFilter === "month") return days >= 0 && days <= 30;
      return true;
    })
    .sort((a, b) => {
      if (invoiceSortBy === "dueDate") return a.dueDate.getTime() - b.dueDate.getTime();
      if (invoiceSortBy === "amount") return b.totalAmount - a.totalAmount;
      if (invoiceSortBy === "supplier") return a.supplier.localeCompare(b.supplier);
      return 0;
    });

  const invoiceStats = {
    total: availableInvoices.length,
    filtered: filteredInvoices.length,
    overdue: availableInvoices.filter((inv) => getDaysUntilPayment(inv.dueDate) < 0).length,
    dueSoon: availableInvoices.filter((inv) => { const d = getDaysUntilPayment(inv.dueDate); return d >= 0 && d <= 7; }).length,
    totalAmount: filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
  };

  const overdueInvoicesCount = invoiceStats.overdue;

  const clearInvoiceFilters = () => {
    setInvoiceSearch("");
    setInvoiceDueDateFilter("all");
    setAmountRange({ min: "", max: "" });
    setInvoiceSortBy("dueDate");
  };

  const hasActiveFilters = invoiceSearch || invoiceDueDateFilter !== "all" || amountRange.min || amountRange.max;

  const handleCreateForecast = async () => {
    if (!newForecast.name.trim() || !newForecast.paymentDate) {
      showToast("error", "Completa todos los campos");
      return;
    }
    try {
      await addDoc(collection(db, `projects/${id}/paymentForecasts`), {
        name: newForecast.name.trim(),
        paymentDate: Timestamp.fromDate(new Date(newForecast.paymentDate)),
        type: newForecast.type,
        status: "draft",
        items: [],
        totalAmount: 0,
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByName: userName,
      });
      setShowCreateModal(false);
      setNewForecast({ name: "", paymentDate: "", type: "remesa" });
      showToast("success", "Previsión creada");
      loadData();
    } catch (error) {
      console.error("Error:", error);
      showToast("error", "Error al crear la previsión");
    }
  };

  const handleAddPaymentToForecast = async (forecastId: string, invoice?: Invoice) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast || forecast.status !== "draft") {
      showToast("error", "Solo se pueden añadir pagos a borradores");
      return;
    }

    const paymentItem: PaymentItem = {
      id: `item_${Date.now()}`,
      type: invoice ? "invoice" : newPayment.type,
      invoiceId: invoice?.id || newPayment.invoiceId || undefined,
      invoiceNumber: invoice?.number || undefined,
      supplier: invoice?.supplier || newPayment.supplier,
      description: invoice?.description || newPayment.description,
      amount: invoice?.totalAmount || newPayment.amount,
      department: invoice?.department,
      addedBy: userId!,
      addedByName: userName,
      addedAt: new Date(),
      status: "pending",
    };

    if (newPayment.type === "partial" && newPayment.partialAmount > 0) {
      paymentItem.partialAmount = newPayment.partialAmount;
      paymentItem.amount = newPayment.partialAmount;
    }

    const updatedItems = [...forecast.items, paymentItem];
    const totalAmount = updatedItems.reduce((sum, item) => sum + (item.partialAmount || item.amount), 0);

    try {
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), { items: updatedItems, totalAmount });
      setShowAddPaymentModal(false);
      setSelectedForecastId(null);
      setNewPayment({ type: "invoice", invoiceId: "", supplier: "", description: "", amount: 0, partialAmount: 0 });
      showToast("success", "Pago añadido");
      loadData();
    } catch (error) {
      console.error("Error:", error);
      showToast("error", "Error al añadir el pago");
    }
  };

  const handleRemovePaymentItem = async (forecastId: string, itemId: string) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast || forecast.status !== "draft") return;
    const updatedItems = forecast.items.filter((item) => item.id !== itemId);
    const totalAmount = updatedItems.reduce((sum, item) => sum + (item.partialAmount || item.amount), 0);
    try {
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), { items: updatedItems, totalAmount });
      showToast("success", "Pago eliminado");
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleSendForecast = async (forecastId: string) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast || forecast.status !== "draft" || forecast.items.length === 0) {
      showToast("error", "Añade al menos un pago antes de enviar");
      return;
    }
    try {
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), { status: "pending" });
      showToast("success", "Previsión enviada");
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleCompletePaymentItem = async (forecastId: string, itemId: string, receiptUrl?: string, receiptName?: string) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast) return;

    const updatedItems = forecast.items.map((item) => {
      if (item.id === itemId) {
        return { ...item, status: "completed" as const, receiptUrl: receiptUrl || "", receiptName: receiptName || "Justificante", completedAt: new Date(), completedBy: userId, completedByName: userName };
      }
      return item;
    });

    const allCompleted = updatedItems.every((item) => item.status === "completed");

    try {
      await updateDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId), { items: updatedItems, status: allCompleted ? "completed" : forecast.status });
      const item = forecast.items.find((i) => i.id === itemId);
      if (item?.invoiceId && item.type !== "partial") {
        await updateDoc(doc(db, `projects/${id}/invoices`, item.invoiceId), { status: "paid", paidAt: Timestamp.now(), paymentForecastId: forecastId });
      }
      setShowUploadReceipt(null);
      showToast("success", "Pago completado");
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDeleteForecast = async (forecastId: string) => {
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (!forecast) return;
    if (forecast.items.some((item) => item.status === "completed")) {
      showToast("error", "No se puede eliminar una previsión con pagos completados");
      return;
    }
    if (!confirm("¿Eliminar esta previsión de pago?")) return;
    try {
      await deleteDoc(doc(db, `projects/${id}/paymentForecasts`, forecastId));
      showToast("success", "Previsión eliminada");
      loadData();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDragStart = (invoice: Invoice) => setDraggedInvoice(invoice);
  const handleDragOver = (e: React.DragEvent, forecastId: string) => {
    e.preventDefault();
    const forecast = forecasts.find((f) => f.id === forecastId);
    if (forecast?.status === "draft") setDragOverForecast(forecastId);
  };
  const handleDragLeave = () => setDragOverForecast(null);
  const handleDrop = async (e: React.DragEvent, forecastId: string) => {
    e.preventDefault();
    setDragOverForecast(null);
    if (draggedInvoice) {
      await handleAddPaymentToForecast(forecastId, draggedInvoice);
      setDraggedInvoice(null);
    }
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
  const formatDate = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "-";
  const formatDateShort = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(date) : "-";
  const formatDateTime = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "-";
  const formatDateForFile = (date: Date) => date ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date).replace(/\//g, "-") : "";

  const getStatusConfig = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: string; icon: typeof Edit3 }> = {
      draft: { bg: "bg-slate-100", text: "text-slate-700", label: "Borrador", icon: Edit3 },
      pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Pendiente", icon: Clock },
      completed: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completada", icon: CheckCircle2 },
    };
    return config[status] || config.draft;
  };

  const getTypeConfig = (type: "remesa" | "fuera_remesa") => type === "remesa" ? { bg: "bg-indigo-50", text: "text-indigo-700", label: "Remesa", icon: Landmark } : { bg: "bg-violet-50", text: "text-violet-700", label: "Fuera de remesa", icon: Banknote };

  const getCompletionProgress = (forecast: PaymentForecast) => {
    if (forecast.items.length === 0) return { completed: 0, total: 0, percent: 0 };
    const completed = forecast.items.filter((item) => item.status === "completed").length;
    return { completed, total: forecast.items.length, percent: Math.round((completed / forecast.items.length) * 100) };
  };

  const toggleRowExpanded = (forecastId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(forecastId)) newExpanded.delete(forecastId);
    else newExpanded.add(forecastId);
    setExpandedRows(newExpanded);
  };

  const exportForecastPDF = (forecast: PaymentForecast) => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    pdf.setFillColor(109, 40, 217);
    pdf.rect(0, 0, pageWidth, 45, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    pdf.text("PREVISIÓN DE PAGO", margin, 20);
    pdf.setFontSize(14);
    pdf.text(forecast.name, margin, 32);
    pdf.setFontSize(10);
    pdf.text(forecast.type === "remesa" ? "REMESA BANCARIA" : "FUERA DE REMESA", margin, 40);

    y = 55;
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, y, (pageWidth - margin * 2 - 10) / 2, 25, 3, 3, "F");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("FECHA DE PAGO", margin + 5, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(12);
    pdf.text(formatDate(forecast.paymentDate), margin + 5, y + 18);

    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin + (pageWidth - margin * 2 - 10) / 2 + 10, y, (pageWidth - margin * 2 - 10) / 2, 25, 3, 3, "F");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("IMPORTE TOTAL", margin + (pageWidth - margin * 2 - 10) / 2 + 15, y + 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(12);
    pdf.text(formatCurrency(forecast.totalAmount) + " €", margin + (pageWidth - margin * 2 - 10) / 2 + 15, y + 18);

    y += 35;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.text("ESTADO: " + getStatusConfig(forecast.status).label.toUpperCase(), margin, y);
    y += 10;
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("PAGOS (" + forecast.items.length + ")", margin, y);
    y += 8;

    forecast.items.forEach((item, index) => {
      if (y > 260) { pdf.addPage(); y = margin; }
      pdf.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
      pdf.roundedRect(margin, y, pageWidth - margin * 2, 20, 0, 0, "F");
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text((item.invoiceNumber ? "FAC-" + item.invoiceNumber : item.description).substring(0, 40), margin + 5, y + 7);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(item.supplier.substring(0, 40), margin + 5, y + 14);
      if (item.status === "completed") { pdf.setTextColor(16, 185, 129); pdf.text("Completado", pageWidth - margin - 50, y + 7); }
      else { pdf.setTextColor(245, 158, 11); pdf.text("Pendiente", pageWidth - margin - 50, y + 7); }
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text(formatCurrency(item.partialAmount || item.amount) + " €", pageWidth - margin - 5, y + 14, { align: "right" });
      y += 22;
    });

    y += 10;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Generado el " + formatDateTime(new Date()) + " - Creado por " + forecast.createdByName, margin, y);
    pdf.save("Prevision_" + forecast.name.replace(/\s+/g, "_") + "_" + formatDateForFile(forecast.paymentDate) + ".pdf");
  };

  const exportFilteredForecastsPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    pdf.setFillColor(109, 40, 217);
    pdf.rect(0, 0, pageWidth, 35, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(20);
    pdf.setFont("helvetica", "bold");
    pdf.text("PREVISIONES DE PAGO", margin, 18);
    pdf.setFontSize(10);
    pdf.text(projectName, margin, 28);

    y = 45;
    const totalAmount = filteredForecasts.reduce((sum, f) => sum + f.totalAmount, 0);
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(10);
    pdf.text(filteredForecasts.length + " previsiones - Total: " + formatCurrency(totalAmount) + " €", margin, y);
    y += 15;

    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, y, pageWidth - margin * 2, 10, "F");
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("PREVISIÓN", margin + 5, y + 7);
    pdf.text("FECHA", margin + 70, y + 7);
    pdf.text("ESTADO", margin + 100, y + 7);
    pdf.text("PAGOS", margin + 130, y + 7);
    pdf.text("IMPORTE", pageWidth - margin - 5, y + 7, { align: "right" });
    y += 12;

    filteredForecasts.forEach((forecast) => {
      if (y > 270) { pdf.addPage(); y = margin; }
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(forecast.name.substring(0, 30), margin + 5, y + 5);
      pdf.text(formatDateShort(forecast.paymentDate), margin + 70, y + 5);
      pdf.text(getStatusConfig(forecast.status).label, margin + 100, y + 5);
      pdf.text(String(forecast.items.length), margin + 130, y + 5);
      pdf.setFont("helvetica", "bold");
      pdf.text(formatCurrency(forecast.totalAmount) + " €", pageWidth - margin - 5, y + 5, { align: "right" });
      y += 10;
    });

    y += 10;
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text("Generado el " + formatDateTime(new Date()), margin, y);
    pdf.save("Previsiones_" + projectName.replace(/\s+/g, "_") + "_" + formatDateForFile(new Date()) + ".pdf");
  };

  if (loading) return (<div className={`min-h-screen bg-white flex items-center justify-center ${inter.className}`}><div className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" /></div>);

  return (
    <div className={`min-h-screen bg-white ${inter.className}`}>
      {toast && (<div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === "success" ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>{toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{toast.message}</div>)}

      <div className="mt-[4.5rem]">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-6">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"><ArrowLeft size={12} />Proyectos</Link>
              <span className="text-slate-300">·</span>
              <Link href={`/project/${id}/accounting`} className="hover:text-slate-900 transition-colors">Panel</Link>
              <span className="text-slate-300">·</span>
              <span className="uppercase text-slate-500">{projectName}</span>
            </div>
          </div>

          {/* Header con icono sin fondo y badges */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div className="flex items-center gap-3">
              <CreditCard size={24} className="text-violet-600" />
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-semibold text-slate-900">Previsiones de pago</h1>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium">
                  {forecasts.length} previsiones
                </span>
                <span className="px-3 py-1 bg-violet-50 text-violet-700 rounded-lg text-sm font-mono font-medium">
                  {formatCurrency(forecasts.reduce((s, f) => s + f.totalAmount, 0))} €
                </span>
              </div>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"><Plus size={18} />Nueva previsión</button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-8">
        {overdueInvoicesCount > 0 && (<div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><AlertTriangle size={20} className="text-red-600" /></div><div className="flex-1"><h3 className="font-semibold text-red-900">{overdueInvoicesCount} factura{overdueInvoicesCount > 1 ? "s" : ""} vencida{overdueInvoicesCount > 1 ? "s" : ""} sin asignar</h3><p className="text-sm text-red-700">Asígnalas a una previsión de pago para evitar retrasos.</p></div></div></div>)}

        {/* Filtros con altura unificada py-2.5 */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1 relative"><Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar previsión o proveedor..." className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm" /></div>
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-sm"><option value="all">Todos los estados</option><option value="draft">Borrador</option><option value="pending">Pendiente</option><option value="completed">Completada</option></select>
            <div className="relative" ref={datePickerRef}>
              <button onClick={(e) => { e.stopPropagation(); setShowDatePicker(!showDatePicker); }} className="px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm flex items-center gap-2 hover:border-slate-300"><Calendar size={16} className="text-slate-400" /><span className="text-slate-700">{DATE_RANGES.find((r) => r.id === dateRange)?.label}</span><ChevronDown size={14} className="text-slate-400" /></button>
              {showDatePicker && (<div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4"><div className="space-y-1 mb-4">{DATE_RANGES.filter((r) => r.id !== "custom").map((range) => (<button key={range.id} onClick={() => { setDateRange(range.id); if (range.id !== "custom") setShowDatePicker(false); }} className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors ${dateRange === range.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}>{range.label}</button>))}</div><div className="border-t border-slate-100 pt-4"><p className="text-xs font-medium text-slate-500 mb-2">Rango personalizado</p><div className="grid grid-cols-2 gap-2"><input type="date" value={customDateStart} onChange={(e) => { setCustomDateStart(e.target.value); setDateRange("custom"); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" /><input type="date" value={customDateEnd} onChange={(e) => { setCustomDateEnd(e.target.value); setDateRange("custom"); }} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>{dateRange === "custom" && (<button onClick={() => setShowDatePicker(false)} className="w-full mt-3 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg">Aplicar</button>)}</div></div>)}
            </div>
            <button onClick={exportFilteredForecastsPDF} className="px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm flex items-center gap-2 hover:border-slate-300 text-slate-700"><Download size={16} />PDF</button>
            <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white"><button onClick={() => setViewMode("kanban")} className={`px-4 py-2.5 text-sm transition-colors ${viewMode === "kanban" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}><LayoutGrid size={18} /></button><button onClick={() => setViewMode("list")} className={`px-4 py-2.5 text-sm transition-colors border-l border-slate-200 ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}><List size={18} /></button></div>
          </div>
        </div>

        <div className="flex gap-6">
          <div className="w-80 flex-shrink-0">
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden sticky top-24">
              {/* Header con estadísticas */}
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <Receipt size={16} className="text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm">Facturas pendientes</h3>
                      <p className="text-xs text-slate-500">{invoiceStats.filtered} de {invoiceStats.total} · <span className="font-mono">{formatCurrency(invoiceStats.totalAmount)} €</span></p>
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <button onClick={clearInvoiceFilters} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors" title="Limpiar filtros">
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                {/* Quick stats */}
                <div className="flex gap-2 mt-3">
                  <button 
                    onClick={() => setInvoiceDueDateFilter(invoiceDueDateFilter === "overdue" ? "all" : "overdue")}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${invoiceDueDateFilter === "overdue" ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-white/60 text-slate-600 hover:bg-white"}`}
                  >
                    <span className="text-red-600 font-bold">{invoiceStats.overdue}</span> vencidas
                  </button>
                  <button 
                    onClick={() => setInvoiceDueDateFilter(invoiceDueDateFilter === "week" ? "all" : "week")}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${invoiceDueDateFilter === "week" ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200" : "bg-white/60 text-slate-600 hover:bg-white"}`}
                  >
                    <span className="text-amber-600 font-bold">{invoiceStats.dueSoon}</span> próximas
                  </button>
                </div>
              </div>
              
              {/* Buscador principal */}
              <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={invoiceSearchRef}
                    type="text"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    onFocus={() => setInvoiceSearchFocused(true)}
                    onBlur={() => setTimeout(() => setInvoiceSearchFocused(false), 200)}
                    placeholder="Buscar nº, proveedor, concepto..."
                    className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white placeholder:text-slate-400"
                  />
                  {invoiceSearch && (
                    <button 
                      onClick={() => { setInvoiceSearch(""); invoiceSearchRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                {/* Filtros avanzados */}
                <div className="flex gap-2 mt-2">
                  <select 
                    value={invoiceSortBy} 
                    onChange={(e) => setInvoiceSortBy(e.target.value as any)} 
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="dueDate">Ordenar: Vencimiento</option>
                    <option value="amount">Ordenar: Importe ↓</option>
                    <option value="supplier">Ordenar: Proveedor A-Z</option>
                  </select>
                  
                  <div className="relative">
                    <button 
                      onClick={() => setShowAmountFilter(!showAmountFilter)}
                      className={`px-2.5 py-1.5 text-xs border rounded-lg flex items-center gap-1 transition-colors ${amountRange.min || amountRange.max ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      <CircleDollarSign size={12} />
                      Importe
                      <ChevronDown size={12} className={`transition-transform ${showAmountFilter ? "rotate-180" : ""}`} />
                    </button>
                    
                    {showAmountFilter && (
                      <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4">
                        <p className="text-xs font-medium text-slate-700 mb-3">Rango de importe (€)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">Mínimo</label>
                            <input
                              type="number"
                              value={amountRange.min}
                              onChange={(e) => setAmountRange({ ...amountRange, min: e.target.value })}
                              placeholder="0"
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">Máximo</label>
                            <input
                              type="number"
                              value={amountRange.max}
                              onChange={(e) => setAmountRange({ ...amountRange, max: e.target.value })}
                              placeholder="∞"
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <button 
                            onClick={() => { setAmountRange({ min: "", max: "" }); setShowAmountFilter(false); }}
                            className="flex-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                          >
                            Limpiar
                          </button>
                          <button 
                            onClick={() => setShowAmountFilter(false)}
                            className="flex-1 px-3 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Lista de facturas */}
              <div className="max-h-[420px] overflow-y-auto">
                {filteredInvoices.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      {invoiceSearch || hasActiveFilters ? <Search size={22} className="text-slate-400" /> : <CheckCircle2 size={22} className="text-emerald-500" />}
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {invoiceSearch || hasActiveFilters ? "Sin resultados" : "¡Todo al día!"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {invoiceSearch || hasActiveFilters ? "Prueba con otros filtros" : "No hay facturas pendientes"}
                    </p>
                    {hasActiveFilters && (
                      <button onClick={clearInvoiceFilters} className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredInvoices.slice(0, 50).map((invoice) => {
                      const days = getDaysUntilPayment(invoice.dueDate);
                      const isOverdue = days < 0;
                      const isDueSoon = days >= 0 && days <= 7;
                      
                      return (
                        <div
                          key={invoice.id}
                          draggable
                          onDragStart={() => handleDragStart(invoice)}
                          onDragEnd={() => setDraggedInvoice(null)}
                          className={`p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all border-2 group
                            ${draggedInvoice?.id === invoice.id ? "opacity-50 scale-95 border-emerald-300" : "border-transparent"}
                            ${isOverdue ? "bg-red-50 hover:bg-red-100 hover:border-red-300" : "bg-slate-50 hover:bg-slate-100 hover:border-emerald-300"}
                          `}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${isOverdue ? "bg-red-100 group-hover:bg-red-200" : "bg-slate-200 group-hover:bg-emerald-100"}`}>
                              <GripVertical size={12} className={`${isOverdue ? "text-red-400" : "text-slate-400 group-hover:text-emerald-600"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate font-mono">{invoice.displayNumber || `FAC-${invoice.number}`}</p>
                                  <p className="text-xs text-slate-600 truncate">{invoice.supplier}</p>
                                </div>
                                <p className="text-sm font-bold text-slate-900 flex-shrink-0 font-mono">{formatCurrency(invoice.totalAmount)} €</p>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOverdue ? "bg-red-100 text-red-700" : isDueSoon ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                                  {isOverdue ? `Vencida hace ${Math.abs(days)}d` : isDueSoon ? `Vence en ${days}d` : formatDateShort(invoice.dueDate)}
                                </span>
                                <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  Arrastra a previsión
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredInvoices.length > 50 && (
                      <div className="text-center py-3">
                        <p className="text-xs text-slate-500">Mostrando 50 de {filteredInvoices.length} facturas</p>
                        <p className="text-xs text-slate-400">Usa el buscador para encontrar más</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1">
            {filteredForecasts.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><CreditCard size={28} className="text-slate-400" /></div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{searchTerm || statusFilter !== "all" || dateRange !== "all" ? "No se encontraron resultados" : "Sin previsiones de pago"}</h3>
                <p className="text-slate-500 text-sm mb-6">{searchTerm || statusFilter !== "all" || dateRange !== "all" ? "Prueba a ajustar los filtros" : "Crea tu primera previsión para organizar los pagos"}</p>
                {!searchTerm && statusFilter === "all" && dateRange === "all" && (
                  <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800"><Plus size={18} />Nueva previsión</button>
                )}
              </div>
            ) : viewMode === "kanban" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredForecasts.map((forecast) => {
                  const statusConfig = getStatusConfig(forecast.status);
                  const typeConfig = getTypeConfig(forecast.type);
                  const daysUntil = getDaysUntilPayment(forecast.paymentDate);
                  const progress = getCompletionProgress(forecast);
                  const StatusIcon = statusConfig.icon;
                  const TypeIcon = typeConfig.icon;
                  
                  return (
                    <div
                      key={forecast.id}
                      onDragOver={(e) => handleDragOver(e, forecast.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, forecast.id)}
                      className={`bg-white border rounded-2xl overflow-hidden transition-all ${dragOverForecast === forecast.id && forecast.status === "draft" ? "border-emerald-400 ring-2 ring-emerald-100 scale-[1.01]" : "border-slate-200 hover:shadow-md"}`}
                    >
                      <div className="px-4 py-3 border-b border-slate-100">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-slate-900 truncate">{forecast.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Calendar size={12} className="text-slate-400" />
                              <span className={`text-xs ${daysUntil < 0 ? "text-red-600 font-semibold" : daysUntil <= 3 ? "text-amber-600 font-semibold" : "text-slate-500"}`}>
                                {formatDate(forecast.paymentDate)}
                                {daysUntil >= 0 && daysUntil <= 7 && ` (${daysUntil}d)`}
                                {daysUntil < 0 && ` (hace ${Math.abs(daysUntil)}d)`}
                              </span>
                            </div>
                          </div>
                          <div className="relative menu-container">
                            <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === forecast.id ? null : forecast.id); }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                              <MoreHorizontal size={16} />
                            </button>
                            {openMenuId === forecast.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
                                <button onClick={() => { setShowForecastDetail(forecast); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Eye size={14} /> Ver detalles</button>
                                <button onClick={() => { exportForecastPDF(forecast); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Download size={14} /> Exportar PDF</button>
                                {forecast.status === "draft" && (
                                  <>
                                    <button onClick={() => { setSelectedForecastId(forecast.id); setShowAddPaymentModal(true); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Plus size={14} /> Añadir pago</button>
                                    {forecast.items.length > 0 && (
                                      <button onClick={() => { handleSendForecast(forecast.id); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"><Send size={14} /> Enviar</button>
                                    )}
                                  </>
                                )}
                                <div className="border-t border-slate-100 my-1" />
                                <button onClick={() => { handleDeleteForecast(forecast.id); setOpenMenuId(null); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 size={14} /> Eliminar</button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${statusConfig.bg} ${statusConfig.text}`}><StatusIcon size={12} />{statusConfig.label}</span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${typeConfig.bg} ${typeConfig.text}`}><TypeIcon size={12} />{typeConfig.label}</span>
                        </div>
                      </div>
                      
                      <div className="p-2 min-h-[100px] max-h-[220px] overflow-y-auto bg-slate-50/50">
                        {forecast.items.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-center py-6">
                            <div>
                              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-2"><FolderOpen size={18} className="text-slate-400" /></div>
                              <p className="text-xs text-slate-400">Arrastra facturas aquí</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {forecast.items.map((item) => {
                              const typeInfo = PAYMENT_TYPES[item.type];
                              const ItemIcon = typeInfo.icon;
                              return (
                                <div key={item.id} className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors group">
                                  <div className="flex items-start gap-2">
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${item.status === "completed" ? "bg-emerald-100" : "bg-slate-100"}`}>
                                      {item.status === "completed" ? <CheckCircle2 size={12} className="text-emerald-600" /> : <ItemIcon size={12} className="text-slate-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <p className="text-xs font-medium text-slate-900 truncate font-mono">{item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description}</p>
                                        {forecast.status === "draft" && (
                                          <button onClick={() => handleRemovePaymentItem(forecast.id, item.id)} className="p-0.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-500 truncate">{item.supplier}</p>
                                      <div className="flex items-center justify-between mt-1">
                                        <span className={`text-xs ${item.status === "completed" ? "text-emerald-600" : "text-slate-400"}`}>{item.status === "completed" ? "✓ Completado" : "Pendiente"}</span>
                                        <span className="text-xs font-semibold text-slate-900 font-mono">{formatCurrency(item.partialAmount || item.amount)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      
                      <div className="px-4 py-3 border-t border-slate-100 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-slate-500">{forecast.items.length} pagos</span>
                          <span className="text-base font-bold text-slate-900 font-mono">{formatCurrency(forecast.totalAmount)} €</span>
                        </div>
                        {forecast.status !== "draft" && forecast.items.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{progress.completed}/{progress.total}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Previsión</th>
                      <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                      <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                      <th className="text-left px-4 py-4 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-slate-500 uppercase">Progreso</th>
                      <th className="text-right px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Importe</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredForecasts.map((forecast) => {
                      const statusConfig = getStatusConfig(forecast.status);
                      const typeConfig = getTypeConfig(forecast.type);
                      const progress = getCompletionProgress(forecast);
                      const StatusIcon = statusConfig.icon;
                      const TypeIcon = typeConfig.icon;
                      const isExpanded = expandedRows.has(forecast.id);
                      
                      return (
                        <React.Fragment key={forecast.id}>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                              <button onClick={() => toggleRowExpanded(forecast.id)} className="text-left hover:text-violet-600 flex items-center gap-2">
                                <ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                <div>
                                  <p className="font-semibold text-slate-900">{forecast.name}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{forecast.items.length} pagos</p>
                                </div>
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={14} className="text-slate-400" />
                                <span className="text-sm text-slate-700">{formatDate(forecast.paymentDate)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${typeConfig.bg} ${typeConfig.text}`}><TypeIcon size={12} />{typeConfig.label}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${statusConfig.bg} ${statusConfig.text}`}><StatusIcon size={12} />{statusConfig.label}</span>
                            </td>
                            <td className="px-4 py-4">
                              {forecast.items.length > 0 ? (
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress.percent}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-500">{progress.completed}/{progress.total}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-sm font-bold text-slate-900 font-mono">{formatCurrency(forecast.totalAmount)} €</span>
                            </td>
                            <td className="px-4 py-4">
                              <button onClick={() => setShowForecastDetail(forecast)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><Eye size={16} /></button>
                            </td>
                          </tr>
                          {isExpanded && forecast.items.length > 0 && (
                            <tr>
                              <td colSpan={7} className="bg-slate-50 px-6 py-4">
                                <div className="space-y-2">
                                  {forecast.items.map((item) => {
                                    const typeInfo = PAYMENT_TYPES[item.type];
                                    const ItemIcon = typeInfo.icon;
                                    return (
                                      <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.status === "completed" ? "bg-emerald-100" : "bg-slate-100"}`}>
                                            {item.status === "completed" ? <CheckCircle2 size={16} className="text-emerald-600" /> : <ItemIcon size={16} className="text-slate-500" />}
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-slate-900 font-mono">{item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description}</p>
                                            <p className="text-xs text-slate-500">{item.supplier}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <span className={`text-xs px-2 py-1 rounded-lg ${item.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status === "completed" ? "Completado" : "Pendiente"}</span>
                                          <span className="text-sm font-semibold text-slate-900 font-mono">{formatCurrency(item.partialAmount || item.amount)} €</span>
                                          {forecast.status === "pending" && item.status === "pending" && (
                                            <button onClick={() => setShowUploadReceipt({ forecast, item })} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Completar</button>
                                          )}
                                          {item.receiptUrl && (
                                            <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-slate-700"><ExternalLink size={14} /></a>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal crear previsión */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Nueva previsión de pago</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nombre de la previsión</label>
                <input type="text" value={newForecast.name} onChange={(e) => setNewForecast({ ...newForecast, name: e.target.value })} placeholder="Ej: Remesa Semana 23" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de pago</label>
                <input type="date" value={newForecast.paymentDate} onChange={(e) => setNewForecast({ ...newForecast, paymentDate: e.target.value })} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de pago</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setNewForecast({ ...newForecast, type: "remesa" })} className={`p-4 rounded-xl border-2 transition-all text-left ${newForecast.type === "remesa" ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <Landmark size={20} className={newForecast.type === "remesa" ? "text-indigo-600" : "text-slate-400"} />
                    <p className="font-semibold text-slate-900 mt-2">Remesa</p>
                    <p className="text-xs text-slate-500 mt-1">Pago bancario agrupado</p>
                  </button>
                  <button type="button" onClick={() => setNewForecast({ ...newForecast, type: "fuera_remesa" })} className={`p-4 rounded-xl border-2 transition-all text-left ${newForecast.type === "fuera_remesa" ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <Banknote size={20} className={newForecast.type === "fuera_remesa" ? "text-violet-600" : "text-slate-400"} />
                    <p className="font-semibold text-slate-900 mt-2">Fuera de remesa</p>
                    <p className="text-xs text-slate-500 mt-1">Transferencia individual</p>
                  </button>
                </div>
              </div>
              <button onClick={handleCreateForecast} disabled={!newForecast.name.trim() || !newForecast.paymentDate} className="w-full mt-4 px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors">Crear previsión</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal añadir pago */}
      {showAddPaymentModal && selectedForecastId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowAddPaymentModal(false); setSelectedForecastId(null); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Añadir pago</h3>
              <button onClick={() => { setShowAddPaymentModal(false); setSelectedForecastId(null); }} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PAYMENT_TYPES).map(([key, value]) => {
                    const Icon = value.icon;
                    return (
                      <button key={key} type="button" onClick={() => setNewPayment({ ...newPayment, type: key as PaymentType })} className={`p-3 rounded-xl border-2 transition-all text-left ${newPayment.type === key ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                        <Icon size={16} className={newPayment.type === key ? "text-slate-900" : "text-slate-400"} />
                        <p className="font-medium text-slate-900 text-sm mt-1">{value.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              {(newPayment.type === "invoice" || newPayment.type === "partial") && availableInvoices.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Seleccionar factura</label>
                  <select value={newPayment.invoiceId} onChange={(e) => { const inv = availableInvoices.find((i) => i.id === e.target.value); if (inv) { setNewPayment({ ...newPayment, invoiceId: inv.id, supplier: inv.supplier, description: inv.description, amount: inv.totalAmount }); } }} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900">
                    <option value="">Seleccionar...</option>
                    {availableInvoices.map((inv) => (<option key={inv.id} value={inv.id}>{inv.displayNumber || `FAC-${inv.number}`} · {inv.supplier} · {formatCurrency(inv.totalAmount)} €</option>))}
                  </select>
                </div>
              )}
              {newPayment.type === "partial" && newPayment.invoiceId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Importe parcial (de {formatCurrency(newPayment.amount)} €)</label>
                  <input type="number" value={newPayment.partialAmount || ""} onChange={(e) => setNewPayment({ ...newPayment, partialAmount: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                </div>
              )}
              {newPayment.type !== "invoice" && newPayment.type !== "partial" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Proveedor</label>
                    <input type="text" value={newPayment.supplier} onChange={(e) => setNewPayment({ ...newPayment, supplier: e.target.value })} placeholder="Nombre del proveedor" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                    <input type="text" value={newPayment.description} onChange={(e) => setNewPayment({ ...newPayment, description: e.target.value })} placeholder="Concepto del pago" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Importe</label>
                    <input type="number" value={newPayment.amount || ""} onChange={(e) => setNewPayment({ ...newPayment, amount: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
                  </div>
                </>
              )}
              <button onClick={() => handleAddPaymentToForecast(selectedForecastId)} disabled={(newPayment.type === "invoice" && !newPayment.invoiceId) || (newPayment.type === "partial" && (!newPayment.invoiceId || !newPayment.partialAmount)) || (newPayment.type !== "invoice" && newPayment.type !== "partial" && (!newPayment.supplier || !newPayment.amount))} className="w-full mt-4 px-4 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors">Añadir pago</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle previsión */}
      {showForecastDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForecastDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{showForecastDetail.name}</h3>
                  {(() => {
                    const config = getStatusConfig(showForecastDetail.status);
                    const Icon = config.icon;
                    return (<span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium ${config.bg} ${config.text}`}><Icon size={12} />{config.label}</span>);
                  })()}
                </div>
                <p className="text-sm text-slate-500">Creada por {showForecastDetail.createdByName} · {formatDate(showForecastDetail.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportForecastPDF(showForecastDetail)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" title="Exportar PDF"><Download size={18} /></button>
                <button onClick={() => setShowForecastDetail(null)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Fecha de pago</p>
                  <p className="text-lg font-bold text-slate-900">{formatDate(showForecastDetail.paymentDate)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Total</p>
                  <p className="text-lg font-bold text-slate-900 font-mono">{formatCurrency(showForecastDetail.totalAmount)} €</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Progreso</p>
                  {(() => {
                    const progress = getCompletionProgress(showForecastDetail);
                    return (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress.percent}%` }} />
                        </div>
                        <span className="text-sm font-bold text-slate-900">{progress.completed}/{progress.total}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-700 uppercase mb-3">Pagos ({showForecastDetail.items.length})</h4>
                {showForecastDetail.items.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-xl">
                    <FolderOpen size={24} className="text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Sin pagos añadidos</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {showForecastDetail.items.map((item) => {
                      const typeInfo = PAYMENT_TYPES[item.type];
                      const ItemIcon = typeInfo.icon;
                      return (
                        <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-start gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.status === "completed" ? "bg-emerald-100" : "bg-slate-100"}`}>
                              {item.status === "completed" ? <CheckCircle2 size={18} className="text-emerald-600" /> : <ItemIcon size={18} className="text-slate-500" />}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold text-slate-900 font-mono">{item.invoiceNumber ? `FAC-${item.invoiceNumber}` : item.description}</p>
                                  <p className="text-sm text-slate-600">{item.supplier}</p>
                                  <p className="text-xs text-slate-400 mt-1">{typeInfo.label} · Añadido por {item.addedByName}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-bold text-slate-900 font-mono">{formatCurrency(item.partialAmount || item.amount)} €</p>
                                  <span className={`text-xs px-2 py-1 rounded-lg ${item.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{item.status === "completed" ? "Completado" : "Pendiente"}</span>
                                </div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                {item.status === "completed" && item.receiptUrl ? (
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm text-emerald-700"><FileCheck size={14} /><span>{item.receiptName || "Justificante"}</span></div>
                                    <a href={item.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1">Ver <ExternalLink size={12} /></a>
                                  </div>
                                ) : item.status === "completed" ? (
                                  <p className="text-xs text-emerald-600">✓ Completado el {formatDate(item.completedAt!)} por {item.completedByName}</p>
                                ) : showForecastDetail.status === "pending" ? (
                                  <button onClick={() => setShowUploadReceipt({ forecast: showForecastDetail, item })} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"><Upload size={14} />Subir justificante</button>
                                ) : (
                                  <p className="text-xs text-slate-400">Pendiente de envío</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              {showForecastDetail.status === "draft" && showForecastDetail.items.length > 0 && (
                <button onClick={() => { handleSendForecast(showForecastDetail.id); setShowForecastDetail(null); }} className="px-4 py-2 text-sm bg-amber-500 text-white hover:bg-amber-600 rounded-lg flex items-center gap-2"><Send size={14} />Enviar</button>
              )}
              {showForecastDetail.status === "draft" && (
                <button onClick={() => { setSelectedForecastId(showForecastDetail.id); setShowAddPaymentModal(true); setShowForecastDetail(null); }} className="px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800 rounded-lg flex items-center gap-2"><Plus size={14} />Añadir pago</button>
              )}
              <button onClick={() => setShowForecastDetail(null)} className="px-4 py-2 text-sm border border-slate-200 text-slate-700 hover:bg-white rounded-lg">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal completar pago */}
      {showUploadReceipt && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowUploadReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Completar pago</h3>
              <button onClick={() => setShowUploadReceipt(null)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-6">
              <div className="mb-6 p-4 bg-slate-50 rounded-xl">
                <p className="text-xs text-slate-500 mb-1">Pago</p>
                <p className="font-semibold text-slate-900 font-mono">{showUploadReceipt.item.invoiceNumber ? `FAC-${showUploadReceipt.item.invoiceNumber}` : showUploadReceipt.item.description}</p>
                <p className="text-sm text-slate-600">{showUploadReceipt.item.supplier}</p>
                <p className="text-lg font-bold text-slate-900 mt-2 font-mono">{formatCurrency(showUploadReceipt.item.partialAmount || showUploadReceipt.item.amount)} €</p>
              </div>
              <button onClick={() => handleCompletePaymentItem(showUploadReceipt.forecast.id, showUploadReceipt.item.id)} className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"><CheckCircle2 size={18} />Marcar como completado</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
